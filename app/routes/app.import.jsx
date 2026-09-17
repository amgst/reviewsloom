import { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { BlockStack, Button, Card, Layout, List, Page, Text, TextField } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const REQUIRED_COLUMNS = ["product_id", "product_name", "reviewer", "rating", "body"];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return { rows: [], errors: ["Paste some CSV rows first."] };

  const header = lines[0].split(",").map((column) => column.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}`] };

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    const row = Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""]));
    const rating = Number(row.rating);
    if (!row.product_id || !row.product_name || !row.reviewer || !row.body || !(rating >= 1 && rating <= 5)) {
      errors.push(`Row ${i + 1}: missing a required field or an invalid rating.`);
      continue;
    }
    rows.push({
      productId: row.product_id,
      productName: row.product_name,
      reviewer: row.reviewer,
      email: row.email || null,
      rating,
      body: row.body,
      imageUrl: row.image_url || null,
      status: "APPROVED",
    });
  }
  return { rows, errors };
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const { rows, errors } = parseCsv(String(formData.get("csv") || ""));
  if (rows.length) await prisma.review.createMany({ data: rows.map((row) => ({ ...row, shop: session.shop })) });
  return json({ imported: rows.length, errors });
};

export default function Import() {
  const actionData = useActionData();
  const [csv, setCsv] = useState("");

  return (
    <Page>
      <TitleBar title="Import reviews" />
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Import reviews from a CSV</Text>
                <Text as="p" tone="subdued">Paste CSV rows with a header row using these columns:</Text>
                <List type="bullet">
                  <List.Item><code>product_id</code>, <code>product_name</code>, <code>reviewer</code>, <code>rating</code> (1-5), <code>body</code> — required</List.Item>
                  <List.Item><code>email</code>, <code>image_url</code> — optional</List.Item>
                </List>
                <TextField
                  label="CSV data"
                  labelHidden
                  name="csv"
                  value={csv}
                  onChange={setCsv}
                  multiline={8}
                  autoComplete="off"
                  placeholder={"product_id,product_name,reviewer,email,rating,body,image_url\n7920123,Canvas weekend tote,Jon Bell,jon@example.com,5,Great quality and fast shipping.,"}
                />
                <Button submit variant="primary" disabled={!csv.trim()}>Import reviews</Button>
                {actionData?.imported ? <Text tone="success">Imported {actionData.imported} review(s).</Text> : null}
                {actionData?.errors?.length ? (
                  <BlockStack gap="100">
                    {actionData.errors.map((error, index) => <Text key={index} tone="critical">{error}</Text>)}
                  </BlockStack>
                ) : null}
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
