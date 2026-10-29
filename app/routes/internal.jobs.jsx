import { json } from "@remix-run/node";
import { safeEqual } from "../security.server";
import prisma from "../db.server";
import { autoPublishEligibleReviews } from "../reviews.server";

async function run(request) {
  if (
    !process.env.CRON_SECRET ||
    !safeEqual(
      request.headers.get("authorization") || "",
      `Bearer ${process.env.CRON_SECRET}`,
    )
  )
    return json({ error: "Unauthorized" }, { status: 401 });
  const publishing = await prisma.reviewSettings.findMany({
    where: { autoPublishThreshold: { not: "disabled" } },
    select: { shop: true, autoPublishThreshold: true },
  });
  for (const settings of publishing)
    await autoPublishEligibleReviews(
      settings.shop,
      settings.autoPublishThreshold,
    );
  await prisma.review.deleteMany({
    where: { deletedAt: { lt: new Date(Date.now() - 30 * 86400000) } },
  });
  await prisma.storefrontRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await prisma.reviewVote.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 365 * 86400000) } },
  });
  return json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
export const loader = ({ request }) => run(request);
export const action = ({ request }) => run(request);
