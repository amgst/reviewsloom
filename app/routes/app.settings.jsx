import { useEffect, useRef, useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
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

// React 18 renders `true` on a custom element as the string "true" and `false` as "false",
// both of which read as present, so only ever pass a boolean attribute when it is on.
const on = (condition) => (condition ? true : undefined);

const ELIGIBILITY_OPTIONS = [
  { value: "loggedIn", label: "Only customers logged in can write reviews" },
  { value: "verifiedBuyer", label: "Only verified buyers can write reviews" },
  { value: "everyone", label: "Everyone can write reviews" },
];

const AUTO_PUBLISH_OPTIONS = [
  { value: "5stars", label: "5 star reviews" },
  { value: "4plus", label: "4 stars and up" },
  { value: "all", label: "All reviews" },
  { value: "disabled", label: "Disabled" },
];

const DISCOUNT_OPTIONS = [
  { value: "10", label: "10% discount" },
  { value: "20", label: "20% discount" },
  { value: "none", label: "No discount" },
];

function ChoiceGroup({ label, name, options, value }) {
  return (
    <s-choice-list label={label} labelAccessibilityVisibility="exclusive" name={name}>
      {options.map((option) => (
        <s-choice key={option.value} value={option.value} selected={on(option.value === value)}>{option.label}</s-choice>
      ))}
    </s-choice-list>
  );
}

export default function Settings() {
  const { settings, shop } = useLoaderData();
  const actionData = useActionData();
  const shopify = useAppBridge();
  const colorFieldRef = useRef(null);
  const [accentColor, setAccentColor] = useState(settings.accentColor);

  useEffect(() => {
    if (actionData?.saved) shopify.toast.show("Settings saved");
    if (actionData?.restarted) shopify.toast.show("Setup wizard reset. Open the dashboard to run it again.");
  }, [actionData, shopify]);

  // Web component events aren't wired through React 18's onChange, so listen directly.
  useEffect(() => {
    const field = colorFieldRef.current;
    if (!field) return undefined;
    const handleInput = (event) => setAccentColor(event.currentTarget.value);
    field.addEventListener("input", handleInput);
    return () => field.removeEventListener("input", handleInput);
  }, []);

  return (
    <s-page heading="Settings" inlineSize="base">
      <Form method="post" data-save-bar>
        <s-stack gap="base">
          <s-section heading="Widget appearance">
            <s-stack gap="base">
              <s-color-field ref={colorFieldRef} label="Accent color" name="accentColor" value={settings.accentColor} details="Used for stars, buttons, and the review form."></s-color-field>
              <s-select label="Star display style" name="starStyle" value={settings.starStyle}>
                <s-option value="solid">Solid stars</s-option>
                <s-option value="outline">Outlined stars</s-option>
              </s-select>
              <s-select label="Widget alignment" name="alignment" value={settings.alignment} details="Where the widget sits on the product page.">
                <s-option value="center">Center</s-option>
                <s-option value="left">Left</s-option>
              </s-select>
            </s-stack>
          </s-section>

          <s-section heading="Review collection">
            <s-stack gap="base">
              <s-switch label="Allow customers to submit reviews" name="reviewFormOn" value="true" defaultChecked={on(settings.reviewFormOn)}></s-switch>
              <s-switch label="Send a basic email after fulfillment" name="requestEmailOn" value="true" defaultChecked={on(settings.requestEmailOn)}></s-switch>
            </s-stack>
          </s-section>

          <s-section heading="Customer eligibility">
            <ChoiceGroup label="Customer eligibility" name="customerEligibility" options={ELIGIBILITY_OPTIONS} value={settings.customerEligibility || "everyone"} />
          </s-section>

          <s-section heading="Auto-publish positive reviews">
            <s-stack gap="base">
              <s-paragraph color="subdued">After 14 days, any uncurated reviews will be automatically published. We highly recommend publishing all valid reviews as soon as possible.</s-paragraph>
              <ChoiceGroup label="Auto-publish positive reviews" name="autoPublishThreshold" options={AUTO_PUBLISH_OPTIONS} value={settings.autoPublishThreshold || "disabled"} />
            </s-stack>
          </s-section>

          <s-section heading="Discount for reviewers">
            <s-stack gap="base">
              <s-paragraph color="subdued">Reward customers with a one-time discount code after they submit a review.</s-paragraph>
              <ChoiceGroup label="Discount for reviewers" name="reviewDiscountPercent" options={DISCOUNT_OPTIONS} value={settings.reviewDiscountPercent || "none"} />
            </s-stack>
          </s-section>

          <s-section heading="Review request emails">
            <s-stack gap="base">
              <s-text-field label="Sender name" name="senderName" value={settings.senderName || ""} placeholder="Your store name" details="Shown as the email sender, e.g. “Your Store via Review Loom”. Defaults to your shop name if left blank."></s-text-field>
              <s-email-field label="Support email" name="supportEmail" value={settings.supportEmail || ""} details="Customer replies to review request emails go here instead of to us."></s-email-field>
            </s-stack>
          </s-section>

          <s-section heading="Recycle bin">
            <s-switch label="Enable recycle bin" name="recycleBinOn" value="true" defaultChecked={on(settings.recycleBinOn)} details="When on, deleted reviews move to the trash for 30 days instead of being removed immediately."></s-switch>
          </s-section>
        </s-stack>
      </Form>

      <s-section slot="aside" heading="Widget preview">
        <s-stack gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small">
              <span style={{ color: accentColor, letterSpacing: "1px" }}>★★★★★</span>
              <s-text type="strong">Loved by your customers</s-text>
              <s-text color="subdued">A lightweight rating summary and review list for product pages.</s-text>
            </s-stack>
          </s-box>
          <s-text color="subdued">Add the Reviewloom app block to your product template in the theme editor.</s-text>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Change your theme">
        <s-stack gap="base">
          <s-paragraph color="subdued">If you switch themes, re-add the Reviewloom app block from the theme editor&apos;s App embeds panel so reviews keep showing on product pages.</s-paragraph>
          <s-button href={`https://${shop}/admin/themes/current/editor?context=apps`} target="_blank">Open theme editor</s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Setup wizard">
        <Form method="post">
          <input type="hidden" name="intent" value="restart-onboarding" />
          <s-stack gap="base">
            <s-paragraph color="subdued">Restart the quick setup wizard to walk through enabling reviews, customer eligibility, and reviewer discounts again.</s-paragraph>
            <s-button type="submit">Restart setup wizard</s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
