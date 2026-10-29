import { unauthenticated } from "./shopify.server";
import { randomBytes } from "node:crypto";

const DISCOUNT_VALIDITY_DAYS = 30;

export async function createReviewDiscountCode(shop, percent) {
  if (![10, 20].includes(percent))
    throw new Error("Unsupported review discount.");
  const { admin } = await unauthenticated.admin(shop);
  const code = `THANKS${percent}-${randomBytes(12).toString("hex").toUpperCase()}`;
  const startsAt = new Date();
  const endsAt = new Date(
    startsAt.getTime() + DISCOUNT_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  );

  const response = await admin.graphql(
    `#graphql
    mutation reviewDiscountCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        basicCodeDiscount: {
          title: `Thanks for your review (${percent}% off)`,
          code,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          customerSelection: { all: true },
          customerGets: {
            value: { percentage: percent / 100 },
            items: { all: true },
          },
          appliesOncePerCustomer: true,
          usageLimit: 1,
        },
      },
    },
  );

  const { data, errors } = await response.json();
  const userErrors = data?.discountCodeBasicCreate?.userErrors || [];
  if (userErrors.length)
    throw new Error(userErrors.map((error) => error.message).join(", "));
  if (errors?.length || !data?.discountCodeBasicCreate?.codeDiscountNode?.id)
    throw new Error("Shopify did not confirm the discount was created.");
  return code;
}
