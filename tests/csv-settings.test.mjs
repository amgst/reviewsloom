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
test("settings validate input and cannot enable automatic emails before approval", () => {
  const data = new FormData();
  data.set("automaticRequestsOn", "true");
  assert.equal(settingsInput(data, false).automaticRequestsOn, false);
  assert.equal(settingsInput(data, true).automaticRequestsOn, true);
  data.set("accentColor", "red; background:url(x)");
  assert.throws(() => settingsInput(data, true));
  data.set("accentColor", "#123abc");
  data.set("requestDelayDays", "-2");
  assert.throws(() => settingsInput(data, true));
});
