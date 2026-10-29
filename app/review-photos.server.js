import { randomUUID } from "node:crypto";
import { unauthenticated } from "./shopify.server";

export const PHOTO_LIMIT = 3;
export const PHOTO_BYTES = 1_000_000;

export const STAGE_PHOTOS = `mutation StageReviewPhotos($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;
export const CREATE_PHOTOS = `mutation CreateReviewPhotos($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files { id fileStatus }
    userErrors { field message }
  }
}`;
export const READ_PHOTOS = `query ReviewPhotoStatus($ids: [ID!]!) {
  nodes(ids: $ids) { ... on MediaImage { id fileStatus image { url } } }
}`;
export const DELETE_PHOTOS = `mutation DeleteReviewPhotos($ids: [ID!]!) {
  fileDelete(fileIds: $ids) { deletedFileIds userErrors { field message } }
}`;

function invalid(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

// Bound multipart parsing too, rather than reading unbounded photo bodies into memory.
export async function reviewFormData(request) {
  const max = 3_500_000;
  if (Number(request.headers.get("content-length")) > max)
    throw invalid("Use up to 3 photos, no larger than 1 MB each.");
  const reader = request.body?.getReader();
  if (!reader) throw invalid("The review form is empty.");
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw invalid("Use up to 3 photos, no larger than 1 MB each.");
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Blob(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw invalid("The review form could not be read. Please try again.");
  }
}

export async function validateReviewPhotos(files) {
  const selected = files.filter(
    (file) => typeof file !== "string" && file.size > 0,
  );
  if (
    files.some((file) => typeof file === "string") ||
    selected.length > PHOTO_LIMIT
  )
    throw invalid("Choose up to 3 JPEG, PNG or WebP photos.");
  const result = [];
  for (const file of selected) {
    if (file.size > PHOTO_BYTES)
      throw invalid("Each photo must be 1 MB or smaller.");
    const bytes = Buffer.from(await file.slice(0, 12).arrayBuffer());
    const format =
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? ["image/jpeg", "jpg"]
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? ["image/png", "png"]
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
              bytes.toString("ascii", 8, 12) === "WEBP"
            ? ["image/webp", "webp"]
            : null;
    if (!format || (file.type && file.type !== format[0]))
      throw invalid(
        "Use JPEG, PNG or WebP photos. SVG and other files are not supported.",
      );
    result.push({
      file,
      mimeType: format[0],
      filename: `reviewloom-${randomUUID()}.${format[1]}`,
    });
  }
  return result;
}

async function graphql(admin, query, variables, key) {
  const response = await admin.graphql(query, { variables });
  const result = await response.json();
  const value = result.data?.[key];
  if (result.errors?.length || !value || value.userErrors?.length)
    throw new Error("Shopify could not process the review photos.");
  return value;
}

export async function deleteUploadedPhotos(shop, ids) {
  if (!ids.length) return;
  const { admin } = await unauthenticated.admin(shop);
  await graphql(admin, DELETE_PHOTOS, { ids }, "fileDelete");
}

export async function uploadReviewPhotos(shop, photos) {
  if (!photos.length) return [];
  const { admin, session } = await unauthenticated.admin(shop);
  if (!session?.scope?.split(",").includes("write_files"))
    throw invalid(
      "Photo uploads are not enabled yet. The store owner must approve the app's Files permission. You can submit a review without photos.",
    );
  let ids = [];
  try {
    const staged = await graphql(
      admin,
      STAGE_PHOTOS,
      {
        input: photos.map(({ file, mimeType, filename }) => ({
          filename,
          mimeType,
          resource: "IMAGE",
          httpMethod: "POST",
          fileSize: String(file.size),
        })),
      },
      "stagedUploadsCreate",
    );
    if (staged.stagedTargets?.length !== photos.length)
      throw new Error("Missing upload targets.");
    // Wait for every upload to finish, even when one fails, before cleanup.
    const uploads = await Promise.allSettled(
      staged.stagedTargets.map(async (target, index) => {
        const body = new FormData();
        for (const { name, value } of target.parameters)
          body.append(name, value);
        body.append("file", photos[index].file, photos[index].filename);
        const response = await fetch(target.url, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Photo transfer failed.");
      }),
    );
    if (uploads.some((upload) => upload.status === "rejected"))
      throw new Error("Photo transfer failed.");
    const response = await admin.graphql(CREATE_PHOTOS, {
      variables: {
        files: staged.stagedTargets.map((target) => ({
          originalSource: target.resourceUrl,
          contentType: "IMAGE",
          alt: "Customer-submitted review photo",
        })),
      },
    });
    const created = await response.json();
    ids = (created.data?.fileCreate?.files || []).map((file) => file.id);
    if (
      created.errors?.length ||
      created.data?.fileCreate?.userErrors?.length ||
      ids.length !== photos.length
    )
      throw new Error("Photo registration failed.");
    for (let attempt = 0; attempt < 10; attempt++) {
      const files = await graphql(admin, READ_PHOTOS, { ids }, "nodes");
      if (files.some((file) => !file || file.fileStatus === "FAILED"))
        throw new Error("Photo processing failed.");
      if (files.every((file) => file.fileStatus === "READY" && file.image?.url))
        return ids.map((id) => ({
          shopifyFileId: id,
          url: files.find((file) => file.id === id).image.url,
        }));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Photo processing timed out.");
  } catch {
    try {
      await deleteUploadedPhotos(shop, ids);
    } catch {
      console.error(
        "[review.photos] failed-upload cleanup requires attention",
        { shop, ids },
      );
    }
    throw invalid(
      "Your photos could not be saved to Shopify. Try again, or submit the review without photos.",
    );
  }
}
