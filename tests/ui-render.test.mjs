import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json" with { type: "json" };

await mkdir(".cache/previews", { recursive: true });
const settings = {
  accentColor: "#D95D39",
  starStyle: "solid",
  alignment: "center",
  reviewFormOn: true,
  customerEligibility: "everyone",
  autoPublishThreshold: "disabled",
  reviewDiscountPercent: "none",
};
const review = {
  id: "preview",
  productName: "Everyday linen shirt",
  reviewer: "Alex Morgan",
  rating: 4,
  body: "Comfortable fabric and a great fit. Arrived earlier than expected.",
  status: "PENDING",
  source: "storefront",
  createdAt: "2026-10-28T08:00:00Z",
  images: [],
};
const fixtures = {
  reviews: {
    settings,
    shop: "preview.myshopify.com",
    reviews: [review],
    events: [],
    total: 1,
    counts: { PENDING: 1 },
    average: null,
    filters: {
      status: "ALL",
      q: "",
      product: "",
      rating: null,
      days: null,
      page: 1,
    },
  },
  settings: {
    settings,
    shop: "preview.myshopify.com",
  },
  analytics: {
    days: 7,
    current: 12,
    average: 4.5,
    prior: 8,
    approved: 9,
    daily: Array.from({ length: 7 }, (_, i) => ({
      day: `2026-10-${22 + i}`,
      count: [1, 2, 0, 3, 1, 4, 1][i],
    })),
    products: [{ name: "Everyday linen shirt", count: 12, average: 4.5 }],
    funnel: {
      queued: 40,
      sent: 30,
      delivered: 28,
      completed: 8,
      published: 6,
      bounced: 1,
    },
  },
};
fixtures.reviewsConnected = {
  ...fixtures.reviews,
  settings: { ...settings, widgetSeenAt: "2026-10-29T08:00:00Z" },
};
fixtures.reviewsComplete = {
  ...fixtures.reviews,
  settings: {
    ...settings,
    widgetSeenAt: "2026-10-29T08:00:00Z",
    setupThemeConfirmedAt: "2026-10-29T08:00:00Z",
  },
};
for (const [name, fixture] of Object.entries(fixtures)) {
  test(`${name} page renders with realistic data`, async () => {
    globalThis.__reviewloomPreviewData = fixture;
    const outfile = path.resolve(`.cache/previews/${name}.mjs`);
    await build({
      entryPoints: [
        `app/routes/app.${name.startsWith("reviews") ? "_index" : name}.jsx`,
      ],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      jsx: "automatic",
      plugins: [
        {
          name: "render-boundaries",
          setup(builder) {
            builder.onResolve({ filter: /^@remix-run\/react$/ }, () => ({
              path: "remix",
              namespace: "preview",
            }));
            builder.onResolve(
              { filter: /^@shopify\/app-bridge-react$/ },
              () => ({ path: "bridge", namespace: "preview" }),
            );
            builder.onResolve({ filter: /\.server$/ }, () => ({
              path: "server",
              namespace: "preview",
            }));
            builder.onLoad(
              { filter: /.*/, namespace: "preview" },
              ({ path: id }) => ({
                contents:
                  id === "remix"
                    ? `import React from "react"; export const useLoaderData = () => globalThis.__reviewloomPreviewData; export const useFetcher = () => ({ state: "idle", Form: (props) => React.createElement("form", props), submit() {} }); export const useNavigation = () => ({state:"idle"}); export const useActionData = () => null; export const useSubmit = () => () => {}; export const useSearchParams = () => [new URLSearchParams(), () => {}]; export const Form = (props) => React.createElement("form", props);`
                    : id === "bridge"
                      ? "export const TitleBar = () => null;"
                      : "export default {}; export const authenticate = {}; export const boundedFormData = async () => new FormData(); export const autoPublishEligibleReviews = async () => {};",
              }),
            );
          },
        },
      ],
    });
    const { default: Page } = await import(pathToFileURL(outfile));
    const markup = renderToString(
      React.createElement(AppProvider, { i18n: en }, React.createElement(Page)),
    );
    assert.ok(markup.includes("Polaris-Page"));
    assert.ok(!markup.includes("NaN"));
    if (name.startsWith("reviews")) {
      assert.equal(
        (markup.match(/aria-expanded="true"/g) || []).length,
        name === "reviewsComplete" ? 0 : 1,
      );
      assert.ok(!markup.includes("signed storefront widget request"));
    }
    if (name === "reviewsConnected") {
      assert.ok(markup.includes("2 of 3 complete"));
      assert.ok(markup.includes("Widget connected"));
    }
    if (name === "reviewsComplete") {
      assert.ok(markup.includes("3 of 3 complete"));
      assert.ok(markup.includes("Finish setup"));
    }
    const css = await readFile(
      "node_modules/@shopify/polaris/build/esm/styles.css",
      "utf8",
    );
    const customCss = await readFile("public/reviewloom.css", "utf8");
    await writeFile(
      `.cache/previews/${name}.html`,
      `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} preview</title><style>${css}\n${customCss}</style><body>${markup}</body></html>`,
    );
  });
}
