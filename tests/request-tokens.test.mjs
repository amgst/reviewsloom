import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signRequest, readRequestToken } from "../app/request-tokens.js";

test("invitations are scoped to a shop and reject tampering", () => {
  const token = signRequest("request-1", "one.myshopify.com", "secret");
  assert.equal(
    readRequestToken(token, "one.myshopify.com", "secret").id,
    "request-1",
  );
  assert.equal(readRequestToken(token, "two.myshopify.com", "secret"), null);
  assert.equal(
    readRequestToken(token, "one.myshopify.com", "wrong-secret"),
    null,
  );
  assert.equal(
    readRequestToken(`${token}x`, "one.myshopify.com", "secret"),
    null,
  );
  assert.equal(
    readRequestToken(`${token}.extra`, "one.myshopify.com", "secret"),
    null,
  );
});

test("expired invitations cannot be replayed", () => {
  const payload = Buffer.from(
    JSON.stringify({ id: "r", shop: "one", exp: Date.now() - 1 }),
  ).toString("base64url");
  const token = `${payload}.${createHmac("sha256", "secret").update(payload).digest("base64url")}`;
  assert.equal(readRequestToken(token, "one", "secret"), null);
  assert.equal(readRequestToken("", "one", "secret"), null);
  assert.equal(readRequestToken("not-json.broken", "one", "secret"), null);
});
