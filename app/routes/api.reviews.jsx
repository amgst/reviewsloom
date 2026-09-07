import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 12, 24);
    const reviews = await prisma.review.findMany({ where: { ...(shop ? { shop } : {}), ...(productId ? { productId } : {}), status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: limit, select: { reviewer: true, rating: true, body: true, imageUrl: true, productName: true, createdAt: true } });
    const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
    return json({ average: Number(average.toFixed(1)), count: reviews.length, reviews }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    return json({ average: 0, count: 0, reviews: [], error: "Reviews are temporarily unavailable." }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
};

export const action = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const formData = await request.formData();
    const rating = Number(formData.get("rating"));
    if (!url.searchParams.get("product_id") || rating < 1 || rating > 5 || !formData.get("body") || !formData.get("reviewer")) {
      return json({ error: "A product, rating, name, and review are required." }, { status: 400 });
    }
    const review = await prisma.review.create({ data: {
      shop: url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "unknown",
      productId: url.searchParams.get("product_id"),
      productName: formData.get("product_name") || "Product review",
      reviewer: formData.get("reviewer"),
      email: formData.get("email") || null,
      rating,
      body: formData.get("body"),
      imageUrl: formData.get("image_url") || null,
      status: "PENDING",
    } });
    return json({ review: { id: review.id, status: review.status } }, { status: 201 });
  } catch (error) {
    return json({ error: "Something went wrong submitting your review. Please try again." }, { status: 500 });
  }
};
