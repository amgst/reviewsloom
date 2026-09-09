import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Shopify's three mandatory GDPR compliance topics share a single
// subscription/endpoint (compliance_topics in shopify.app.toml), unlike
// regular webhook topics which each get their own [[webhooks.subscriptions]]
// entry - see https://shopify.dev/docs/apps/build/webhooks/subscribe.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    // We don't auto-email an export - the store owner fulfills the request
    // to the customer - but we log what we'd return so support can pull it
    // on request, acknowledging within Shopify's required window.
    const email = payload.customer?.email;
    if (email) {
      const [reviews, questions, reviewRequests] = await Promise.all([
        prisma.review.findMany({ where: { shop, email } }),
        prisma.question.findMany({ where: { shop, email } }),
        prisma.reviewRequest.findMany({ where: { shop, email } }),
      ]);
      console.log(`[gdpr] data_request for ${email} at ${shop}: ${reviews.length} review(s), ${questions.length} question(s), ${reviewRequests.length} review request(s)`);
    }
  }

  if (topic === "CUSTOMERS_REDACT") {
    // Key off email since that's the only identifier we store for
    // reviewers/askers (we never store Shopify customer IDs).
    const email = payload.customer?.email;
    if (email) {
      const [reviews, questions, reviewRequests] = await Promise.all([
        prisma.review.deleteMany({ where: { shop, email } }),
        prisma.question.deleteMany({ where: { shop, email } }),
        prisma.reviewRequest.deleteMany({ where: { shop, email } }),
      ]);
      console.log(`[gdpr] redacted ${email} at ${shop}: ${reviews.count} review(s), ${questions.count} question(s), ${reviewRequests.count} review request(s)`);
    }
  }

  if (topic === "SHOP_REDACT") {
    // Sent ~48 days after uninstall. Erase everything we hold for this shop.
    const shopDomain = payload.shop_domain || shop;
    await Promise.all([
      prisma.review.deleteMany({ where: { shop: shopDomain } }),
      prisma.question.deleteMany({ where: { shop: shopDomain } }),
      prisma.reviewRequest.deleteMany({ where: { shop: shopDomain } }),
      prisma.reviewSettings.deleteMany({ where: { shop: shopDomain } }),
      prisma.session.deleteMany({ where: { shop: shopDomain } }),
    ]);
    console.log(`[gdpr] fully redacted shop ${shopDomain}`);
  }

  return new Response();
};
