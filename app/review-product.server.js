import { unauthenticated } from "./shopify.server";

export const REVIEWABLE_PRODUCT = `query ReviewableProduct($id: ID!) {
  product(id: $id) { id status onlineStoreUrl }
}`;

// Expensive side effects must refer to an actual published product in this shop.
export async function assertReviewProduct(shop, productId) {
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(REVIEWABLE_PRODUCT, {
    variables: { id: `gid://shopify/Product/${productId}` },
  });
  const { data, errors } = await response.json();
  if (errors?.length)
    throw new Response(
      JSON.stringify({
        error: "We couldn't verify this product. Please try again later.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  if (
    !data?.product ||
    data.product.status !== "ACTIVE" ||
    !data.product.onlineStoreUrl
  )
    throw new Response(
      JSON.stringify({
        error:
          "This product is not available for review rewards or photo uploads.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
}
