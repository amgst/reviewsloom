import { useState } from "react";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
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
import { settingsInput } from "../settings-validation";
import { ThemeSetupGuide } from "../components/ThemeSetupGuide";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.reviewSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop },
    update: {},
  });
  return json({
    settings,
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") === "restart-onboarding") {
    await prisma.reviewSettings.update({
      where: { shop: session.shop },
      data: { onboardingCompletedAt: null },
    });
    return json({ restarted: true });
  }

  let data;
  try {
    data = settingsInput(formData);
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }
  await prisma.reviewSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });
  return json({ saved: true });
};

export default function Settings() {
  const { settings, shop, apiKey } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [starStyle, setStarStyle] = useState(settings.starStyle);
  const [alignment, setAlignment] = useState(settings.alignment);
  const [reviewFormOn, setReviewFormOn] = useState(settings.reviewFormOn);
  const [customerEligibility, setCustomerEligibility] = useState(
    settings.customerEligibility || "everyone",
  );
  const [autoPublishThreshold, setAutoPublishThreshold] = useState(
    settings.autoPublishThreshold || "disabled",
  );
  const [reviewDiscountPercent, setReviewDiscountPercent] = useState(
    settings.reviewDiscountPercent || "none",
  );

  return (
    <Page
      title="Settings"
      subtitle="Make ReviewLoom feel at home in your store."
    >
      <TitleBar title="Settings" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Add reviews to your theme
                </Text>
                <ThemeSetupGuide shop={shop} apiKey={apiKey} />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Setup wizard
                </Text>
                <Text as="p" tone="subdued">
                  Reopen the setup checklist for widget installation, storefront
                  preview, and your first review.
                </Text>
                <Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="restart-onboarding"
                  />
                  <InlineStack gap="200" blockAlign="center">
                    <Button submit>Restart setup wizard</Button>
                    {actionData?.restarted ? (
                      <Text tone="success">
                        Wizard reset — open the dashboard to run it again.
                      </Text>
                    ) : null}
                  </InlineStack>
                </Form>
              </BlockStack>
            </Card>
            <Form method="post">
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingLg">
                      Widget appearance
                    </Text>
                    <BlockStack gap="100">
                      <Text as="span">Accent color</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <input
                          aria-label="Choose accent color"
                          type="color"
                          value={
                            /^#[0-9a-f]{6}$/i.test(accentColor)
                              ? accentColor
                              : "#D95D39"
                          }
                          onChange={(event) =>
                            setAccentColor(event.target.value)
                          }
                          style={{
                            width: 40,
                            height: 40,
                            padding: 0,
                            border: "1px solid #d9d0c5",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        />
                        <div style={{ flexGrow: 1 }}>
                          <TextField
                            label="Accent color"
                            labelHidden
                            name="accentColor"
                            value={accentColor}
                            onChange={setAccentColor}
                            autoComplete="off"
                            helpText="Used for stars, buttons, and the review form."
                          />
                        </div>
                      </InlineStack>
                    </BlockStack>
                    <Select
                      label="Star display style"
                      name="starStyle"
                      options={[
                        { label: "Solid stars", value: "solid" },
                        { label: "Outlined stars", value: "outline" },
                      ]}
                      value={starStyle}
                      onChange={setStarStyle}
                    />
                    <Select
                      label="Widget alignment"
                      name="alignment"
                      options={[
                        { label: "Center", value: "center" },
                        { label: "Left", value: "left" },
                      ]}
                      value={alignment}
                      onChange={setAlignment}
                      helpText="Where the widget sits on the product page."
                    />
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingLg">
                      Customer eligibility
                    </Text>
                    <input
                      type="hidden"
                      name="customerEligibility"
                      value={customerEligibility}
                    />
                    <BlockStack gap="200">
                      <RadioButton
                        label="Only customers logged in can write reviews"
                        checked={customerEligibility === "loggedIn"}
                        id="customerEligibility-loggedIn"
                        name="customerEligibility-display"
                        onChange={() => setCustomerEligibility("loggedIn")}
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
                    <Text as="h2" variant="headingLg">
                      Automatic publishing
                    </Text>
                    <Text as="p" tone="subdued">
                      Eligible pending reviews publish after 14 days during the
                      next scheduled check or widget visit. Publish genuine
                      feedback of every rating; use moderation for spam and
                      inappropriate content.
                    </Text>
                    <input
                      type="hidden"
                      name="autoPublishThreshold"
                      value={autoPublishThreshold}
                    />
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
                    <Text as="h2" variant="headingLg">
                      Review collection
                    </Text>
                    <input
                      type="hidden"
                      name="reviewFormOn"
                      value={reviewFormOn ? "true" : "false"}
                    />
                    <Checkbox
                      label="Allow customers to submit reviews"
                      checked={reviewFormOn}
                      onChange={setReviewFormOn}
                    />
                  </BlockStack>
                </Card>
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg">
                        Recycle bin
                      </Text>
                      <Text as="p" tone="subdued">
                        Deleted reviews always move to trash for 30 days.
                        Permanent deletion is available in Trash.
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </Card>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingLg">
                      Discount for reviewers
                    </Text>
                    <Text as="p" tone="subdued">
                      Reward customers with a one-time discount code after they
                      submit a review.
                    </Text>
                    <input
                      type="hidden"
                      name="reviewDiscountPercent"
                      value={reviewDiscountPercent}
                    />
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
                <Button
                  submit
                  variant="primary"
                  loading={navigation.state === "submitting"}
                >
                  Save settings
                </Button>
                {actionData?.error ? (
                  <div role="alert">
                    <Text as="p" tone="critical">
                      {actionData.error}
                    </Text>
                  </div>
                ) : null}
                {actionData?.saved ? (
                  <Text tone="success">Settings saved.</Text>
                ) : null}
              </BlockStack>
            </Form>
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Reviewloom widget
              </Text>
              <Text as="p" tone="subdued">
                Live style preview · sample content
              </Text>
              <div
                className="reviewloom-settings-preview"
                style={{
                  textAlign: alignment,
                  "--preview-accent": accentColor,
                }}
              >
                <span
                  className="reviewloom-preview-stars"
                  style={{ color: accentColor }}
                >
                  {starStyle === "outline" ? "☆☆☆☆☆" : "★★★★★"}
                </span>
                <Text as="p" variant="headingMd">
                  Loved by your customers
                </Text>
                <Text as="p" tone="subdued">
                  A lightweight rating summary and review list for product
                  pages.
                </Text>
                {reviewFormOn ? (
                  <button type="button" disabled>
                    Write a review
                  </button>
                ) : (
                  <Text as="p" tone="subdued">
                    Review form paused
                  </Text>
                )}
              </div>
              <Text as="p" tone="subdued">
                Add the Reviewloom app block to your product template in the
                theme editor.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
