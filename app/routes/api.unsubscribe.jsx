import { storefrontContext } from "../security.server";
import { readRequestToken } from "../request-tokens";
import prisma from "../db.server";

async function invitation(request) {
  const { shop } = await storefrontContext(request);
  const token = readRequestToken(
    new URL(request.url).searchParams.get("token"),
    shop,
  );
  const record =
    token &&
    (await prisma.reviewRequest.findFirst({ where: { id: token.id, shop } }));
  if (!record)
    throw new Response("This link is invalid or expired.", { status: 400 });
  return record;
}
export const loader = async ({ request }) => {
  await invitation(request);
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body style="font:16px system-ui;max-width:500px;margin:64px auto;padding:24px"><h1>Email preferences</h1><p>Stop review request emails from this store?</p><form method="post"><button type="submit" style="padding:12px 20px">Unsubscribe</button></form></body></html>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
};
export const action = async ({ request }) => {
  const job = await invitation(request);
  await prisma.$transaction([
    prisma.emailSuppression.upsert({
      where: { shop_email: { shop: job.shop, email: job.email } },
      create: { shop: job.shop, email: job.email },
      update: {},
    }),
    prisma.reviewRequest.updateMany({
      where: { shop: job.shop, email: job.email, status: "QUEUED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
  ]);
  return new Response(
    "You have been unsubscribed from this store's review request emails.",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};
