import prisma from "./db.server";
import { sendReviewRequestEmail } from "./resend.server";
import { signRequest } from "./request-tokens";
import { unauthenticated } from "./shopify.server";

const MAX_ATTEMPTS = 4;

export async function processRequestQueue(limit = 10) {
  const now = new Date();
  await prisma.reviewRequest.updateMany({
    where: {
      status: { in: ["PROCESSING", "QUEUED"] },
      attempts: { gte: MAX_ATTEMPTS },
      lockedAt: { lt: new Date(Date.now() - 10 * 60000) },
    },
    data: {
      status: "FAILED",
      lockedAt: null,
      error:
        "Delivery interrupted on its final attempt. Check provider activity before retrying.",
    },
  });
  // Recover jobs interrupted by a process restart. Provider idempotency handles a replay.
  await prisma.reviewRequest.updateMany({
    where: {
      status: "PROCESSING",
      lockedAt: { lt: new Date(Date.now() - 10 * 60000) },
    },
    data: { status: "QUEUED", lockedAt: null },
  });
  const jobs = await prisma.reviewRequest.findMany({
    where: {
      status: "QUEUED",
      scheduledAt: { lte: now },
      cancelledAt: null,
      completedAt: null,
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
  const result = { sent: 0, failed: 0, cancelled: 0 };
  for (const job of jobs) {
    const claimed = await prisma.reviewRequest.updateMany({
      where: {
        id: job.id,
        status: "QUEUED",
        cancelledAt: null,
        completedAt: null,
      },
      data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) continue;
    try {
      const [settings, suppressed, parent] = await Promise.all([
        prisma.reviewSettings.findUnique({ where: { shop: job.shop } }),
        prisma.emailSuppression.findUnique({
          where: { shop_email: { shop: job.shop, email: job.email } },
        }),
        job.parentId
          ? prisma.reviewRequest.findUnique({ where: { id: job.parentId } })
          : null,
      ]);
      if (
        !settings?.requestEmailOn ||
        suppressed ||
        (job.orderVerified &&
          (!settings.automaticRequestsOn ||
            process.env.AUTOMATIC_REQUESTS_APPROVED !== "true")) ||
        (job.parentId &&
          (!parent ||
            parent.completedAt ||
            parent.cancelledAt ||
            parent.bouncedAt))
      ) {
        await prisma.reviewRequest.update({
          where: { id: job.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            lockedAt: null,
          },
        });
        result.cancelled++;
        continue;
      }
      const token = signRequest(job.parentId || job.id, job.shop);
      let productUrl = job.productUrl;
      if (!productUrl && job.productId) {
        const { admin } = await unauthenticated.admin(job.shop);
        const response = await admin.graphql(
          `query ReviewProduct($id: ID!) { product(id: $id) { onlineStoreUrl } }`,
          { variables: { id: `gid://shopify/Product/${job.productId}` } },
        );
        const data = await response.json();
        productUrl = data.data?.product?.onlineStoreUrl;
      }
      if (!productUrl)
        throw new Error("The product is not published to the online store.");
      const link = new URL(productUrl);
      link.searchParams.set("reviewloom_request", token);
      link.hash = "reviewloom-reviews";
      const unsubscribe = new URL(
        `https://${job.shop}/apps/reviewloom/unsubscribe`,
      );
      unsubscribe.searchParams.set("token", signRequest(job.id, job.shop));
      const deliveryPayload = job.deliveryPayload || {
        id: job.id,
        to: job.email,
        productName: job.productName,
        productUrl: link.toString(),
        unsubscribeUrl: unsubscribe.toString(),
        senderName:
          settings.senderName || job.shop.replace(".myshopify.com", ""),
        replyTo: settings.supportEmail,
        reminder: Boolean(job.parentId),
      };
      // Persist the exact signed links and content before contacting the provider.
      // Regenerating tokens on retry would change the payload under the same idempotency key.
      if (!job.deliveryPayload)
        await prisma.reviewRequest.update({
          where: { id: job.id },
          data: { deliveryPayload },
        });
      const response = await sendReviewRequestEmail(deliveryPayload);
      if (response.error || !response.data?.id)
        throw new Error(
          response.error?.message ||
            "Email provider did not confirm acceptance.",
        );
      await prisma.reviewRequest.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          emailId: response.data.id,
          error: null,
          lockedAt: null,
        },
      });
      result.sent++;
    } catch (error) {
      const terminal = job.attempts + 1 >= MAX_ATTEMPTS;
      await prisma.reviewRequest.update({
        where: { id: job.id },
        data: {
          status: terminal ? "FAILED" : "QUEUED",
          error: String(error.message || "Delivery failed").slice(0, 500),
          lockedAt: null,
          scheduledAt: new Date(Date.now() + 5 * 60000 * 2 ** job.attempts),
        },
      });
      result.failed++;
      console.error("[request.queue] delivery failed", {
        id: job.id,
        terminal,
      });
    }
  }
  return result;
}

export async function scheduleReminders() {
  if (process.env.AUTOMATIC_REQUESTS_APPROVED !== "true") return;
  const due =
    await prisma.$queryRaw`SELECT r.id FROM "ReviewRequest" r JOIN "ReviewSettings" s ON s.shop = r.shop WHERE r.status = 'SENT' AND r."orderVerified" = true AND r."parentId" IS NULL AND r."reminderSentAt" IS NULL AND r."completedAt" IS NULL AND r."cancelledAt" IS NULL AND r."bouncedAt" IS NULL AND s."automaticRequestsOn" = true AND s."requestEmailOn" = true AND s."reminderDays" > 0 AND r."sentAt" <= NOW() - make_interval(days => s."reminderDays") ORDER BY r."sentAt" ASC LIMIT 100`;
  const sent = due.length
    ? await prisma.reviewRequest.findMany({
        where: { id: { in: due.map((r) => r.id) } },
      })
    : [];
  for (const job of sent) {
    const settings = await prisma.reviewSettings.findUnique({
      where: { shop: job.shop },
    });
    if (
      !settings?.automaticRequestsOn ||
      !settings.requestEmailOn ||
      !settings.reminderDays ||
      Date.now() - job.sentAt.getTime() < settings.reminderDays * 86400000
    )
      continue;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.reviewRequest.updateMany({
        where: {
          id: job.id,
          reminderSentAt: null,
          completedAt: null,
          cancelledAt: null,
        },
        data: { reminderSentAt: new Date() },
      });
      if (!claimed.count) return;
      await tx.reviewRequest.create({
        data: {
          shop: job.shop,
          email: job.email,
          productId: job.productId,
          productName: job.productName,
          productUrl: job.productUrl,
          orderId: job.orderId,
          orderVerified: true,
          parentId: job.id,
          dedupeKey: `reminder:${job.id}`,
        },
      });
    });
  }
}
