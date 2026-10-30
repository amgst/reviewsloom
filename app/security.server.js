import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "./db.server";
import { authenticate } from "./shopify.server";

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function storefrontContext(request) {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop))
    throw new Response("Invalid shop.", { status: 400 });
  if (!session || session.shop !== shop)
    throw new Response(
      "Store authorization is unavailable. Reopen the app from Shopify admin.",
      { status: 401 },
    );
  const settings = await prisma.reviewSettings.findUnique({ where: { shop } });
  if (!settings) throw new Response("Store not configured.", { status: 404 });
  return {
    shop,
    settings,
  };
}

export function visitorKey(request, shop) {
  // Shopify forwards the visitor address on app proxy requests. Hash it before storage.
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret)
    throw new Response("Storefront service is not configured.", {
      status: 503,
    });
  return createHmac("sha256", secret)
    .update(`${shop}:${address}`)
    .digest("hex");
}

export async function limitStorefront(request, shop, action, max = 10) {
  const window = Math.floor(Date.now() / 3600000);
  const key = `${action}:${visitorKey(request, shop)}:${window}`;
  const row = await prisma.storefrontRateLimit.upsert({
    where: { key },
    create: { key, expiresAt: new Date((window + 1) * 3600000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max)
    throw new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": "3600" },
    });
}

// A shared budget prevents rotating visitor addresses from causing unbounded
// Shopify file/discount creation for one merchant. Limits are per UTC day.
export async function limitShopAction(shop, action, max = 100) {
  const day = Math.floor(Date.now() / 86400000);
  const key = `shop:${shop}:${action}:${day}`;
  const row = await prisma.storefrontRateLimit.upsert({
    where: { key },
    create: { key, expiresAt: new Date((day + 1) * 86400000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max)
    throw new Response(
      JSON.stringify({
        error:
          "This store's daily review submission limit has been reached. Please try again tomorrow.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.ceil(((day + 1) * 86400000 - Date.now()) / 1000),
          ),
        },
      },
    );
}

export async function boundedFormData(request, max = 64_000) {
  const reject = () =>
    new Response("Form data is too large or invalid.", { status: 413 });
  if (Number(request.headers.get("content-length")) > max) throw reject();
  const reader = request.body?.getReader();
  if (!reader) throw new Response("Form data is required.", { status: 400 });
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw reject();
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Blob(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
  } catch {
    throw new Response("Form data could not be read.", { status: 400 });
  }
}

export function textField(data, key, max, required = false) {
  const field = data.get(key);
  if (field !== null && typeof field !== "string")
    throw new Response(`Invalid ${key.replaceAll("_", " ")}.`, { status: 400 });
  const value = (field || "").trim();
  if ((required && !value) || value.length > max)
    throw new Response(`Invalid ${key.replaceAll("_", " ")}.`, { status: 400 });
  return value;
}

export function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
