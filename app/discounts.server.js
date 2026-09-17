import { unauthenticated } from "./shopify.server";

const DISCOUNT_VALIDITY_DAYS = 30;

export async function createReviewDiscountCode(shop, percent) {
  const { admin } = await unauthenticated.admin(shop);
  const code = `THANKS${percent}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + DISCOUNT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

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
          customerGets: { value: { percentage: percent / 100 }, items: { all: true } },
          appliesOncePerCustomer: true,
          usageLimit: 1,
        },
      },
    },
  );

  const { data } = await response.json();
  const userErrors = data?.discountCodeBasicCreate?.userErrors || [];
  if (userErrors.length) throw new Error(userErrors.map((error) => error.message).join(", "));
  return code;
}
