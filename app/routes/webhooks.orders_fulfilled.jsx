import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);
  const order = await request.json();
  if (order.email) {
    await prisma.reviewRequest.create({ data: {
      shop,
      orderId: String(order.id),
      email: order.email,
      productName: order.line_items?.[0]?.title || "your recent purchase",
    } });
  }
  return new Response();
};