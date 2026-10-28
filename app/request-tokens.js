import { createHmac, timingSafeEqual } from "node:crypto";

export function signRequest(
  id,
  shop,
  secret = process.env.REVIEW_REQUEST_SECRET || process.env.SHOPIFY_API_SECRET,
) {
  if (!secret) throw new Error("Review request signing secret is missing.");
  const payload = Buffer.from(
    JSON.stringify({ id, shop, exp: Date.now() + 90 * 86400000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function readRequestToken(
  token,
  shop,
  secret = process.env.REVIEW_REQUEST_SECRET || process.env.SHOPIFY_API_SECRET,
) {
  if (!token || !secret || token.length > 2000) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.shop === shop &&
      typeof data.id === "string" &&
      Number.isFinite(data.exp) &&
      data.exp > Date.now()
      ? data
      : null;
  } catch {
    return null;
  }
}
