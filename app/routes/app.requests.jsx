import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Page,
  ResourceItem,
  ResourceList,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendReviewRequestEmail } from "../resend.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const requests = await prisma.reviewRequest.findMany({ where: { shop: session.shop }, orderBy: { sentAt: "desc" }, take: 25 });
  return json({ requests });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const email = formData.get("email");
  const productName = formData.get("productName");
  const productUrl = formData.get("productUrl") || null;
  if (!email || !productName) return json({ error: "A customer email and product name are required." });
  const reviewRequest = await prisma.reviewRequest.create({ data: { shop: session.shop, email, productName, productUrl } });
  const shopSettings = await prisma.reviewSettings.findUnique({ where: { shop: session.shop } });
  const { data, error } = await sendReviewRequestEmail({ id: reviewRequest.id, to: email, productName, productUrl, senderName: shopSettings?.senderName || session.shop.replace(".myshopify.com", ""), replyTo: shopSettings?.supportEmail || undefined });
  if (error) {
    await prisma.reviewRequest.update({ where: { id: reviewRequest.id }, data: { error: error.message } });
    return json({ error: `Couldn't send the email: ${error.message}` });
  }
  await prisma.reviewRequest.update({ where: { id: reviewRequest.id }, data: { emailId: data.id } });
  return json({ sent: true, message: `Review request sent to ${email}.` });
};

function ReviewRequestForm() {
  const requestFetcher = useFetcher();
  const [email, setEmail] = useState("");
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const sending = requestFetcher.state !== "idle";

  useEffect(() => {
    if (requestFetcher.data?.sent) {
      setEmail("");
      setProductName("");
      setProductUrl("");
    }
  }, [requestFetcher.data]);

  return (
    <Card>
      <requestFetcher.Form method="post">
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Send a review request</Text>
          <Text as="p" tone="subdued">Manually email a customer asking for a review. Automatic requests on order fulfillment are on hold pending Shopify's protected customer data approval.</Text>
          <TextField label="Customer email" name="email" type="email" value={email} onChange={setEmail} autoComplete="off" requiredIndicator />
          <TextField label="Product name" name="productName" value={productName} onChange={setProductName} autoComplete="off" requiredIndicator />
          <TextField label="Product page URL" name="productUrl" value={productUrl} onChange={setProductUrl} autoComplete="off" helpText="Optional. Links directly to the review section on that product page." />
          <InlineStack gap="200" blockAlign="center">
            <Button submit variant="primary" disabled={!email || !productName || sending} loading={sending}>Send request</Button>
            {requestFetcher.data?.sent ? <Text tone="success">{requestFetcher.data.message}</Text> : null}
            {requestFetcher.data?.error ? <Text tone="critical">{requestFetcher.data.error}</Text> : null}
          </InlineStack>
        </BlockStack>
      </requestFetcher.Form>
    </Card>
  );
}

function requestStatus(request) {
  if (request.error) return { tone: "critical", label: "Failed" };
  if (request.emailId) return { tone: "success", label: "Sent" };
  return { tone: "attention", label: "Pending" };
}

export default function Requests() {
  const { requests } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Send a review request" />
      <BlockStack gap="500">
        <ReviewRequestForm />
        <Card padding="0">
          <div className="reviewloom-section-heading">
            <Text as="h2" variant="headingLg">Recent requests</Text>
          </div>
          <Divider />
          {requests.length ? (
            <ResourceList
              resourceName={{ singular: "request", plural: "requests" }}
              items={requests}
              renderItem={(request) => {
                const status = requestStatus(request);
                return (
                  <ResourceItem id={request.id}>
                    <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                      <div>
                        <Text as="h3" variant="headingMd">{request.productName}</Text>
                        <Text as="p" tone="subdued">{request.email} · {new Date(request.sentAt).toLocaleString()}</Text>
                        {request.error ? <Text as="p" tone="critical">{request.error}</Text> : null}
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </InlineStack>
                  </ResourceItem>
                );
              }}
            />
          ) : (
            <div className="reviewloom-section-heading"><Text as="p" tone="subdued">No requests sent yet.</Text></div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
