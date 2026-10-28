import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

await mkdir(".cache/test-modules", { recursive: true });
globalThis.__reviewloomTest = {};
async function moduleUnderTest(entry, name) {
  const outfile = path.resolve(`.cache/test-modules/${name}.mjs`);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
    plugins: [
      {
        name: "test-boundaries",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /(?:db\.server|shopify\.server|resend\.server|discounts\.server)$/,
            },
            (args) => ({ path: args.path, namespace: "boundary" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => ({
            contents: args.path.endsWith("db.server")
              ? "export default globalThis.__reviewloomTest.db;"
              : args.path.endsWith("shopify.server")
                ? "export const authenticate = globalThis.__reviewloomTest.authenticate; export const unauthenticated = globalThis.__reviewloomTest.unauthenticated;"
                : args.path.endsWith("discounts.server")
                  ? "export const createReviewDiscountCode = async () => { throw new Error('Discounts disabled in test') };"
                  : "export const sendReviewRequestEmail = (...args) => globalThis.__reviewloomTest.send(...args);",
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(outfile));
}

test("storefront requests authenticate before any database lookup", async () => {
  let queries = 0;
  const denied = new Response("Unauthorized", { status: 401 });
  globalThis.__reviewloomTest.db = {
    reviewSettings: {
      findUnique: async () => {
        queries++;
      },
    },
  };
  globalThis.__reviewloomTest.authenticate = {
    public: {
      appProxy: async () => {
        throw denied;
      },
    },
  };
  const api = await moduleUnderTest(
    "app/routes/api.reviews.jsx",
    "unsigned-reviews",
  );
  assert.equal(
    (
      await api.loader({
        request: new Request(
          "https://app.test/api/reviews?shop=other.myshopify.com",
        ),
      })
    ).status,
    401,
  );
  assert.equal(queries, 0);
});

test("a signed proxy without shop context cannot expose storewide data", async () => {
  let queries = 0;
  globalThis.__reviewloomTest.db = {
    reviewSettings: {
      findUnique: async () => {
        queries++;
      },
    },
  };
  globalThis.__reviewloomTest.authenticate = {
    public: { appProxy: async () => ({}) },
  };
  const api = await moduleUnderTest(
    "app/routes/api.reviews.jsx",
    "missing-shop",
  );
  assert.equal(
    (await api.loader({ request: new Request("https://app.test/api/reviews") }))
      .status,
    400,
  );
  assert.equal(queries, 0);
});

test("verified-buyer restrictions cannot be bypassed with a form flag", async () => {
  let writes = 0;
  globalThis.__reviewloomTest.db = {
    reviewSettings: {
      findUnique: async () => ({
        reviewFormOn: true,
        customerEligibility: "verifiedBuyer",
      }),
    },
    storefrontRateLimit: { upsert: async () => ({ count: 1 }) },
    review: {
      create: async () => {
        writes++;
      },
    },
  };
  globalThis.__reviewloomTest.authenticate = {
    public: { appProxy: async () => ({}) },
  };
  const api = await moduleUnderTest(
    "app/routes/api.reviews.jsx",
    "verified-review",
  );
  const body = new URLSearchParams({
    rating: "5",
    reviewer: "Name",
    body: "Nice",
    verifiedPurchase: "true",
  });
  const response = await api.action({
    request: new Request(
      "https://app.test/api/reviews?shop=one.myshopify.com&product_id=123",
      { method: "POST", body },
    ),
  });
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

test("concurrent queue workers only send the atomically claimed job once", async () => {
  const job = {
    id: "job-1",
    shop: "one.myshopify.com",
    email: "customer@example.com",
    productName: "Shirt",
    productUrl: "https://one.myshopify.com/products/shirt",
    attempts: 0,
    status: "QUEUED",
  };
  let state = "QUEUED",
    sends = 0;
  globalThis.__reviewloomTest.db = {
    reviewRequest: {
      findMany: async () => [job],
      updateMany: async ({ where, data }) => {
        if (where.id && where.status === "QUEUED") {
          if (state !== "QUEUED") return { count: 0 };
          state = data.status;
          return { count: 1 };
        }
        return { count: 0 };
      },
      update: async ({ data }) => {
        state = data.status;
      },
    },
    reviewSettings: { findUnique: async () => ({ requestEmailOn: true }) },
    emailSuppression: { findUnique: async () => null },
  };
  globalThis.__reviewloomTest.send = async () => {
    sends++;
    return { data: { id: "provider-id" } };
  };
  globalThis.__reviewloomTest.unauthenticated = {};
  process.env.REVIEW_REQUEST_SECRET = "test-only-secret";
  const worker = await moduleUnderTest(
    "app/request-queue.server.js",
    "queue-concurrency",
  );
  await Promise.all([
    worker.processRequestQueue(),
    worker.processRequestQueue(),
  ]);
  assert.equal(sends, 1);
  assert.equal(state, "SENT");
});

test("a suppressed email is cancelled without contacting the provider", async () => {
  const job = {
    id: "job-2",
    shop: "one.myshopify.com",
    email: "customer@example.com",
    attempts: 0,
  };
  let sends = 0,
    state;
  globalThis.__reviewloomTest.db = {
    reviewRequest: {
      findMany: async () => [job],
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => {
        state = data.status;
      },
    },
    reviewSettings: { findUnique: async () => ({ requestEmailOn: true }) },
    emailSuppression: { findUnique: async () => ({ id: "suppressed" }) },
  };
  globalThis.__reviewloomTest.send = async () => {
    sends++;
  };
  const worker = await moduleUnderTest(
    "app/request-queue.server.js",
    "queue-suppression",
  );
  const result = await worker.processRequestQueue();
  assert.equal(result.cancelled, 1);
  assert.equal(state, "CANCELLED");
  assert.equal(sends, 0);
});

test("retries reuse the saved email payload under the same delivery key", async () => {
  const job = {
    id: "retry-job",
    shop: "one.myshopify.com",
    email: "customer@example.com",
    productName: "Shirt",
    productUrl: "https://one.myshopify.com/products/shirt",
    attempts: 0,
    status: "QUEUED",
  };
  const payloads = [];
  globalThis.__reviewloomTest.db = {
    reviewRequest: {
      findMany: async () => [{ ...job }],
      updateMany: async ({ where, data }) => {
        if (where.id) {
          if (job.status !== "QUEUED") return { count: 0 };
          job.status = data.status;
          job.attempts++;
          return { count: 1 };
        }
        return { count: 0 };
      },
      update: async ({ data }) => Object.assign(job, data),
    },
    reviewSettings: {
      findUnique: async () => ({
        requestEmailOn: true,
        senderName: payloads.length ? "Changed store name" : "Original store",
      }),
    },
    emailSuppression: { findUnique: async () => null },
  };
  globalThis.__reviewloomTest.send = async (payload) => {
    payloads.push(structuredClone(payload));
    return payloads.length === 1
      ? { error: { message: "Temporary failure" } }
      : { data: { id: "delivered-on-retry" } };
  };
  const worker = await moduleUnderTest(
    "app/request-queue.server.js",
    "queue-retry",
  );
  await worker.processRequestQueue();
  assert.equal(job.status, "QUEUED");
  assert.ok(job.deliveryPayload);
  await worker.processRequestQueue();
  assert.equal(job.status, "SENT");
  assert.deepEqual(payloads[0], payloads[1]);
});
