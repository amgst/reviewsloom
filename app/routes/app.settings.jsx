import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { BlockStack, Button, Card, Checkbox, Layout, Page, Select, Text, TextField } from "@shopify/polaris";
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
  } });
  return json({ saved: true });
};

export default function Settings() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  return <Page><TitleBar title="Settings" /><Layout><Layout.Section><Form method="post"><BlockStack gap="500"><Card><BlockStack gap="400"><Text as="h2" variant="headingLg">Widget appearance</Text><TextField label="Accent color" name="accentColor" defaultValue={settings.accentColor} autoComplete="off" helpText="Used for stars, buttons, and the review form." /><Select label="Star display style" name="starStyle" options={[{ label: "Solid stars", value: "solid" }, { label: "Outlined stars", value: "outline" }]} defaultValue={settings.starStyle} /></BlockStack></Card><Card><BlockStack gap="400"><Text as="h2" variant="headingLg">Review collection</Text><Checkbox label="Allow customers to submit reviews" name="reviewFormOn" defaultChecked={settings.reviewFormOn} /><Checkbox label="Send a basic email after fulfillment" name="requestEmailOn" defaultChecked={settings.requestEmailOn} /></BlockStack></Card><Button submit variant="primary">Save settings</Button>{actionData?.saved ? <Text tone="success">Settings saved.</Text> : null}</BlockStack></Form></Layout.Section><Layout.Section variant="oneThird"><Card><BlockStack gap="300"><Text as="h2" variant="headingMd">Reviewloom widget</Text><div className="reviewloom-settings-preview"><span className="reviewloom-preview-stars">★★★★★</span><Text as="p" variant="headingMd">Loved by your customers</Text><Text as="p" tone="subdued">A lightweight rating summary and review list for product pages.</Text></div><Text as="p" tone="subdued">Add the Reviewloom app block to your product template in the theme editor.</Text></BlockStack></Card></Layout.Section></Layout></Page>;
}
