import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Shopify's mandatory GDPR webhook: a customer (via the merchant) has asked
// what data we hold about them. We don't auto-email an export - the store
// owner is responsible for fulfilling the request to the customer - but we
// log what we'd return so support can pull it on request, and acknowledge
// within Shopify's required window.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = payload.customer?.email;
  if (email) {
    const [reviews, questions, reviewRequests] = await Promise.all([
      prisma.review.findMany({ where: { shop, email } }),
      prisma.question.findMany({ where: { shop, email } }),
      prisma.reviewRequest.findMany({ where: { shop, email } }),
    ]);
    console.log(`[gdpr] data_request for ${email} at ${shop}: ${reviews.length} review(s), ${questions.length} question(s), ${reviewRequests.length} review request(s)`);
  }

  return new Response();
};
