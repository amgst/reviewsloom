import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    // Cascades remove review media, activity and votes. Do not retain payloads.
    await prisma.$transaction([
      prisma.review.deleteMany({ where: { shop } }),
      prisma.question.deleteMany({ where: { shop } }),
      prisma.reviewSettings.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
    ]);
  } else if (["CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT"].includes(topic)) {
    // No email/customer link remains. Support identifies submissions with the
    // merchant; a non-unique display name is not proof of identity.
    console.info(
      JSON.stringify({
        event: "privacy.manual_review_required",
        shop,
        topic,
        webhookId: request.headers.get("x-shopify-webhook-id"),
      }),
    );
  }
  return new Response();
};
