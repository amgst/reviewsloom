import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Shopify's mandatory GDPR webhook: sent ~48 days after uninstall. Erase
// everything we hold for this shop.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const shopDomain = payload.shop_domain || shop;
  await Promise.all([
    prisma.review.deleteMany({ where: { shop: shopDomain } }),
    prisma.question.deleteMany({ where: { shop: shopDomain } }),
    prisma.reviewRequest.deleteMany({ where: { shop: shopDomain } }),
    prisma.reviewSettings.deleteMany({ where: { shop: shopDomain } }),
    prisma.session.deleteMany({ where: { shop: shopDomain } }),
  ]);
  console.log(`[gdpr] fully redacted shop ${shopDomain}`);

  return new Response();
};
