import { authenticate } from "../shopify.server";

// Retired endpoint: never read or persist legacy email/order payloads.
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return new Response("Email invitations are no longer available.", {
    status: 410,
  });
};
export const action = loader;
