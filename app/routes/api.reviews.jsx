import { json } from "@remix-run/node";
import prisma from "../db.server";
import { autoPublishEligibleReviews } from "../reviews.server";
import { createReviewDiscountCode } from "../discounts.server";
import {
  storefrontContext,
  limitStorefront,
  visitorKey,
  textField,
  httpsUrl,
  emailAddress,
} from "../security.server";
import { readRequestToken } from "../request-tokens";

const SORTS = {
  relevance: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
  newest: [{ createdAt: "desc" }],
  highest: [{ rating: "desc" }, { createdAt: "desc" }],
  lowest: [{ rating: "asc" }, { createdAt: "desc" }],
};
const fail = (error) => {
  if (error instanceof Response) return error;
  console.error("[api.reviews] request failed", {
    name: error.name,
    code: error.code,
  });
  return json(
    { error: "Reviews are temporarily unavailable. Please try again." },
    { status: 500 },
  );
};

export const loader = async ({ request }) => {
  try {
    const { shop, settings, customerId } = await storefrontContext(request);
    const url = new URL(request.url);
    const productId = url.searchParams.get("product_id");
    if (productId && productId.length > 100)
      return json({ error: "Invalid product." }, { status: 400 });
    const limit = Math.min(
      24,
      Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 10)),
    );
    const page = Math.min(
      10000,
      Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1)),
    );
    const star = [1, 2, 3, 4, 5].includes(Number(url.searchParams.get("star")))
      ? Number(url.searchParams.get("star"))
      : null;
    const sort = Object.hasOwn(SORTS, url.searchParams.get("sort"))
      ? url.searchParams.get("sort")
      : "relevance";
    await autoPublishEligibleReviews(shop, settings.autoPublishThreshold);
    if (!settings.widgetSeenAt)
      await prisma.reviewSettings.updateMany({
        where: { shop, widgetSeenAt: null },
        data: { widgetSeenAt: new Date() },
      });
    const baseWhere = {
      shop,
      ...(productId ? { productId } : {}),
      status: "APPROVED",
      deletedAt: null,
    };
    const where = { ...baseWhere, ...(star ? { rating: star } : {}) };
    const [ratingCounts, filteredCount, reviews] = await Promise.all([
      prisma.review.groupBy({
        by: ["rating"],
        where: baseWhere,
        _count: { rating: true },
      }),
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        orderBy: [...SORTS[sort], { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          reviewer: true,
          rating: true,
          body: true,
          imageUrl: true,
          verifiedPurchase: true,
          productName: true,
          createdAt: true,
          helpfulCount: true,
          notHelpfulCount: true,
          images: { orderBy: { position: "asc" }, select: { url: true } },
        },
      }),
    ]);
    const count = ratingCounts.reduce((sum, row) => sum + row._count.rating, 0);
    const sum = ratingCounts.reduce(
      (total, row) => total + row.rating * row._count.rating,
      0,
    );
    return json(
      {
        average: count ? Number((sum / count).toFixed(1)) : 0,
        count,
        filteredCount,
        page,
        totalPages: Math.max(1, Math.ceil(filteredCount / limit)),
        sort,
        star,
        reviews: reviews.map((review) => ({
          ...review,
          images: [review.imageUrl, ...review.images.map((i) => i.url)].filter(
            (u) => u && httpsUrl(u),
          ),
        })),
        distribution: [5, 4, 3, 2, 1].map((stars) => ({
          stars,
          count:
            ratingCounts.find((r) => r.rating === stars)?._count.rating || 0,
        })),
        settings: {
          accentColor: settings.accentColor,
          starStyle: settings.starStyle,
          alignment: settings.alignment,
          reviewFormOn:
            settings.reviewFormOn &&
            (settings.customerEligibility !== "loggedIn" ||
              Boolean(customerId)),
          customerEligibility: settings.customerEligibility,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
};

export const action = async ({ request }) => {
  try {
    const { shop, settings, customerId } = await storefrontContext(request);
    const url = new URL(request.url);
    const data = await request.formData();
    const productId = url.searchParams.get("product_id");
    if (!productId || productId.length > 100)
      return json({ error: "A product is required." }, { status: 400 });
    if (data.get("intent") === "vote") {
      await limitStorefront(request, shop, "vote", 60);
      const reviewId = textField(data, "review_id", 100, true);
      const vote = data.get("vote");
      if (!["up", "down"].includes(vote))
        return json({ error: "Invalid vote." }, { status: 400 });
      const where = {
        id: reviewId,
        shop,
        productId,
        status: "APPROVED",
        deletedAt: null,
      };
      const review = await prisma.review.findFirst({
        where,
        select: { id: true },
      });
      if (!review) return json({ error: "Review not found." }, { status: 404 });
      try {
        const result = await prisma.$transaction(async (tx) => {
          await tx.reviewVote.create({
            data: { reviewId, voterKey: visitorKey(request, shop) },
          });
          return tx.review.update({
            where,
            data:
              vote === "up"
                ? { helpfulCount: { increment: 1 } }
                : { notHelpfulCount: { increment: 1 } },
            select: { helpfulCount: true, notHelpfulCount: true },
          });
        });
        return json(result);
      } catch (error) {
        if (error.code === "P2002")
          return json(
            { error: "You have already voted on this review." },
            { status: 409 },
          );
        throw error;
      }
    }
    await limitStorefront(request, shop, "review");
    if (!settings.reviewFormOn)
      return json({ error: "Review collection is paused." }, { status: 403 });
    if (settings.customerEligibility === "loggedIn" && !customerId)
      return json(
        { error: "Please log in to leave a review." },
        { status: 403 },
      );
    const tokenValue = String(data.get("request_token") || "");
    const token = readRequestToken(tokenValue, shop);
    const invitation = token
      ? await prisma.reviewRequest.findFirst({
          where: {
            id: token.id,
            shop,
            productId,
            completedAt: null,
            cancelledAt: null,
            emailId: { not: null },
          },
        })
      : null;
    if (tokenValue && !invitation)
      return json(
        {
          error:
            "This review link is expired, already used, or belongs to a different product.",
        },
        { status: 400 },
      );
    if (
      settings.customerEligibility === "verifiedBuyer" &&
      !invitation?.orderVerified
    )
      return json(
        {
          error:
            "Use the review link sent after your purchase to leave a verified review.",
        },
        { status: 403 },
      );
    const rating = Number(data.get("rating"));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
    const reviewer = textField(data, "reviewer", 100, true);
    const body = textField(data, "body", 5000, true);
    const email = invitation?.email || textField(data, "email", 254);
    if (email && !emailAddress(email))
      return json({ error: "Enter a valid email address." }, { status: 400 });
    const images = data
      .getAll("image_url")
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (
      images.length > 6 ||
      images.some((v) => v.length > 2048 || !httpsUrl(v))
    )
      return json(
        { error: "Use up to six valid HTTPS photo URLs." },
        { status: 400 },
      );
    const review = await prisma.$transaction(async (tx) => {
      if (invitation) {
        const claimed = await tx.reviewRequest.updateMany({
          where: {
            id: invitation.id,
            shop,
            completedAt: null,
            cancelledAt: null,
          },
          data: { completedAt: new Date() },
        });
        if (!claimed.count)
          throw new Response("This review link has already been used.", {
            status: 409,
          });
      }
      return tx.review.create({
        data: {
          shop,
          productId,
          productName:
            invitation?.productName ||
            textField(data, "product_name", 300) ||
            "Product review",
          reviewer,
          email: email || null,
          rating,
          body,
          status: "PENDING",
          verifiedPurchase: Boolean(invitation?.orderVerified),
          requestId: invitation?.id || null,
          source: invitation ? "request" : "storefront",
          images: {
            create: images.map((image, position) => ({
              url: httpsUrl(image),
              position,
            })),
          },
        },
      });
    });
    let discountCode = null;
    const percent = Number(settings.reviewDiscountPercent);
    if (percent > 0) {
      try {
        discountCode = await createReviewDiscountCode(shop, percent);
        await prisma.review.update({
          where: { id: review.id, shop },
          data: { discountCode },
        });
      } catch (error) {
        console.error("[review.discount] failed", { code: error.code });
      }
    }
    return json(
      { review: { id: review.id, status: review.status }, discountCode },
      { status: 201 },
    );
  } catch (error) {
    return fail(error);
  }
};
