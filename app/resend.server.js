import { Resend } from "resend";

let resendClient;

export function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export async function sendReviewRequestEmail({ id, to, productName, productUrl }) {
  const resend = getResendClient();
  if (!resend) return { error: { message: "RESEND_API_KEY is not configured." } };

  const reviewLink = productUrl ? `${productUrl}${productUrl.includes("#") ? "" : "#reviewloom-reviews"}` : null;
  const html = `
    <p>Hi,</p>
    <p>Thanks for your recent purchase of <strong>${escapeHtml(productName)}</strong>! We'd love to hear what you thought.</p>
    ${reviewLink ? `<p><a href="${escapeHtml(reviewLink)}">Leave a review</a></p>` : "<p>Reply to this email and let us know what you thought.</p>"}
    <p>Thanks for your support!</p>
  `.trim();

  return resend.emails.send(
    {
      from: process.env.RESEND_FROM_EMAIL || "Review Loom <onboarding@resend.dev>",
      to: [to],
      subject: `How was ${productName}?`,
      html,
    },
    { idempotencyKey: `review-request/${id}` },
  );
}
