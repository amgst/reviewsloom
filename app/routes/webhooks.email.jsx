import { getResendClient } from "../resend.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  if (!process.env.RESEND_WEBHOOK_SECRET || !getResendClient())
    return new Response(null, { status: 503 });
  let event;
  try {
    event = getResendClient().webhooks.verify({
      payload: await request.text(),
      headers: {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  const emailId = event.data?.email_id;
  if (
    !emailId ||
    !["email.delivered", "email.bounced", "email.complained"].includes(
      event.type,
    )
  )
    return new Response();
  const jobs = await prisma.reviewRequest.findMany({ where: { emailId } });
  for (const job of jobs) {
    const occurred = new Date(event.created_at);
    const at = Number.isFinite(occurred.getTime()) ? occurred : new Date();
    if (event.type === "email.delivered") {
      await prisma.reviewRequest.updateMany({
        where: { id: job.id, deliveredAt: null },
        data: { deliveredAt: at },
      });
    } else {
      await prisma.$transaction([
        prisma.reviewRequest.updateMany({
          where: { id: job.id, bouncedAt: null },
          data: {
            bouncedAt: at,
            error:
              event.type === "email.complained"
                ? "Customer reported this email."
                : "Email bounced.",
          },
        }),
        prisma.emailSuppression.upsert({
          where: { shop_email: { shop: job.shop, email: job.email } },
          create: { shop: job.shop, email: job.email },
          update: {},
        }),
        prisma.reviewRequest.updateMany({
          where: { shop: job.shop, email: job.email, status: "QUEUED" },
          data: { status: "CANCELLED", cancelledAt: at },
        }),
      ]);
    }
  }
  return new Response();
};
