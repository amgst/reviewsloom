import { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { BlockStack, Button, Card, Layout, Page, Text, TextField } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import QRCode from "qrcode";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const productUrl = String(formData.get("productUrl") || "").trim();
  if (!productUrl) return json({ error: "Enter a product page URL first." });
  try {
    const dataUrl = await QRCode.toDataURL(productUrl, { width: 320, margin: 1 });
    return json({ dataUrl, productUrl });
  } catch (error) {
    return json({ error: "Couldn't generate a QR code for that URL." });
  }
};

export default function QrCodeGenerator() {
  const actionData = useActionData();
  const [productUrl, setProductUrl] = useState("");

  return (
    <Page>
      <TitleBar title="QR code generator" />
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">Generate a product QR code</Text>
                <Text as="p" tone="subdued">Paste a product page URL to generate a QR code customers can scan in-store to jump straight to that product's reviews.</Text>
                <TextField label="Product page URL" name="productUrl" value={productUrl} onChange={setProductUrl} autoComplete="off" placeholder="https://your-store.myshopify.com/products/example" />
                <Button submit variant="primary" disabled={!productUrl.trim()}>Generate QR code</Button>
                {actionData?.error ? <Text tone="critical">{actionData.error}</Text> : null}
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {actionData?.dataUrl ? (
            <Card>
              <BlockStack gap="300" inlineAlign="center">
                <Text as="h2" variant="headingMd">Scan to review</Text>
                <img src={actionData.dataUrl} alt="QR code linking to the product page" width={200} height={200} />
                <Text as="p" tone="subdued" alignment="center">{actionData.productUrl}</Text>
                <Button url={actionData.dataUrl} download="reviewloom-qr-code.png">Download PNG</Button>
              </BlockStack>
            </Card>
          ) : null}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
