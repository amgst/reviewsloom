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

for (const kind of ["reviews", "questions"]) {
  test(`${kind} ignore legacy email and purchase-invitation fields`, async () => {
    let stored;
    const model = kind === "reviews" ? "review" : "question";
    globalThis.__reviewloomTest.db = {
      reviewSettings: {
        findUnique: async () => ({
          reviewFormOn: true,
          customerEligibility: "everyone",
        }),
      },
      storefrontRateLimit: { upsert: async () => ({ count: 1 }) },
      [model]: {
        create: async ({ data }) => {
          stored = data;
          return { id: "created", status: "PENDING" };
        },
      },
    };
    globalThis.__reviewloomTest.authenticate = {
      public: { appProxy: async () => ({}) },
    };
    const api = await moduleUnderTest(
      `app/routes/api.${kind}.jsx`,
      `no-email-${kind}`,
    );
    const response = await api.action({
      request: new Request(
        `https://app.test/api/${kind}?shop=one.myshopify.com&product_id=123`,
        {
          method: "POST",
          body: new URLSearchParams({
            rating: "5",
            reviewer: "Alex",
            body: "Good",
            asker: "Alex",
            question: "What size?",
            email: "customer@example.com",
            request_token: "old-token",
            verifiedPurchase: "true",
          }),
        },
      ),
    });
    assert.equal(response.status, 201);
    assert.ok(stored);
    assert.equal("email" in stored, false);
    assert.equal("requestId" in stored, false);
    assert.equal("verifiedPurchase" in stored, false);
    assert.ok(!JSON.stringify(stored).includes("customer@example.com"));
  });
}

test("CSV exports cannot include legacy email values", async () => {
  let selection;
  globalThis.__reviewloomTest.db = {
    review: {
      findMany: async ({ select }) => {
        selection = select;
        return [
          {
            id: "one",
            productId: "123",
            productName: "Shirt",
            reviewer: "Alex",
            email: "old@example.com",
            rating: 5,
            body: "Good",
          },
        ];
      },
    },
  };
  globalThis.__reviewloomTest.authenticate = {
    admin: async () => ({ session: { shop: "one.myshopify.com" } }),
  };
  const api = await moduleUnderTest(
    "app/routes/app.export.jsx",
    "no-email-export",
  );
  const response = await api.loader({
    request: new Request("https://app.test/app/export"),
  });
  const csv = await response.text();
  assert.equal("email" in selection, false);
  assert.ok(!csv.includes("email"));
  assert.ok(!csv.includes("old@example.com"));
});

for (const name of [
  "webhooks.email",
  "webhooks.orders",
  "api.unsubscribe",
  "app.requests",
]) {
  test(`${name} never consumes retired customer payloads`, async () => {
    globalThis.__reviewloomTest.db = new Proxy(
      {},
      {
        get() {
          throw new Error("Unexpected database access");
        },
      },
    );
    globalThis.__reviewloomTest.authenticate = { admin: async () => ({}) };
    const api = await moduleUnderTest(
      `app/routes/${name}.jsx`,
      `retired-${name}`,
    );
    const request = new Request(`https://app.test/${name}`, {
      method: "POST",
      body: "private payload",
    });
    assert.equal((await api.action({ request })).status, 410);
    assert.equal(request.bodyUsed, false);
  });
}

test("customer compliance webhook retains no email and requests manual follow-up", async () => {
  globalThis.__reviewloomTest.db = {};
  globalThis.__reviewloomTest.authenticate = {
    webhook: async () => ({
      shop: "one.myshopify.com",
      topic: "CUSTOMERS_REDACT",
      payload: { customer: { email: "private@example.com" } },
    }),
  };
  const api = await moduleUnderTest(
    "app/routes/webhooks.compliance.jsx",
    "no-email-compliance",
  );
  const original = console.info;
  const entries = [];
  console.info = (entry) => entries.push(entry);
  try {
    const response = await api.action({
      request: new Request("https://app.test/webhooks/compliance"),
    });
    assert.equal(response.status, 200);
    assert.ok(entries[0].includes("privacy.manual_review_required"));
    assert.ok(!entries[0].includes("private@example.com"));
  } finally {
    console.info = original;
  }
});
