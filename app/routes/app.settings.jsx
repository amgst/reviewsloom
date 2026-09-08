import { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.reviewSettings.upsert({ where: { shop: session.shop }, update: {}, create: { shop: session.shop } });
  return json({ settings });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  await prisma.reviewSettings.update({ where: { shop: session.shop }, data: {
    accentColor: formData.get("accentColor") || "#D95D39",
    starStyle: formData.get("starStyle") || "solid",
    reviewFormOn: formData.get("reviewFormOn") === "on",
    requestEmailOn: formData.get("requestEmailOn") === "on",
    senderName: formData.get("senderName") || null,
    supportEmail: formData.get("supportEmail") || null,
  } });
  return json({ saved: true });
};

export default function Settings() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [starStyle, setStarStyle] = useState(settings.starStyle);
  const [reviewFormOn, setReviewFormOn] = useState(settings.reviewFormOn);
  const [requestEmailOn, setRequestEmailOn] = useState(settings.requestEmailOn);
  const [senderName, setSenderName] = useState(settings.senderName || "");
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail || "");

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <Form method="post">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Widget appearance</Text>
                  <BlockStack gap="100">
                    <Text as="span">Accent color</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} style={{ width: 40, height: 40, padding: 0, border: "1px solid #d9d0c5", borderRadius: 6, cursor: "pointer" }} />
                      <div style={{ flexGrow: 1 }}>
                        <TextField label="Accent color" labelHidden name="accentColor" value={accentColor} onChange={setAccentColor} autoComplete="off" helpText="Used for stars, buttons, and the review form." />
                      </div>
                    </InlineStack>
                  </BlockStack>
                  <Select label="Star display style" name="starStyle" options={[{ label: "Solid stars", value: "solid" }, { label: "Outlined stars", value: "outline" }]} value={starStyle} onChange={setStarStyle} />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Review collection</Text>
                  <Checkbox label="Allow customers to submit reviews" name="reviewFormOn" checked={reviewFormOn} onChange={setReviewFormOn} />
                  <Checkbox label="Send a basic email after fulfillment" name="requestEmailOn" checked={requestEmailOn} onChange={setRequestEmailOn} />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Review request emails</Text>
                  <TextField label="Sender name" name="senderName" value={senderName} onChange={setSenderName} autoComplete="off" placeholder="Your store name" helpText="Shown as the email sender, e.g. “Your Store via Review Loom”. Defaults to your shop name if left blank." />
                  <TextField label="Support email" name="supportEmail" type="email" value={supportEmail} onChange={setSupportEmail} autoComplete="off" helpText="Customer replies to review request emails go here instead of to us." />
                </BlockStack>
              </Card>
              <Button submit variant="primary">Save settings</Button>
              {actionData?.saved ? <Text tone="success">Settings saved.</Text> : null}
            </BlockStack>
          </Form>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Reviewloom widget</Text>
              <div className="reviewloom-settings-preview">
                <span className="reviewloom-preview-stars" style={{ color: accentColor }}>★★★★★</span>
                <Text as="p" variant="headingMd">Loved by your customers</Text>
                <Text as="p" tone="subdued">A lightweight rating summary and review list for product pages.</Text>
              </div>
              <Text as="p" tone="subdued">Add the Reviewloom app block to your product template in the theme editor.</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
