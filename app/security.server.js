import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "./db.server";
import { authenticate } from "./shopify.server";

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function storefrontContext(request) {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop))
    throw new Response("Invalid shop.", { status: 400 });
  const settings = await prisma.reviewSettings.findUnique({ where: { shop } });
  if (!settings) throw new Response("Store not configured.", { status: 404 });
  return {
    shop,
    settings,
    customerId: url.searchParams.get("logged_in_customer_id") || null,
  };
}

export function visitorKey(request, shop) {
  // Shopify forwards the visitor address on app proxy requests. Hash it before storage.
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  return createHmac("sha256", process.env.SHOPIFY_API_SECRET || "reviewloom")
    .update(`${shop}:${address}`)
    .digest("hex");
}

export async function limitStorefront(request, shop, action, max = 10) {
  const window = Math.floor(Date.now() / 3600000);
  const key = `${action}:${visitorKey(request, shop)}:${window}`;
  const row = await prisma.storefrontRateLimit.upsert({
    where: { key },
    create: { key, expiresAt: new Date((window + 1) * 3600000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > max)
    throw new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": "3600" },
    });
}

export function textField(data, key, max, required = false) {
  const value = String(data.get(key) || "").trim();
  if ((required && !value) || value.length > max)
    throw new Response(`Invalid ${key.replaceAll("_", " ")}.`, { status: 400 });
  return value;
}

export function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function emailAddress(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
