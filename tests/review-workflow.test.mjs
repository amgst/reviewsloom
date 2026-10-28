import test from "node:test";
import assert from "node:assert/strict";
import {
  inboxQuery,
  inboxWhere,
  moderateReviews,
} from "../app/review-workflow.js";

function database(records) {
  const events = [];
  const matches = (row, where) =>
    row.shop === where.shop &&
    where.id.in.includes(row.id) &&
    (where.deletedAt === null ? !row.deletedAt : Boolean(row.deletedAt));
  const tx = {
    review: {
      findMany: async ({ where }) =>
        records.filter((row) => matches(row, where)),
      updateMany: async ({ where, data }) => {
        records
          .filter((row) => matches(row, where))
          .forEach((row) => Object.assign(row, data));
      },
      deleteMany: async ({ where }) => {
        records.splice(
          0,
          records.length,
          ...records.filter((row) => !matches(row, where)),
        );
      },
    },
    reviewEvent: {
      createMany: async ({ data }) => events.push(...data),
      deleteMany: async () => {},
    },
  };
  return { $transaction: async (run) => run(tx), records, events };
}

test("a foreign shop review cannot be moderated or deleted", async () => {
  for (const intent of ["moderate", "delete", "restore", "delete-forever"]) {
    const db = database([
      {
        id: "foreign",
        shop: "other.myshopify.com",
        status: "PENDING",
        deletedAt:
          intent.includes("restore") || intent.includes("forever")
            ? new Date()
            : null,
      },
    ]);
    const result = await moderateReviews(db, {
      shop: "owner.myshopify.com",
      ids: ["foreign"],
      intent,
      status: "APPROVED",
    });
    assert.equal(result.code, 404);
    assert.equal(db.records[0].status, "PENDING");
    assert.equal(db.events.length, 0);
  }
});

test("a mixed bulk selection changes none of the records", async () => {
  const db = database([
    { id: "mine", shop: "a", status: "PENDING" },
    { id: "theirs", shop: "b", status: "PENDING" },
  ]);
  const result = await moderateReviews(db, {
    shop: "a",
    ids: ["mine", "theirs"],
    intent: "moderate",
    status: "APPROVED",
  });
  assert.equal(result.code, 404);
  assert.equal(db.records[0].status, "PENDING");
});

test("bulk publication records history and normal deletion is recoverable", async () => {
  const db = database([{ id: "mine", shop: "a", status: "PENDING" }]);
  assert.equal(
    (
      await moderateReviews(db, {
        shop: "a",
        ids: ["mine", "mine"],
        intent: "moderate",
        status: "APPROVED",
      })
    ).ok,
    true,
  );
  assert.equal(db.events.length, 1);
  assert.equal(db.records[0].status, "APPROVED");
  await moderateReviews(db, { shop: "a", ids: ["mine"], intent: "delete" });
  assert.ok(db.records[0].deletedAt);
  await moderateReviews(db, { shop: "a", ids: ["mine"], intent: "restore" });
  assert.equal(db.records[0].deletedAt, null);
});

test("invalid action or status is rejected without writes", async () => {
  const db = database([]);
  assert.equal(
    (
      await moderateReviews(db, {
        shop: "a",
        ids: ["x"],
        intent: "moderate",
        status: "FAKE",
      })
    ).code,
    400,
  );
  assert.equal(
    (await moderateReviews(db, { shop: "a", ids: [], intent: "delete" })).code,
    400,
  );
});

test("inbox filters stay shop scoped and normalize hostile query parameters", () => {
  const filters = inboxQuery(
    new URLSearchParams(
      "page=-4&rating=3.5&status=FAKE&days=999&q=%20hello%20",
    ),
  );
  assert.equal(filters.page, 1);
  assert.equal(filters.rating, null);
  assert.equal(filters.status, "ALL");
  assert.equal(filters.days, null);
  const where = inboxWhere("a", filters);
  assert.equal(where.shop, "a");
  assert.equal(where.deletedAt, null);
  assert.equal(where.OR[0].reviewer.contains, "hello");
  assert.throws(() => inboxWhere(null, filters));
});
