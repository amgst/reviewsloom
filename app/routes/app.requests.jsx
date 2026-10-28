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
import { emailAddress, httpsUrl } from "../security.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const requests = await prisma.reviewRequest.findMany({
    where: { shop: session.shop },
    orderBy: { sentAt: "desc" },
    take: 25,
  });
  const settings = await prisma.reviewSettings.findUnique({
    where: { shop: session.shop },
  });
  return json({
    requests,
    enabled: settings?.requestEmailOn,
    configured: Boolean(process.env.RESEND_API_KEY && process.env.CRON_SECRET),
  });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  if (["retry", "cancel"].includes(formData.get("intent"))) {
    const retry = formData.get("intent") === "retry";
    const changed = await prisma.reviewRequest.updateMany({
      where: {
        id: String(formData.get("id") || ""),
        shop: session.shop,
        status: { in: retry ? ["FAILED"] : ["QUEUED", "FAILED"] },
        completedAt: null,
      },
      data: retry
        ? {
            status: "QUEUED",
            attempts: 0,
            error: null,
            scheduledAt: new Date(),
          }
        : { status: "CANCELLED", cancelledAt: new Date() },
    });
    return json(
      changed.count
        ? {
            message: retry ? "Request queued for retry." : "Request cancelled.",
          }
        : { error: "Request is unavailable or already being processed." },
      { status: changed.count ? 200 : 409 },
    );
  }
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const productName = String(formData.get("productName") || "").trim();
  const productUrl = httpsUrl(String(formData.get("productUrl") || ""));
  if (
    !emailAddress(email) ||
    !productName ||
    productName.length > 300 ||
    !productUrl
  )
    return json(
      { error: "Enter a valid email, product name, and HTTPS product URL." },
      { status: 400 },
    );
  const shopSettings = await prisma.reviewSettings.findUnique({
    where: { shop: session.shop },
  });
  if (!shopSettings?.requestEmailOn)
    return json(
      { error: "Enable request emails in settings first." },
      { status: 400 },
    );
  if (!process.env.RESEND_API_KEY || !process.env.CRON_SECRET)
    return json(
      { error: "Email delivery is not configured. See the operations guide." },
      { status: 503 },
    );
  if (
    await prisma.emailSuppression.findUnique({
      where: { shop_email: { shop: session.shop, email } },
    })
  )
    return json(
      { error: "This customer has unsubscribed from review requests." },
      { status: 400 },
    );
  const match = new URL(productUrl).pathname.match(/^\/products\/([^/]+)\/?$/);
  if (!match)
    return json(
      {
        error:
          "Use a product page URL, such as https://your-shop.myshopify.com/products/product-handle.",
      },
      { status: 400 },
    );
  const response = await admin.graphql(
    `query RequestProduct($identifier: ProductIdentifierInput!) { productByIdentifier(identifier: $identifier) { id onlineStoreUrl title } }`,
    { variables: { identifier: { handle: decodeURIComponent(match[1]) } } },
  );
  const product = await response.json();
  const productId = product.data?.productByIdentifier?.id?.split("/").pop();
  if (!productId || !product.data.productByIdentifier.onlineStoreUrl)
    return json(
      { error: "Product not found or not published in this store." },
      { status: 400 },
    );
  try {
    await prisma.reviewRequest.create({
      data: {
        shop: session.shop,
        email,
        productName: product.data.productByIdentifier.title,
        productUrl: product.data.productByIdentifier.onlineStoreUrl,
        productId,
        dedupeKey: `manual:${session.shop}:${email}:${productId}:${new Date().toISOString().slice(0, 10)}`,
      },
    });
  } catch (error) {
    if (error.code === "P2002")
      return json(
        {
          error:
            "A request for this customer and product was already queued today.",
        },
        { status: 409 },
      );
    throw error;
  }
  return json({
    sent: true,
    message:
      "Review request queued. Delivery will appear in the activity list.",
  });
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
          <Text as="h2" variant="headingMd">
            Send a review request
          </Text>
          <Text as="p" tone="subdued">
            Queue an honest review request for a customer. Requests are
            delivered in the background, with duplicate protection and retries.
          </Text>
          <TextField
            label="Customer email"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="off"
            requiredIndicator
          />
          <TextField
            label="Product name"
            name="productName"
            value={productName}
            onChange={setProductName}
            autoComplete="off"
            requiredIndicator
          />
          <TextField
            label="Product page URL"
            name="productUrl"
            value={productUrl}
            onChange={setProductUrl}
            autoComplete="off"
            helpText="Paste a product page URL. We match its handle against your store and use Shopify's published URL."
          />
          <InlineStack gap="200" blockAlign="center">
            <Button
              submit
              variant="primary"
              disabled={!email || !productName || !productUrl || sending}
              loading={sending}
            >
              Queue request
            </Button>
            {requestFetcher.data?.sent ? (
              <Text tone="success">{requestFetcher.data.message}</Text>
            ) : null}
            {requestFetcher.data?.error ? (
              <Text tone="critical">{requestFetcher.data.error}</Text>
            ) : null}
          </InlineStack>
        </BlockStack>
      </requestFetcher.Form>
    </Card>
  );
}

function requestStatus(request) {
  if (request.completedAt) return { tone: "success", label: "Review received" };
  if (request.bouncedAt) return { tone: "critical", label: "Bounced" };
  if (request.deliveredAt) return { tone: "success", label: "Delivered" };
  if (request.status === "CANCELLED")
    return { tone: "info", label: "Cancelled" };
  if (request.status === "QUEUED")
    return {
      tone: "attention",
      label: request.attempts ? "Retry scheduled" : "Queued",
    };
  if (request.status === "PROCESSING")
    return { tone: "attention", label: "Sending" };
  if (request.error) return { tone: "critical", label: "Failed" };
  if (request.emailId) return { tone: "success", label: "Sent" };
  return { tone: "attention", label: "Pending" };
}

export default function Requests() {
  const { requests, enabled, configured } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <Page>
      <TitleBar title="Send a review request" />
      <BlockStack gap="500">
        {!enabled || !configured ? (
          <Card>
            <Text as="p" tone="critical">
              {!enabled
                ? "Request emails are paused in settings."
                : "Email delivery needs configuration before requests can be sent."}
            </Text>
          </Card>
        ) : null}
        <div role="status">{fetcher.data?.message || fetcher.data?.error}</div>
        <ReviewRequestForm />
        <Card padding="0">
          <div className="reviewloom-section-heading">
            <Text as="h2" variant="headingLg">
              Recent requests
            </Text>
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
                    <InlineStack
                      align="space-between"
                      blockAlign="start"
                      gap="400"
                      wrap={false}
                    >
                      <div>
                        <Text as="h3" variant="headingMd">
                          {request.productName}
                        </Text>
                        <Text as="p" tone="subdued">
                          {request.email} · Queued{" "}
                          {new Date(request.createdAt)
                            .toISOString()
                            .slice(0, 10)}{" "}
                          · {request.attempts} delivery attempt(s)
                        </Text>
                        {request.error ? (
                          <Text as="p" tone="critical">
                            {request.error}
                          </Text>
                        ) : null}
                      </div>
                      <InlineStack gap="200">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {["QUEUED", "FAILED"].includes(request.status) ? (
                          <Button
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit(
                                { intent: "cancel", id: request.id },
                                { method: "post" },
                              )
                            }
                          >
                            Cancel
                          </Button>
                        ) : null}
                        {request.status === "FAILED" ? (
                          <Button
                            disabled={fetcher.state !== "idle"}
                            onClick={() =>
                              fetcher.submit(
                                { intent: "retry", id: request.id },
                                { method: "post" },
                              )
                            }
                          >
                            Retry
                          </Button>
                        ) : null}
                      </InlineStack>
                    </InlineStack>
                  </ResourceItem>
                );
              }}
            />
          ) : (
            <div className="reviewloom-section-heading">
              <Text as="p" tone="subdued">
                No requests sent yet.
              </Text>
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
