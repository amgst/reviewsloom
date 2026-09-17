import prisma from "./db.server";

const AUTO_PUBLISH_DAYS = 14;
const TRASH_RETENTION_DAYS = 30;

const THRESHOLD_FILTERS = {
  "5stars": { rating: 5 },
  "4plus": { rating: { gte: 4 } },
  all: {},
};

// No background job runner exists yet, so eligible reviews are promoted lazily
// whenever the admin or storefront reads reviews for a shop.
export async function autoPublishEligibleReviews(shop) {
  const settings = await prisma.reviewSettings.findUnique({ where: { shop }, select: { autoPublishThreshold: true } });
  const filter = settings && THRESHOLD_FILTERS[settings.autoPublishThreshold];
  if (!filter) return;
  const cutoff = new Date(Date.now() - AUTO_PUBLISH_DAYS * 24 * 60 * 60 * 1000);
  await prisma.review.updateMany({
    where: { shop, status: "PENDING", deletedAt: null, createdAt: { lte: cutoff }, ...filter },
    data: { status: "APPROVED" },
  });
}

// Same lazy-sweep approach as auto-publish: purge trash past its retention
// window whenever the trash page is viewed, instead of running a real cron.
export async function purgeExpiredTrash(shop) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.review.deleteMany({ where: { shop, deletedAt: { lte: cutoff } } });
}
