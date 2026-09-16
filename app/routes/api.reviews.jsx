import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 12, 24);
    const [reviews, reviewSettings] = await Promise.all([
      prisma.review.findMany({ where: { ...(shop ? { shop } : {}), ...(productId ? { productId } : {}), status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, reviewer: true, rating: true, body: true, imageUrl: true, productName: true, createdAt: true, helpfulCount: true, notHelpfulCount: true } }),
      shop ? prisma.reviewSettings.findUnique({ where: { shop }, select: { accentColor: true, starStyle: true, reviewFormOn: true } }) : null,
    ]);
    const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((review) => review.rating === stars).length }));
    const settings = { accentColor: "#D95D39", starStyle: "solid", reviewFormOn: true, ...reviewSettings };
    return json({ average: Number(average.toFixed(1)), count: reviews.length, reviews, distribution, settings }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[api.reviews] loader failed", error);
    return json({ average: 0, count: 0, reviews: [], error: "Reviews are temporarily unavailable." }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
};

export const action = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const formData = await request.formData();

    if (formData.get("intent") === "vote") {
      const reviewId = formData.get("review_id");
      const vote = formData.get("vote");
      if (!reviewId || (vote !== "up" && vote !== "down")) return json({ error: "Invalid vote." }, { status: 400 });
      const review = await prisma.review.update({
        where: { id: reviewId },
        data: vote === "up" ? { helpfulCount: { increment: 1 } } : { notHelpfulCount: { increment: 1 } },
        select: { helpfulCount: true, notHelpfulCount: true },
      });
      return json({ helpfulCount: review.helpfulCount, notHelpfulCount: review.notHelpfulCount });
    }

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
    console.error("[api.reviews] action failed", error);
    return json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
