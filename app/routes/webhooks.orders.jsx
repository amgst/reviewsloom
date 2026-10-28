import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { emailAddress } from "../security.server";

// Subscribe only after protected customer data approval and read_orders access.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  if (
    !["ORDERS_FULFILLED", "ORDERS_CANCELLED", "REFUNDS_CREATE"].includes(topic)
  )
    return new Response(null, { status: 400 });
  const orderId = String(payload.order_id || payload.id || "");
  if (topic !== "ORDERS_FULFILLED") {
    await prisma.reviewRequest.updateMany({
      where: { shop, orderId, completedAt: null, cancelledAt: null },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return new Response();
  }
  if (process.env.AUTOMATIC_REQUESTS_APPROVED !== "true") return new Response();
  const settings = await prisma.reviewSettings.findUnique({ where: { shop } });
  const email = String(payload.email || payload.customer?.email || "")
    .trim()
    .toLowerCase();
  if (
    !settings?.requestEmailOn ||
    !settings.automaticRequestsOn ||
    !emailAddress(email) ||
    payload.cancelled_at ||
    payload.financial_status === "refunded"
  )
    return new Response();
  if (
    await prisma.emailSuppression.findUnique({
      where: { shop_email: { shop, email } },
    })
  )
    return new Response();
  const products = [
    ...new Map(
      (payload.line_items || [])
        .filter((item) => item.product_id)
        .map((item) => [String(item.product_id), item]),
    ).values(),
  ];
  for (const item of products) {
    const productId = String(item.product_id);
    const dedupeKey = `order:${shop}:${orderId}:${productId}`;
    // Resolve the published product URL in the worker, outside the webhook deadline.
    await prisma.reviewRequest.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        shop,
        email,
        orderId,
        productId,
        productName: String(item.title || "Your purchase").slice(0, 300),
        orderVerified: true,
        dedupeKey,
        scheduledAt: new Date(
          Date.now() + settings.requestDelayDays * 86400000,
        ),
      },
    });
  }
  return new Response();
};
