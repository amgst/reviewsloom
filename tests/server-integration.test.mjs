import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

await mkdir(".cache/test-modules", { recursive: true });
globalThis.__reviewloomTest = {};
process.env.SHOPIFY_API_SECRET ||= "reviewloom-test-only-secret";
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
              filter: /(?:db\.server|shopify\.server)$/,
            },
            (args) => ({ path: args.path, namespace: "boundary" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => ({
            contents: args.path.endsWith("db.server")
              ? "export default globalThis.__reviewloomTest.db;"
              : args.path.endsWith("shopify.server")
                ? "export const authenticate = globalThis.__reviewloomTest.authenticate; export const unauthenticated = globalThis.__reviewloomTest.unauthenticated;"
                : "",
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(outfile));
}

test("signed proxy requests without an installed shop session cannot touch data", async () => {
  let reads = 0;
  globalThis.__reviewloomTest.db = {
    reviewSettings: {
      findUnique: async () => {
        reads++;
      },
    },
  };
  globalThis.__reviewloomTest.authenticate = {
    public: { appProxy: async () => ({}) },
  };
  const api = await moduleUnderTest(
    "app/routes/api.reviews.jsx",
    "uninstalled-proxy",
  );
  const response = await api.loader({
    request: new Request("https://app.test/api/reviews?shop=one.myshopify.com"),
  });
  assert.equal(response.status, 401);
  assert.equal(reads, 0);
});

test("bounded forms reject streamed oversize bodies and file-valued text fields", async () => {
  const security = await moduleUnderTest(
    "app/security.server.js",
    "bounded-forms",
  );
  await assert.rejects(
    security.boundedFormData(
      new Request("https://app.test", {
        method: "POST",
        body: "field=too-long",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
      4,
    ),
    (error) => error instanceof Response && error.status === 413,
  );
  const form = new FormData();
  form.set("reviewer", new File(["fake"], "fake.txt"));
  assert.throws(
    () => security.textField(form, "reviewer", 100, true),
    (error) => error instanceof Response && error.status === 400,
  );
});

test("store-wide daily budgets remain shared when visitors rotate addresses", async () => {
  const counters = new Map();
  globalThis.__reviewloomTest.db = {
    storefrontRateLimit: {
      upsert: async ({ where }) => {
        const count = (counters.get(where.key) || 0) + 1;
        counters.set(where.key, count);
        return { count };
      },
    },
  };
  const security = await moduleUnderTest(
    "app/security.server.js",
    "shop-budget",
  );
  await security.limitShopAction("one.myshopify.com", "reviews", 1);
  await assert.rejects(
    security.limitShopAction("one.myshopify.com", "reviews", 1),
    (error) => error instanceof Response && error.status === 429,
  );
  await security.limitShopAction("two.myshopify.com", "reviews", 1);
  assert.equal(counters.size, 2);
});

test("question moderation rejects missing identifiers before querying", async () => {
  globalThis.__reviewloomTest.authenticate = {
    admin: async () => ({ session: { shop: "one.myshopify.com" } }),
  };
  globalThis.__reviewloomTest.db = new Proxy(
    {},
    {
      get() {
        throw new Error("Unexpected query");
      },
    },
  );
  const api = await moduleUnderTest(
    "app/routes/app.questions.jsx",
    "question-invalid-id",
  );
  const response = await api.action({
    request: new Request("https://app.test/app/questions", {
      method: "POST",
      body: new URLSearchParams({ intent: "reject" }),
    }),
  });
  assert.equal(response.status, 400);
});

test("nonexistent products cannot create rewarded reviews or Shopify files", async () => {
  let writes = 0;
  globalThis.__reviewloomTest.authenticate = {
    public: {
      appProxy: async () => ({ session: { shop: "one.myshopify.com" } }),
    },
  };
  globalThis.__reviewloomTest.db = {
    reviewSettings: {
      findUnique: async () => ({
        reviewFormOn: true,
        reviewDiscountPercent: "10",
      }),
    },
    storefrontRateLimit: { upsert: async () => ({ count: 1 }) },
    review: {
      create: async () => {
        writes++;
      },
    },
  };
  globalThis.__reviewloomTest.unauthenticated = {
    admin: async () => ({
      admin: {
        graphql: async (query) => {
          assert.ok(query.includes("ReviewableProduct"));
          return Response.json({ data: { product: null } });
        },
      },
    }),
  };
  const api = await moduleUnderTest(
    "app/routes/api.reviews.jsx",
    "missing-reward-product",
  );
  const response = await api.action({
    request: new Request(
      "https://app.test/api/reviews?shop=one.myshopify.com&product_id=123",
      {
        method: "POST",
        body: new URLSearchParams({
          reviewer: "Alex",
          rating: "5",
          body: "Review",
        }),
      },
    ),
  });
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});

for (const scenario of [
  "success",
  "creation-failure",
  "association-failure",
  "disabled",
]) {
  test(`review reward flow: ${scenario}`, async () => {
    let writes = 0;
    const operations = [];
    globalThis.__reviewloomTest.db = {
      reviewSettings: {
        findUnique: async () => ({
          reviewFormOn: true,
          reviewDiscountPercent: scenario === "disabled" ? "none" : "10",
        }),
      },
      storefrontRateLimit: { upsert: async () => ({ count: 1 }) },
      review: {
        create: async () => {
          writes++;
          return { id: "reward-review", status: "PENDING" };
        },
        update: async () => {
          if (scenario === "association-failure")
            throw new Error("Database unavailable");
        },
      },
    };
    globalThis.__reviewloomTest.authenticate = {
      public: {
        appProxy: async () => ({ session: { shop: "one.myshopify.com" } }),
      },
    };
    globalThis.__reviewloomTest.unauthenticated = {
      admin: async () => ({
        admin: {
          graphql: async (query, { variables }) => {
            if (query.includes("ReviewableProduct"))
              return Response.json({
                data: {
                  product: {
                    id: variables.id,
                    status: "ACTIVE",
                    onlineStoreUrl: "https://one.myshopify.com/products/shirt",
                  },
                },
              });
            operations.push({ query, variables });
            return Response.json(
              scenario === "creation-failure"
                ? { errors: [{ message: "Access denied" }] }
                : {
                    data: {
                      discountCodeBasicCreate: {
                        codeDiscountNode: {
                          id: "gid://shopify/DiscountCodeNode/1",
                        },
                        userErrors: [],
                      },
                    },
                  },
            );
          },
        },
      }),
    };
    const api = await moduleUnderTest(
      "app/routes/api.reviews.jsx",
      `reward-${scenario}`,
    );
    const response = await api.action({
      request: new Request(
        "https://app.test/api/reviews?shop=one.myshopify.com&product_id=123",
        {
          method: "POST",
          body: new URLSearchParams({
            reviewer: "Alex",
            rating: "1",
            body: "Not a great fit",
          }),
        },
      ),
    });
    assert.equal(response.status, 201);
    assert.equal(writes, 1);
    const result = await response.json();
    if (scenario === "disabled") {
      assert.equal(operations.length, 0);
      assert.equal(result.discountCode, null);
      assert.equal(result.discountWarning, null);
    } else if (scenario === "creation-failure") {
      assert.equal(result.discountCode, null);
      assert.ok(result.discountWarning.includes("Your review was saved"));
      assert.ok(!result.discountWarning.includes("Access denied"));
    } else {
      assert.match(result.discountCode, /^THANKS10-[A-F0-9]{24}$/);
      assert.equal(result.discountWarning, null);
      const input = operations[0].variables.basicCodeDiscount;
      assert.equal(input.customerGets.value.percentage, 0.1);
      assert.equal(input.usageLimit, 1);
      assert.equal(input.appliesOncePerCustomer, true);
      assert.equal(
        Date.parse(input.endsAt) - Date.parse(input.startsAt),
        30 * 86400000,
      );
    }
  });
}

test("discount helper refuses missing confirmation, Shopify user errors and invalid percentages", async () => {
  let payload;
  globalThis.__reviewloomTest.unauthenticated = {
    admin: async () => ({
      admin: { graphql: async () => Response.json(payload) },
    }),
  };
  const discounts = await moduleUnderTest(
    "app/discounts.server.js",
    "discount-response-validation",
  );
  for (payload of [
    { errors: [{ message: "Access denied" }] },
    {
      data: {
        discountCodeBasicCreate: { codeDiscountNode: null, userErrors: [] },
      },
    },
    {
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: null,
          userErrors: [{ message: "Invalid input" }],
        },
      },
    },
  ]) {
    await assert.rejects(
      discounts.createReviewDiscountCode("one.myshopify.com", 20),
    );
  }
  await assert.rejects(
    discounts.createReviewDiscountCode("one.myshopify.com", 100),
  );
});

for (const widget of ["reviews", "embed"]) {
  test(`${widget} widget displays reward codes and partial-failure warnings`, async () => {
    const source = await readFile(
      `extensions/reviewloom-widget/blocks/${widget}.liquid`,
      "utf8",
    );
    const body = source.match(/\.then\(\(result\) => \{ ([^\n]*) \}\)/)?.[1];
    assert.ok(body);
    const display = new Function(
      "result",
      "status",
      "form",
      "state",
      "load",
      body,
    );
    const status = {};
    display(
      { discountCode: "THANKS10-TEST" },
      status,
      { reset() {} },
      {},
      () => {},
    );
    assert.ok(status.textContent.includes("THANKS10-TEST"));
    assert.ok(status.textContent.includes("30 days"));
    display(
      { discountWarning: "Your review was saved, but your reward failed." },
      status,
      { reset() {} },
      {},
      () => {},
    );
    assert.ok(status.textContent.includes("your reward failed"));
  });
}

test("photo validation rejects excessive, oversized and disguised files", async () => {
  const photos = await moduleUnderTest(
    "app/review-photos.server.js",
    "photo-validation",
  );
  const png = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
    "private-name.png",
    { type: "image/png" },
  );
  const valid = await photos.validateReviewPhotos([png]);
  assert.equal(valid.length, 1);
  assert.ok(!valid[0].filename.includes("private-name"));
  for (const files of [
    Array(4).fill(png),
    [new File([new Uint8Array(1000001)], "big.png", { type: "image/png" })],
    [new File(["<svg></svg>"], "fake.png", { type: "image/png" })],
  ]) {
    await assert.rejects(
      photos.validateReviewPhotos(files),
      (error) => error instanceof Response && error.status === 400,
    );
  }
  const request = new Request("https://app.test/reviews", {
    method: "POST",
    body: "small",
    headers: { "Content-Length": "4000000" },
  });
  await assert.rejects(
    photos.reviewFormData(request),
    (error) => error instanceof Response && error.status === 400,
  );
});

test("review photos use Shopify staging and Files, and clean partial registration failures", async () => {
  let fail = false;
  const calls = [];
  const admin = {
    graphql: async (query, { variables }) => {
      calls.push({ query, variables });
      if (query.includes("StageReviewPhotos"))
        return Response.json({
          data: {
            stagedUploadsCreate: {
              stagedTargets: [
                {
                  url: "https://upload.test",
                  resourceUrl: "https://resource.test/photo",
                  parameters: [{ name: "key", value: "temporary-key" }],
                },
              ],
              userErrors: [],
            },
          },
        });
      if (query.includes("CreateReviewPhotos"))
        return Response.json({
          data: {
            fileCreate: {
              files: [
                { id: "gid://shopify/MediaImage/1", fileStatus: "PROCESSING" },
              ],
              userErrors: fail ? [{ message: "Rejected" }] : [],
            },
          },
        });
      if (query.includes("ReviewPhotoStatus"))
        return Response.json({
          data: {
            nodes: [
              {
                id: "gid://shopify/MediaImage/1",
                fileStatus: "READY",
                image: { url: "https://cdn.shopify.com/photo.png" },
              },
            ],
          },
        });
      return Response.json({
        data: { fileDelete: { deletedFileIds: variables.ids, userErrors: [] } },
      });
    },
  };
  globalThis.__reviewloomTest.unauthenticated = {
    admin: async () => ({
      admin,
      session: { scope: "read_files,write_files" },
    }),
  };
  const photos = await moduleUnderTest(
    "app/review-photos.server.js",
    "shopify-photo-flow",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://upload.test");
    assert.equal(options.body.get("key"), "temporary-key");
    assert.ok(options.body.get("file") instanceof File);
    return new Response(null, { status: 201 });
  };
  try {
    const input = [
      {
        file: new File(["binary"], "photo.png", { type: "image/png" }),
        mimeType: "image/png",
        filename: "reviewloom-random.png",
      },
    ];
    const result = await photos.uploadReviewPhotos("one.myshopify.com", input);
    assert.deepEqual(result, [
      {
        shopifyFileId: "gid://shopify/MediaImage/1",
        url: "https://cdn.shopify.com/photo.png",
      },
    ]);
    assert.equal(calls[0].variables.input[0].resource, "IMAGE");
    fail = true;
    await assert.rejects(
      photos.uploadReviewPhotos("one.myshopify.com", input),
      (error) => error instanceof Response,
    );
    assert.ok(calls.some((call) => call.query.includes("DeleteReviewPhotos")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
    public: {
      appProxy: async () => ({ session: { shop: "one.myshopify.com" } }),
    },
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
          customerEligibility: "loggedIn",
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
      public: {
        appProxy: async () => ({ session: { shop: "one.myshopify.com" } }),
      },
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

test("storefront context does not expose forwarded customer identifiers", async () => {
  globalThis.__reviewloomTest.db = {
    reviewSettings: { findUnique: async () => ({ reviewFormOn: true }) },
  };
  globalThis.__reviewloomTest.authenticate = {
    public: {
      appProxy: async () => ({ session: { shop: "one.myshopify.com" } }),
    },
  };
  const security = await moduleUnderTest(
    "app/security.server.js",
    "no-customer-context",
  );
  const context = await security.storefrontContext(
    new Request(
      "https://app.test/api/reviews?shop=one.myshopify.com&logged_in_customer_id=123456",
    ),
  );
  assert.deepEqual(Object.keys(context).sort(), ["settings", "shop"]);
  assert.ok(!JSON.stringify(context).includes("123456"));
});

test("review form stays available to guests despite legacy login restrictions", async () => {
  globalThis.__reviewloomTest.db = {
    reviewSettings: {
      findUnique: async () => ({
        reviewFormOn: true,
        customerEligibility: "loggedIn",
        widgetSeenAt: new Date(),
      }),
    },
    review: {
      groupBy: async () => [],
      count: async () => 0,
      findMany: async () => [],
    },
  };
  globalThis.__reviewloomTest.authenticate = {
    public: {
      appProxy: async () => ({ session: { shop: "one.myshopify.com" } }),
    },
  };
  const api = await moduleUnderTest(
    "app/routes/api.reviews.jsx",
    "guest-review-form",
  );
  const response = await api.loader({
    request: new Request(
      "https://app.test/api/reviews?shop=one.myshopify.com&product_id=123",
    ),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.settings.reviewFormOn, true);
  assert.equal("customerEligibility" in data.settings, false);
});

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
            images: [{ url: "https://cdn.shopify.com/review-photo.png" }],
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
  assert.ok(csv.includes("https://cdn.shopify.com/review-photo.png"));
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
