// Retired endpoint: never read or persist legacy email/order payloads.
export const loader = async ({ request }) => {
  return new Response("Email invitations are no longer available.", {
    status: 410,
  });
};
export const action = loader;
