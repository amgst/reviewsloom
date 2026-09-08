import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import { createRequestHandler } from "@remix-run/express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ASSETS_PATH = path.join(__dirname, "build/client");

// Vercel's proxy sets x-forwarded-host to an infra-internal value that can
// differ from the Origin header the browser actually sent. Remix's built-in
// CSRF guard compares those two on every full-page form POST (e.g. the
// auth.login shop-domain form) and aborts on a mismatch, even though the
// request is legitimate. Force x-forwarded-host to the app's real, configured
// public host so the comparison means something again.
const canonicalHost = process.env.SHOPIFY_APP_URL
  ? new URL(process.env.SHOPIFY_APP_URL).host
  : null;

const app = express();
app.disable("x-powered-by");
app.use(compression());

if (canonicalHost) {
  app.use((req, _res, next) => {
    req.headers["x-forwarded-host"] = canonicalHost;
    next();
  });
}

app.use(
  "/assets",
  express.static(path.join(CLIENT_ASSETS_PATH, "assets"), {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static(CLIENT_ASSETS_PATH, { maxAge: "1h" }));

app.all(
  "*",
  createRequestHandler({
    build: () => import("./build/server/index.js"),
  }),
);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
