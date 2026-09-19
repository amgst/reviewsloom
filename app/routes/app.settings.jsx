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
  RadioButton,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  let settings = await prisma.reviewSettings.findUnique({ where: { shop: session.shop } });
  if (!settings) settings = await prisma.reviewSettings.create({ data: { shop: session.shop } });
  return json({ settings, shop: session.shop });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const isEnabled = (name) => formData.get(name) === "true";

  if (formData.get("intent") === "restart-onboarding") {
    await prisma.reviewSettings.update({ where: { shop: session.shop }, data: { onboardingCompletedAt: null } });
    return json({ restarted: true });
  }

  await prisma.reviewSettings.update({ where: { shop: session.shop }, data: {
    accentColor: formData.get("accentColor") || "#D95D39",
    starStyle: formData.get("starStyle") || "solid",
    alignment: formData.get("alignment") || "center",
    reviewFormOn: isEnabled("reviewFormOn"),
    requestEmailOn: isEnabled("requestEmailOn"),
    senderName: formData.get("senderName") || null,
    supportEmail: formData.get("supportEmail") || null,
    customerEligibility: formData.get("customerEligibility") || "everyone",
    autoPublishThreshold: formData.get("autoPublishThreshold") || "disabled",
    recycleBinOn: isEnabled("recycleBinOn"),
    reviewDiscountPercent: formData.get("reviewDiscountPercent") || "none",
  } });
  return json({ saved: true });
};

export default function Settings() {
  const { settings, shop } = useLoaderData();
  const actionData = useActionData();
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [starStyle, setStarStyle] = useState(settings.starStyle);
  const [alignment, setAlignment] = useState(settings.alignment);
  const [reviewFormOn, setReviewFormOn] = useState(settings.reviewFormOn);
  const [requestEmailOn, setRequestEmailOn] = useState(settings.requestEmailOn);
  const [senderName, setSenderName] = useState(settings.senderName || "");
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail || "");
  const [customerEligibility, setCustomerEligibility] = useState(settings.customerEligibility || "everyone");
  const [autoPublishThreshold, setAutoPublishThreshold] = useState(settings.autoPublishThreshold || "disabled");
  const [recycleBinOn, setRecycleBinOn] = useState(settings.recycleBinOn || false);
  const [reviewDiscountPercent, setReviewDiscountPercent] = useState(settings.reviewDiscountPercent || "none");

  return (
    <Page>
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">Change your theme</Text>
                <Text as="p" tone="subdued">If you switch themes, re-add the Reviewloom app block from the theme editor's App embeds panel so reviews keep showing on product pages.</Text>
                <InlineStack>
                  <Button url={`https://${shop}/admin/themes/current/editor?context=apps`} target="_blank">Open theme editor</Button>
                </InlineStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">Setup wizard</Text>
                <Text as="p" tone="subdued">Restart the quick setup wizard to walk through enabling reviews, customer eligibility, and reviewer discounts again.</Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="restart-onboarding" />
                  <InlineStack gap="200" blockAlign="center">
                    <Button submit>Restart setup wizard</Button>
                    {actionData?.restarted ? <Text tone="success">Wizard reset — open the dashboard to run it again.</Text> : null}
                  </InlineStack>
                </Form>
              </BlockStack>
            </Card>
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
                  <Select label="Widget alignment" name="alignment" options={[{ label: "Center", value: "center" }, { label: "Left", value: "left" }]} value={alignment} onChange={setAlignment} helpText="Where the widget sits on the product page." />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Customer eligibility</Text>
                  <input type="hidden" name="customerEligibility" value={customerEligibility} />
                  <BlockStack gap="200">
                    <RadioButton
                      label="Only customers logged in can write reviews"
                      checked={customerEligibility === "loggedIn"}
                      id="customerEligibility-loggedIn"
                      name="customerEligibility-display"
                      onChange={() => setCustomerEligibility("loggedIn")}
                    />
                    <RadioButton
                      label="Only verified buyers can write reviews"
                      checked={customerEligibility === "verifiedBuyer"}
                      id="customerEligibility-verifiedBuyer"
                      name="customerEligibility-display"
                      onChange={() => setCustomerEligibility("verifiedBuyer")}
                    />
                    <RadioButton
                      label="Everyone can write reviews"
                      checked={customerEligibility === "everyone"}
                      id="customerEligibility-everyone"
                      name="customerEligibility-display"
                      onChange={() => setCustomerEligibility("everyone")}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Auto-publish positive reviews</Text>
                  <Text as="p" tone="subdued">After 14 days, any uncurated reviews will be automatically published. We highly recommend publishing all valid reviews as soon as possible.</Text>
                  <input type="hidden" name="autoPublishThreshold" value={autoPublishThreshold} />
                  <BlockStack gap="200">
                    <RadioButton
                      label="5 stars reviews"
                      checked={autoPublishThreshold === "5stars"}
                      id="autoPublishThreshold-5stars"
                      name="autoPublishThreshold-display"
                      onChange={() => setAutoPublishThreshold("5stars")}
                    />
                    <RadioButton
                      label="4 stars and up"
                      checked={autoPublishThreshold === "4plus"}
                      id="autoPublishThreshold-4plus"
                      name="autoPublishThreshold-display"
                      onChange={() => setAutoPublishThreshold("4plus")}
                    />
                    <RadioButton
                      label="All reviews"
                      checked={autoPublishThreshold === "all"}
                      id="autoPublishThreshold-all"
                      name="autoPublishThreshold-display"
                      onChange={() => setAutoPublishThreshold("all")}
                    />
                    <RadioButton
                      label="Disabled"
                      checked={autoPublishThreshold === "disabled"}
                      id="autoPublishThreshold-disabled"
                      name="autoPublishThreshold-display"
                      onChange={() => setAutoPublishThreshold("disabled")}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Review collection</Text>
                  <input type="hidden" name="reviewFormOn" value={reviewFormOn ? "true" : "false"} />
                  <Checkbox label="Allow customers to submit reviews" checked={reviewFormOn} onChange={setReviewFormOn} />
                  <input type="hidden" name="requestEmailOn" value={requestEmailOn ? "true" : "false"} />
                  <Checkbox label="Send a basic email after fulfillment" checked={requestEmailOn} onChange={setRequestEmailOn} />
                </BlockStack>
              </Card>
              <Card>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg">Recycle bin</Text>
                    <Text as="p" tone="subdued">When on, deleted reviews move to the trash for 30 days instead of being removed immediately.</Text>
                  </BlockStack>
                  <input type="hidden" name="recycleBinOn" value={recycleBinOn ? "true" : "false"} />
                  <Checkbox label="Enable recycle bin" labelHidden checked={recycleBinOn} onChange={setRecycleBinOn} />
                </InlineStack>
              </Card>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Discount for reviewers</Text>
                  <Text as="p" tone="subdued">Reward customers with a one-time discount code after they submit a review.</Text>
                  <input type="hidden" name="reviewDiscountPercent" value={reviewDiscountPercent} />
                  <BlockStack gap="200">
                    <RadioButton
                      label="10% discount"
                      checked={reviewDiscountPercent === "10"}
                      id="reviewDiscountPercent-10"
                      name="reviewDiscountPercent-display"
                      onChange={() => setReviewDiscountPercent("10")}
                    />
                    <RadioButton
                      label="20% discount"
                      checked={reviewDiscountPercent === "20"}
                      id="reviewDiscountPercent-20"
                      name="reviewDiscountPercent-display"
                      onChange={() => setReviewDiscountPercent("20")}
                    />
                    <RadioButton
                      label="No discount"
                      checked={reviewDiscountPercent === "none"}
                      id="reviewDiscountPercent-none"
                      name="reviewDiscountPercent-display"
                      onChange={() => setReviewDiscountPercent("none")}
                    />
                  </BlockStack>
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
          </BlockStack>
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
