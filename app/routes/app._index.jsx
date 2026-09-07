import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  ResourceItem,
  ResourceList,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const demoReviews = [
  { productId: "demo-1", productName: "Everyday linen shirt", reviewer: "Maya Chen", email: "maya@example.com", rating: 5, body: "Soft, easy to wear, and the fit is exactly right.", status: "PENDING" },
  { productId: "demo-2", productName: "Canvas weekend tote", reviewer: "Jon Bell", email: "jon@example.com", rating: 4, body: "Great size for a weekend away. The handles are sturdy.", status: "APPROVED" },
  { productId: "demo-3", productName: "Ribbed everyday socks", reviewer: "Priya Shah", email: "priya@example.com", rating: 3, body: "Comfortable, though I would love a few more color options.", status: "PENDING" },
];

async function ensureDemoData(shop) {
  const count = await prisma.review.count({ where: { shop } });
  if (!count) await prisma.review.createMany({ data: demoReviews.map((review) => ({ ...review, shop })) });
  await prisma.reviewSettings.upsert({ where: { shop }, update: {}, create: { shop } });
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  await ensureDemoData(session.shop);
  const [reviews, settings] = await Promise.all([
    prisma.review.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" } }),
    prisma.reviewSettings.findUnique({ where: { shop: session.shop } }),
  ]);
  return json({ reviews, settings });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "moderate") await prisma.review.update({ where: { id: formData.get("id") }, data: { status: formData.get("status") } });
  if (intent === "request") return json({ sent: true, message: "Review request queued for the next fulfilled order." });
  if (intent === "settings") await prisma.reviewSettings.update({ where: { shop: session.shop }, data: { accentColor: formData.get("accentColor"), starStyle: formData.get("starStyle"), reviewFormOn: formData.get("reviewFormOn") === "on", requestEmailOn: formData.get("requestEmailOn") === "on" } });
  return json({ ok: true });
};

function Stars({ rating }) {
  return <span className="review-stars" aria-label={`${rating} out of 5 stars`}>{"★".repeat(rating)}<span className="empty-stars">{"★".repeat(5 - rating)}</span></span>;
}

export default function Index() {
  const { reviews, settings } = useLoaderData();
  const fetcher = useFetcher();
  const pending = reviews.filter((review) => review.status === "PENDING");
  const approved = reviews.filter((review) => review.status === "APPROVED");

  return (
    <Page>
      <TitleBar title="Reviewloom" />
      <div className="reviewloom-shell">
        <div className="reviewloom-intro"><div><Text as="p" variant="bodyMd" tone="subdued">Your store's quiet proof</Text><Text as="h1" variant="headingXl">Reviews that feel human.</Text></div><fetcher.Form method="post"><input type="hidden" name="intent" value="request" /><Button submit variant="primary">Send a review request</Button></fetcher.Form></div>
        <div className="reviewloom-metrics"><Card><Text as="p" tone="subdued">Awaiting your review</Text><Text as="p" variant="heading2xl">{pending.length}</Text><Text as="p" tone="subdued">Needs a decision</Text></Card><Card><Text as="p" tone="subdued">Published reviews</Text><Text as="p" variant="heading2xl">{approved.length}</Text><Text as="p" tone="subdued">Visible on your storefront</Text></Card><Card><Text as="p" tone="subdued">Average rating</Text><Text as="p" variant="heading2xl">{approved.length ? (approved.reduce((sum, review) => sum + review.rating, 0) / approved.length).toFixed(1) : "-"}</Text><Text as="p" tone="subdued">From published reviews</Text></Card></div>
        <Layout>
          <Layout.Section><Card padding="0"><div className="reviewloom-section-heading"><div><Text as="h2" variant="headingLg">Moderation queue</Text><Text as="p" tone="subdued">A quick look before reviews reach your product pages.</Text></div><Badge tone={pending.length ? "attention" : "success"}>{pending.length ? `${pending.length} to review` : "All caught up"}</Badge></div><Divider /><ResourceList resourceName={{ singular: "review", plural: "reviews" }} items={reviews} renderItem={(review) => <ResourceItem id={review.id}><InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}><Thumbnail source={review.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23f3eee9'/%3E%3C/svg%3E"} alt="" size="small" /><div className="reviewloom-review-copy"><InlineStack gap="200"><Text as="h3" variant="headingMd">{review.productName}</Text><Stars rating={review.rating} /></InlineStack><Text as="p">&quot;{review.body}&quot;</Text><Text as="p" tone="subdued">{review.reviewer} · {review.email}</Text></div><InlineStack gap="200">{review.status === "PENDING" ? <><fetcher.Form method="post"><input type="hidden" name="intent" value="moderate" /><input type="hidden" name="id" value={review.id} /><input type="hidden" name="status" value="APPROVED" /><Button submit variant="primary">Approve</Button></fetcher.Form><fetcher.Form method="post"><input type="hidden" name="intent" value="moderate" /><input type="hidden" name="id" value={review.id} /><input type="hidden" name="status" value="REJECTED" /><Button submit>Reject</Button></fetcher.Form></> : <Badge tone="success">Published</Badge>}</InlineStack></InlineStack></ResourceItem>} /></Card></Layout.Section>
          <Layout.Section variant="oneThird"><Card><BlockStack gap="300"><Text as="h2" variant="headingLg">Storefront preview</Text><div className="reviewloom-preview"><Text as="p" tone="subdued">Average customer rating</Text><InlineStack gap="200" blockAlign="center"><Stars rating={5} /><Text as="p" variant="headingMd">4.8</Text></InlineStack><Divider /><Text as="p" variant="headingMd">What customers are saying</Text><Text as="p">&quot;Beautiful quality and arrived sooner than expected.&quot;</Text><Text as="p" tone="subdued">- Emma R.</Text></div><Button url="/app/settings">Customize widget</Button></BlockStack></Card><Card><BlockStack gap="200"><Text as="h2" variant="headingMd">Your setup</Text><Text as="p" tone="subdued">{settings?.reviewFormOn ? "Review form is live" : "Review form is paused"}</Text><Text as="p" tone="subdued">{settings?.requestEmailOn ? "Request emails are on" : "Request emails are off"}</Text><Button url="/app/settings" variant="plain">Open settings</Button></BlockStack></Card></Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}
