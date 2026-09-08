import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Shopify's mandatory GDPR webhook: erase this customer's personal data.
// We key off email since that's the only identifier we store for
// reviewers/askers (we never store Shopify customer IDs).
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const email = payload.customer?.email;
  if (email) {
    const [reviews, questions, reviewRequests] = await Promise.all([
      prisma.review.deleteMany({ where: { shop, email } }),
      prisma.question.deleteMany({ where: { shop, email } }),
      prisma.reviewRequest.deleteMany({ where: { shop, email } }),
    ]);
    console.log(`[gdpr] redacted ${email} at ${shop}: ${reviews.count} review(s), ${questions.count} question(s), ${reviewRequests.count} review request(s)`);
  }

  return new Response();
};
