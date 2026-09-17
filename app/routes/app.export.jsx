import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const COLUMNS = ["product_id", "product_name", "reviewer", "email", "rating", "body", "image_url"];

function toCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const reviews = await prisma.review.findMany({
    where: { shop: session.shop, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { productId: true, productName: true, reviewer: true, email: true, rating: true, body: true, imageUrl: true },
  });

  const rows = reviews.map((review) => [
    review.productId,
    review.productName,
    review.reviewer,
    review.email,
    review.rating,
    review.body,
    review.imageUrl,
  ]);

  const csv = [COLUMNS, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reviewloom-reviews.csv"',
    },
  });
};
