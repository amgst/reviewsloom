import { useState } from "react";
import { createHash } from "node:crypto";
import { parseCsv } from "../csv";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useSubmit,
  useNavigation,
} from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  Layout,
  List,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const csv = String(formData.get("csv") || "");
  const { rows, errors } = parseCsv(csv);
  if (errors.length || !rows.length)
    return json(
      {
        imported: 0,
        errors: errors.length ? errors : ["Include at least one review row."],
      },
      { status: 400 },
    );
  const digest = createHash("sha256").update(csv).digest("hex");
  if (formData.get("intent") !== "import")
    return json({ preview: rows.slice(0, 3), total: rows.length, digest });
  if (formData.get("digest") !== digest)
    return json(
      { errors: ["Your CSV changed. Preview it again before importing."] },
      { status: 400 },
    );
  const result = await prisma.review.createMany({
    data: rows.map((row) => ({
      ...row,
      shop: session.shop,
      importKey: createHash("sha256")
        .update(
          JSON.stringify([
            session.shop,
            row.productId,
            row.reviewer,
            row.email,
            row.rating,
            row.body,
          ]),
        )
        .digest("hex"),
    })),
    skipDuplicates: true,
  });
  return json({
    imported: result.count,
    skipped: rows.length - result.count,
    errors: [],
  });
};

export default function Import() {
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [csv, setCsv] = useState("");

  return (
    <Page>
      <TitleBar title="Import & export reviews" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Export reviews to a CSV
                </Text>
                <Text as="p" tone="subdued">
                  Download all of your current reviews using the same column
                  layout the import below expects, so you can edit them and
                  re-import, or back them up.
                </Text>
                <div>
                  <Button url="/app/export">Export reviews</Button>
                </div>
              </BlockStack>
            </Card>
            <Card>
              <Form method="post">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">
                    Import reviews from a CSV
                  </Text>
                  <Text as="p" tone="subdued">
                    Preview up to 500 genuine reviews per import. Imported
                    reviews enter Pending for moderation. Matching imports are
                    skipped.
                  </Text>
                  <Text as="p" tone="subdued">
                    Paste CSV rows with a header row using these columns:
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <code>product_id</code>, <code>product_name</code>,{" "}
                      <code>reviewer</code>, <code>rating</code> (1-5),{" "}
                      <code>body</code> — required
                    </List.Item>
                    <List.Item>
                      <code>email</code>, <code>image_url</code> — optional
                    </List.Item>
                  </List>
                  <TextField
                    label="CSV data"
                    labelHidden
                    name="csv"
                    value={csv}
                    onChange={setCsv}
                    multiline={8}
                    autoComplete="off"
                    placeholder={
                      "product_id,product_name,reviewer,email,rating,body,image_url\n7920123,Canvas weekend tote,Jon Bell,jon@example.com,5,Great quality and fast shipping.,"
                    }
                  />
                  <Button
                    submit
                    disabled={!csv.trim() || navigation.state !== "idle"}
                  >
                    Preview import
                  </Button>
                  {actionData?.preview ? (
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">
                        Preview: {actionData.total} review(s)
                      </Text>
                      {actionData.preview.map((row, index) => (
                        <Text as="p" key={index}>
                          {row.productName} · {row.rating}/5 · {row.reviewer}:{" "}
                          {row.body.slice(0, 120)}
                        </Text>
                      ))}
                      <Button
                        disabled={navigation.state !== "idle"}
                        onClick={() =>
                          submit(
                            {
                              csv,
                              digest: actionData.digest,
                              intent: "import",
                            },
                            { method: "post" },
                          )
                        }
                        variant="primary"
                      >
                        Confirm import of genuine reviews
                      </Button>
                    </BlockStack>
                  ) : null}
                  {actionData?.imported !== undefined ? (
                    <Text as="p" tone="success">
                      Imported {actionData.imported} review(s); skipped{" "}
                      {actionData.skipped || 0} duplicate(s).
                    </Text>
                  ) : null}
                  {actionData?.errors?.length ? (
                    <BlockStack gap="100">
                      {actionData.errors.map((error, index) => (
                        <Text key={index} tone="critical">
                          {error}
                        </Text>
                      ))}
                    </BlockStack>
                  ) : null}
                </BlockStack>
              </Form>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
