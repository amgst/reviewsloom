import { useRef, useState } from "react";
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
import { boundedFormData } from "../security.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await boundedFormData(request, 2_500_000);
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
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const [previewText, setPreviewText] = useState(null);
  const fileRead = useRef(0);
  const busy = reading || navigation.state !== "idle";
  const changeCsv = (text) => {
    fileRead.current++;
    setReading(false);
    setCsv(text);
    setFileName("");
    setFileError("");
    setPreviewText(null);
  };
  const chooseFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const currentRead = ++fileRead.current;
    setCsv("");
    setPreviewText(null);
    setFileName("");
    setFileError("");
    if (!/\.csv$/i.test(file.name) || file.size > 2_000_000) {
      setReading(false);
      setFileError("Choose a .csv file smaller than 2 MB.");
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (currentRead !== fileRead.current) return;
      const { rows, errors } = parseCsv(text);
      if (errors.length || !rows.length) {
        setFileError(errors[0] || "Include at least one review row.");
        return;
      }
      setCsv(text);
      setFileName(file.name);
    } catch {
      if (currentRead === fileRead.current)
        setFileError("This file could not be read. Choose it again.");
    } finally {
      if (currentRead === fileRead.current) setReading(false);
    }
  };

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
              <Form
                method="post"
                encType="multipart/form-data"
                onSubmit={() => setPreviewText(csv)}
              >
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
                    Upload a CSV file up to 2 MB with a header row using these
                    columns:
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <code>product_id</code>, <code>product_name</code>,{" "}
                      <code>reviewer</code>, <code>rating</code> (1-5),{" "}
                      <code>body</code> — required
                    </List.Item>
                    <List.Item>
                      <code>image_url</code> — optional
                    </List.Item>
                  </List>
                  <BlockStack gap="200">
                    <label htmlFor="reviewloom-csv-file">
                      Choose a CSV file
                    </label>
                    <input
                      id="reviewloom-csv-file"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={chooseFile}
                      disabled={navigation.state !== "idle"}
                      aria-describedby="reviewloom-csv-status"
                    />
                    <div
                      id="reviewloom-csv-status"
                      role="status"
                      aria-live="polite"
                    >
                      {reading
                        ? "Reading CSV…"
                        : fileError ||
                          (fileName
                            ? `Selected: ${fileName}`
                            : "Choose a file, then preview your reviews before importing.")}
                    </div>
                  </BlockStack>
                  <details>
                    <summary>Or paste CSV data</summary>
                    <TextField
                      label="CSV data"
                      value={csv}
                      onChange={changeCsv}
                      disabled={navigation.state !== "idle"}
                      multiline={8}
                      autoComplete="off"
                      placeholder={
                        "product_id,product_name,reviewer,rating,body,image_url\n7920123,Canvas weekend tote,Jon Bell,5,Great quality and fast shipping.,"
                      }
                    />
                  </details>
                  <input type="hidden" name="csv" value={csv} />
                  <Button submit disabled={!csv.trim() || busy}>
                    Preview import
                  </Button>
                  {actionData?.preview && previewText === csv && !busy ? (
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
                            { method: "post", encType: "multipart/form-data" },
                          )
                        }
                        variant="primary"
                      >
                        Confirm import of genuine reviews
                      </Button>
                    </BlockStack>
                  ) : null}
                  {actionData?.imported !== undefined &&
                  !actionData.errors?.length ? (
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
