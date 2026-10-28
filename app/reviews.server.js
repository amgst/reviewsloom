import prisma from "./db.server";

const AUTO_PUBLISH_DAYS = 14;
const TRASH_RETENTION_DAYS = 30;

const THRESHOLD_FILTERS = {
  "5stars": { rating: 5 },
  "4plus": { rating: { gte: 4 } },
  all: {},
};

// Run by the worker and when the admin or storefront reads reviews. Pass `threshold`
// when the caller already has it, to avoid an extra settings lookup here.
// Returns how many reviews were promoted, so callers can skip re-reading when
// nothing changed.
export async function autoPublishEligibleReviews(shop, threshold) {
  if (threshold === undefined) {
    const settings = await prisma.reviewSettings.findUnique({
      where: { shop },
      select: { autoPublishThreshold: true },
    });
    threshold = settings?.autoPublishThreshold;
  }
  const filter = threshold && THRESHOLD_FILTERS[threshold];
  if (!filter) return 0;
  const cutoff = new Date(Date.now() - AUTO_PUBLISH_DAYS * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const published = await tx.review.updateManyAndReturn({
      where: {
        shop,
        status: "PENDING",
        deletedAt: null,
        createdAt: { lte: cutoff },
        ...filter,
      },
      data: { status: "APPROVED" },
      select: { id: true },
    });
    if (published.length)
      await tx.reviewEvent.createMany({
        data: published.map(({ id }) => ({
          shop,
          reviewId: id,
          action: "AUTO_PUBLISHED",
        })),
      });
    return published.length;
  });
}

// The worker also performs this retention sweep when nobody visits the trash.
export async function purgeExpiredTrash(shop) {
  const cutoff = new Date(
    Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.review.deleteMany({
    where: { shop, deletedAt: { lte: cutoff } },
  });
}
