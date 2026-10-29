import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsvValue } from "../app/csv.js";
import { settingsInput } from "../app/settings-validation.js";

const header = "product_id,product_name,reviewer,rating,body";
test("CSV handles quoted commas, escaped quotes, and embedded newlines", () => {
  const parsed = parseCsv(
    `${header}\r\n1,"Soft, warm shirt",Alex,4,"Great ""quality""\nand fit"`,
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[0].body, 'Great "quality"\nand fit');
  assert.equal(parsed.rows[0].status, "PENDING");
  assert.equal(parsed.rows[0].source, "import");
});
test("CSV rejects broken quotes, fractional ratings, and unsafe photo URLs", () => {
  assert.ok(parseCsv(`${header}\n1,Shirt,Alex,4,"broken`).errors.length);
  assert.ok(parseCsv(`${header}\n1,Shirt,Alex,3.5,Fine`).errors.length);
  assert.ok(
    parseCsv(`${header},image_url\n1,Shirt,Alex,5,Great,javascript:alert(1)`)
      .errors.length,
  );
});
test("exports escape spreadsheet formulas and round-trip customer text", () => {
  const body = '=HYPERLINK("https://example.com")';
  assert.ok(toCsvValue(body).startsWith("\"'"));
  assert.equal(
    parseCsv(`${header}\n1,Shirt,Alex,5,${toCsvValue(body)}`).rows[0].body,
    body,
  );
});
test("settings normalize removed eligibility and ignore retired email controls", () => {
  const data = new FormData();
  data.set("automaticRequestsOn", "true");
  data.set("requestEmailOn", "true");
  assert.equal("automaticRequestsOn" in settingsInput(data), false);
  assert.equal("requestEmailOn" in settingsInput(data), false);
  data.set("customerEligibility", "verifiedBuyer");
  assert.equal(settingsInput(data).customerEligibility, "everyone");
  data.set("customerEligibility", "loggedIn");
  assert.equal(settingsInput(data).customerEligibility, "everyone");
  data.set("customerEligibility", "everyone");
  data.set("accentColor", "red; background:url(x)");
  assert.throws(() => settingsInput(data));
});
test("CSV rejects customer email columns instead of importing or previewing them", () => {
  const result = parseCsv(
    `${header},email\n1,Shirt,Alex,5,Great,customer@example.com`,
  );
  assert.equal(result.rows.length, 0);
  assert.ok(result.errors.length);
  assert.equal(
    "email" in parseCsv(`${header}\n1,Shirt,Alex,5,Great`).rows[0],
    false,
  );
});
