import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { toCsvValue } from "../csv";

const COLUMNS = [
  "product_id",
  "product_name",
  "reviewer",
  "email",
  "rating",
  "body",
  "image_url",
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const encoder = new TextEncoder();
  let cursor = null;
  let first = true;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (first) {
          controller.enqueue(encoder.encode(COLUMNS.join(",") + "\n"));
          first = false;
        }
        const reviews = await prisma.review.findMany({
          where: { shop: session.shop, deletedAt: null },
          orderBy: { id: "asc" },
          take: 250,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            productId: true,
            productName: true,
            reviewer: true,
            email: true,
            rating: true,
            body: true,
            imageUrl: true,
          },
        });
        if (!reviews.length) {
          controller.close();
          return;
        }
        cursor = reviews[reviews.length - 1].id;
        const chunk =
          reviews
            .map((r) =>
              [
                r.productId,
                r.productName,
                r.reviewer,
                r.email,
                r.rating,
                r.body,
                r.imageUrl,
              ]
                .map(toCsvValue)
                .join(","),
            )
            .join("\n") + "\n";
        controller.enqueue(encoder.encode(chunk));
        if (reviews.length < 250) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="reviewloom-reviews.csv"',
    },
  });
};
