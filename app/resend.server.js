import { Resend } from "resend";

let resendClient;

export function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

// The "from" address's domain must match a domain verified in Resend, so we
// can't let each shop pick their own sending address - but we CAN vary the
// display name per shop, so the email reads as coming from their store
// rather than generically from Review Loom.
function buildFromHeader(displayName) {
  const raw = process.env.RESEND_FROM_EMAIL || "Review Loom <onboarding@resend.dev>";
  const match = raw.match(/<([^>]+)>/);
  const address = match ? match[1] : raw.trim();
  const safeName = (displayName || "Review Loom").replace(/["<>]/g, "").trim();
  return safeName ? `${safeName} <${address}>` : address;
}

export async function sendReviewRequestEmail({ id, to, productName, productUrl, senderName, replyTo }) {
  const resend = getResendClient();
  if (!resend) return { error: { message: "RESEND_API_KEY is not configured." } };

  const reviewLink = productUrl ? `${productUrl}${productUrl.includes("#") ? "" : "#reviewloom-reviews"}` : null;
  const from = senderName ? `${senderName} via Review Loom` : "Review Loom";
  const html = `
    <p>Hi,</p>
    <p>Thanks for your recent purchase of <strong>${escapeHtml(productName)}</strong>! We'd love to hear what you thought.</p>
    ${reviewLink ? `<p><a href="${escapeHtml(reviewLink)}">Leave a review</a></p>` : "<p>Reply to this email and let us know what you thought.</p>"}
    <p>Thanks for your support!</p>
  `.trim();

  return resend.emails.send(
    {
      from: buildFromHeader(from),
      to: [to],
      replyTo: replyTo || undefined,
      subject: `How was ${productName}?`,
      html,
    },
    { idempotencyKey: `review-request/${id}` },
  );
}
