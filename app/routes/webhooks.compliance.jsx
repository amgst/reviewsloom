import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Shopify's three mandatory GDPR compliance topics share a single
// subscription/endpoint (compliance_topics in shopify.app.toml), unlike
// regular webhook topics which each get their own [[webhooks.subscriptions]]
// entry - see https://shopify.dev/docs/apps/build/webhooks/subscribe.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const customerEmail = payload.customer?.email;
  const customerWhere = {
    shop,
    email: { equals: customerEmail, mode: "insensitive" },
  };

  if (topic === "CUSTOMERS_DATA_REQUEST") {
    // We don't auto-email an export - the store owner fulfills the request
    // to the customer - but we log what we'd return so support can pull it
    // on request, acknowledging within Shopify's required window.
    const email = payload.customer?.email;
    if (email) {
      const [reviews, questions, reviewRequests] = await Promise.all([
        prisma.review.count({ where: customerWhere }),
        prisma.question.count({ where: customerWhere }),
        prisma.reviewRequest.count({ where: customerWhere }),
      ]);
      console.log(
        JSON.stringify({
          event: "privacy.data_request",
          shop,
          reviews,
          questions,
          requests: reviewRequests,
        }),
      );
    }
  }

  if (topic === "CUSTOMERS_REDACT") {
    // Key off email since that's the only identifier we store for
    // reviewers/askers (we never store Shopify customer IDs).
    const email = payload.customer?.email;
    if (email) {
      const [reviews, questions, reviewRequests] = await Promise.all([
        prisma.review.deleteMany({ where: customerWhere }),
        prisma.question.deleteMany({ where: customerWhere }),
        prisma.reviewRequest.deleteMany({ where: customerWhere }),
      ]);
      await prisma.emailSuppression.deleteMany({ where: customerWhere });
      console.log(
        JSON.stringify({
          event: "privacy.redacted",
          shop,
          reviews: reviews.count,
          questions: questions.count,
          requests: reviewRequests.count,
        }),
      );
    }
  }

  if (topic === "SHOP_REDACT") {
    // Sent ~48 days after uninstall. Erase everything we hold for this shop.
    const shopDomain = shop;
    await Promise.all([
      prisma.review.deleteMany({ where: { shop: shopDomain } }),
      prisma.question.deleteMany({ where: { shop: shopDomain } }),
      prisma.reviewRequest.deleteMany({ where: { shop: shopDomain } }),
      prisma.reviewSettings.deleteMany({ where: { shop: shopDomain } }),
      prisma.session.deleteMany({ where: { shop: shopDomain } }),
      prisma.emailSuppression.deleteMany({ where: { shop: shopDomain } }),
    ]);
    console.log(`[gdpr] fully redacted shop ${shopDomain}`);
  }

  return new Response();
};
