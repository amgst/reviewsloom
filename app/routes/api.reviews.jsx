import { json } from "@remix-run/node";
import prisma from "../db.server";

const SORTS = {
  relevance: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
  newest: [{ createdAt: "desc" }],
  highest: [{ rating: "desc" }, { createdAt: "desc" }],
  lowest: [{ rating: "asc" }, { createdAt: "desc" }],
};

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    const shop = url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 10, 24);
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
    const star = Number(url.searchParams.get("star")) || null;
    const sort = SORTS[url.searchParams.get("sort")] ? url.searchParams.get("sort") : "relevance";

    const baseWhere = { ...(shop ? { shop } : {}), ...(productId ? { productId } : {}), status: "APPROVED" };
    const pageWhere = { ...baseWhere, ...(star ? { rating: star } : {}) };

    const [ratingCounts, filteredCount, reviews, reviewSettings] = await Promise.all([
      prisma.review.groupBy({ by: ["rating"], where: baseWhere, _count: { rating: true } }),
      prisma.review.count({ where: pageWhere }),
      prisma.review.findMany({
        where: pageWhere,
        orderBy: SORTS[sort],
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, reviewer: true, rating: true, body: true, imageUrl: true, productName: true, createdAt: true, helpfulCount: true, notHelpfulCount: true, images: { orderBy: { position: "asc" }, select: { url: true } } },
      }),
      shop ? prisma.reviewSettings.findUnique({ where: { shop }, select: { accentColor: true, starStyle: true, reviewFormOn: true, alignment: true } }) : null,
    ]);

    const count = ratingCounts.reduce((sum, row) => sum + row._count.rating, 0);
    const ratingSum = ratingCounts.reduce((sum, row) => sum + row.rating * row._count.rating, 0);
    const average = count ? ratingSum / count : 0;
    const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: ratingCounts.find((row) => row.rating === stars)?._count.rating || 0 }));
    const settings = { accentColor: "#D95D39", starStyle: "solid", reviewFormOn: true, alignment: "center", ...reviewSettings };
    const reviewsOut = reviews.map((review) => ({ ...review, images: [review.imageUrl, ...review.images.map((image) => image.url)].filter(Boolean) }));

    return json({
      average: Number(average.toFixed(1)),
      count,
      filteredCount,
      page,
      totalPages: Math.max(Math.ceil(filteredCount / limit), 1),
      sort,
      star,
      reviews: reviewsOut,
      distribution,
      settings,
    }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[api.reviews] loader failed", error);
    return json({ average: 0, count: 0, filteredCount: 0, page: 1, totalPages: 1, reviews: [], distribution: [], error: "Reviews are temporarily unavailable." }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
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
    const imageUrls = formData.getAll("image_url").map((value) => String(value).trim()).filter(Boolean).slice(0, 6);
    const review = await prisma.review.create({ data: {
      shop: url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || "unknown",
      productId: url.searchParams.get("product_id"),
      productName: formData.get("product_name") || "Product review",
      reviewer: formData.get("reviewer"),
      email: formData.get("email") || null,
      rating,
      body: formData.get("body"),
      status: "PENDING",
      images: imageUrls.length ? { create: imageUrls.map((imgUrl, position) => ({ url: imgUrl, position })) } : undefined,
    } });
    return json({ review: { id: review.id, status: review.status } }, { status: 201 });
  } catch (error) {
    console.error("[api.reviews] action failed", error);
    return json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
};
