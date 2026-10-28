export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
export const PAGE_SIZE = 20;

export function inboxQuery(searchParams) {
  const status = REVIEW_STATUSES.includes(searchParams.get("status"))
    ? searchParams.get("status")
    : "ALL";
  const q = (searchParams.get("q") || "").trim().slice(0, 150);
  const product = (searchParams.get("product") || "").trim().slice(0, 150);
  const rating = Number(searchParams.get("rating"));
  const days = [7, 30, 90].includes(Number(searchParams.get("days")))
    ? Number(searchParams.get("days"))
    : null;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(searchParams.get("page")) || 1)),
  );
  return {
    status,
    q,
    product,
    rating:
      Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    days,
    page,
  };
}

export function inboxWhere(shop, filters, now = new Date()) {
  if (!shop) throw new Error("A shop is required.");
  return {
    shop,
    deletedAt: null,
    ...(filters.status !== "ALL" ? { status: filters.status } : {}),
    ...(filters.rating ? { rating: filters.rating } : {}),
    ...(filters.product
      ? { productName: { contains: filters.product, mode: "insensitive" } }
      : {}),
    ...(filters.days
      ? {
          createdAt: { gte: new Date(now.getTime() - filters.days * 86400000) },
        }
      : {}),
    ...(filters.q
      ? {
          OR: ["reviewer", "body", "productName"].map((field) => ({
            [field]: { contains: filters.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
}

// A single transaction verifies every selected record before making any changes.
export async function moderateReviews(db, { shop, ids, intent, status }) {
  const selected = [
    ...new Set(ids.filter((id) => typeof id === "string" && id.length > 0)),
  ];
  if (!shop || !selected.length || selected.length > 100)
    return { error: "Select between 1 and 100 reviews.", code: 400 };
  if (
    !["moderate", "delete", "restore", "delete-forever"].includes(intent) ||
    (intent === "moderate" && !REVIEW_STATUSES.includes(status))
  ) {
    return { error: "Choose a valid review action.", code: 400 };
  }
  return db.$transaction(async (tx) => {
    const where = {
      shop,
      id: { in: selected },
      deletedAt:
        intent === "restore" || intent === "delete-forever"
          ? { not: null }
          : null,
    };
    const records = await tx.review.findMany({ where, select: { id: true } });
    if (records.length !== selected.length)
      return {
        error: "One or more reviews are unavailable. Refresh and try again.",
        code: 404,
      };
    if (intent === "delete-forever") {
      await tx.reviewEvent.deleteMany({
        where: { shop, reviewId: { in: selected } },
      });
      await tx.review.deleteMany({ where });
    } else {
      // Ordinary deletion always goes through recoverable trash.
      const data =
        intent === "delete"
          ? { deletedAt: new Date() }
          : intent === "restore"
            ? { deletedAt: null }
            : { status };
      await tx.review.updateMany({ where, data });
      await tx.reviewEvent.createMany({
        data: selected.map((reviewId) => ({
          shop,
          reviewId,
          action: intent === "moderate" ? status : intent.toUpperCase(),
        })),
      });
    }
    return {
      ok: true,
      message: `${selected.length} review${selected.length === 1 ? "" : "s"} ${intent === "moderate" ? (status === "APPROVED" ? "published" : status === "REJECTED" ? "rejected" : "moved to pending") : intent === "restore" ? "restored" : intent === "delete" ? "moved to trash" : "permanently deleted"}.`,
    };
  });
}
