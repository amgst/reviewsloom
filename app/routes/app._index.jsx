import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { autoPublishEligibleReviews } from "../reviews.server";
import { OnboardingWizard } from "../components/OnboardingWizard";

const demoReviews = [
  { productId: "demo-1", productName: "Everyday linen shirt", reviewer: "Maya Chen", email: "maya@example.com", rating: 5, body: "Soft, easy to wear, and the fit is exactly right.", status: "PENDING" },
  { productId: "demo-2", productName: "Canvas weekend tote", reviewer: "Jon Bell", email: "jon@example.com", rating: 4, body: "Great size for a weekend away. The handles are sturdy.", status: "APPROVED" },
  { productId: "demo-3", productName: "Ribbed everyday socks", reviewer: "Priya Shah", email: "priya@example.com", rating: 3, body: "Comfortable, though I would love a few more color options.", status: "PENDING" },
];

// Seeding only ever needs to run once per shop, so check first instead of
// paying for an upsert (and a demo-data count query) on every dashboard load.
async function ensureShopInitialized(shop) {
  let settings = await prisma.reviewSettings.findUnique({ where: { shop } });
  if (!settings) {
    [settings] = await Promise.all([
      prisma.reviewSettings.create({ data: { shop } }),
      prisma.review.createMany({ data: demoReviews.map((review) => ({ ...review, shop })) }),
    ]);
  }
  return settings;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await ensureShopInitialized(session.shop);
  await autoPublishEligibleReviews(session.shop, settings.autoPublishThreshold);
  const reviews = await prisma.review.findMany({ where: { shop: session.shop, deletedAt: null }, orderBy: { createdAt: "desc" } });
  return json({ reviews, settings });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const id = formData.get("id");

  if (formData.get("intent") === "onboarding") {
    const data = {};
    if (formData.has("reviewFormOn")) data.reviewFormOn = formData.get("reviewFormOn") === "true";
    if (formData.has("customerEligibility")) data.customerEligibility = formData.get("customerEligibility");
    if (formData.has("reviewDiscountPercent")) data.reviewDiscountPercent = formData.get("reviewDiscountPercent");
    if (formData.get("complete") === "true") data.onboardingCompletedAt = new Date();
    await prisma.reviewSettings.update({ where: { shop: session.shop }, data });
    return json({ ok: true });
  }

  if (formData.get("intent") === "delete") {
    const settings = await prisma.reviewSettings.findUnique({ where: { shop: session.shop }, select: { recycleBinOn: true } });
    if (settings?.recycleBinOn) {
      await prisma.review.update({ where: { id }, data: { deletedAt: new Date() } });
    } else {
      await prisma.review.delete({ where: { id } });
    }
    return json({ ok: true });
  }

  await prisma.review.update({ where: { id }, data: { status: formData.get("status") } });
  return json({ ok: true });
};

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23f1f1f1'/%3E%3C/svg%3E";

const STATUS_BADGES = {
  PENDING: { tone: "warning", label: "Pending" },
  APPROVED: { tone: "success", label: "Published" },
  REJECTED: { tone: "critical", label: "Rejected" },
};

function Stars({ rating }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span role="img" aria-label={`${filled} out of 5 stars`}>
      <s-text tone="warning">{"★".repeat(filled)}</s-text>
      <s-text color="subdued">{"★".repeat(5 - filled)}</s-text>
    </span>
  );
}

function Metric({ label, value, hint }) {
  return (
    <s-box padding="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
        <s-text color="subdued">{hint}</s-text>
      </s-stack>
    </s-box>
  );
}

function ReviewRow({ review, fetcher }) {
  const badge = STATUS_BADGES[review.status] || STATUS_BADGES.PENDING;
  const submit = (fields) => fetcher.submit({ id: review.id, ...fields }, { method: "post" });

  return (
    <s-table-row>
      <s-table-cell>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-thumbnail src={review.imageUrl || PLACEHOLDER_IMAGE} alt="" size="small"></s-thumbnail>
          <s-stack gap="small-200">
            <s-text type="strong">{review.productName}</s-text>
            <s-text color="subdued">{review.reviewer} · {review.email}</s-text>
          </s-stack>
        </s-stack>
      </s-table-cell>
      <s-table-cell><Stars rating={review.rating} /></s-table-cell>
      <s-table-cell>{review.body}</s-table-cell>
      <s-table-cell><s-badge tone={badge.tone}>{badge.label}</s-badge></s-table-cell>
      <s-table-cell>
        <s-stack direction="inline" gap="small">
          {review.status === "PENDING" ? (
            <>
              <s-button variant="primary" onClick={() => submit({ intent: "moderate", status: "APPROVED" })}>Approve</s-button>
              <s-button onClick={() => submit({ intent: "moderate", status: "REJECTED" })}>Reject</s-button>
            </>
          ) : null}
          <s-button tone="critical" variant="tertiary" onClick={() => submit({ intent: "delete" })}>Delete</s-button>
        </s-stack>
      </s-table-cell>
    </s-table-row>
  );
}

export default function Index() {
  const { reviews, settings } = useLoaderData();
  const fetcher = useFetcher();
  const onboardingFetcher = useFetcher();
  const pending = reviews.filter((review) => review.status === "PENDING");
  const approved = reviews.filter((review) => review.status === "APPROVED");
  const averageRating = approved.length ? approved.reduce((sum, review) => sum + review.rating, 0) / approved.length : null;

  return (
    <s-page heading="Reviews" inlineSize="large">
      <s-button slot="primary-action" variant="primary" href="/app/requests">Send review request</s-button>
      {!settings?.onboardingCompletedAt ? <OnboardingWizard settings={settings} fetcher={onboardingFetcher} /> : null}

      <s-section padding="none" accessibilityLabel="Review metrics">
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="none">
          <Metric label="Pending" value={pending.length} hint="Waiting for your decision" />
          <Metric label="Published" value={approved.length} hint="Visible on your storefront" />
          <Metric label="Average rating" value={averageRating ? averageRating.toFixed(1) : "–"} hint="From published reviews" />
        </s-grid>
      </s-section>

      <s-section padding="none" heading="Moderation queue">
        <s-badge slot="supplemental" tone={pending.length ? "warning" : "success"}>{pending.length ? `${pending.length} to review` : "All caught up"}</s-badge>
        {reviews.length ? (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Review</s-table-header>
              <s-table-header>Rating</s-table-header>
              <s-table-header>Comment</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {reviews.map((review) => <ReviewRow key={review.id} review={review} fetcher={fetcher} />)}
            </s-table-body>
          </s-table>
        ) : (
          <s-box padding="base"><s-text color="subdued">No reviews yet. They&apos;ll appear here as customers submit them.</s-text></s-box>
        )}
      </s-section>

      <s-section slot="aside" heading="Store status">
        <s-stack gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-text>Review form</s-text>
            <s-badge tone={settings?.reviewFormOn ? "success" : "neutral"}>{settings?.reviewFormOn ? "Live" : "Paused"}</s-badge>
          </s-stack>
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-text>Request emails</s-text>
            <s-badge tone={settings?.requestEmailOn ? "success" : "neutral"}>{settings?.requestEmailOn ? "On" : "Off"}</s-badge>
          </s-stack>
          <s-button href="/app/settings">Open settings</s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Storefront preview">
        <s-stack gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small">
              <s-stack direction="inline" gap="small" alignItems="center">
                <Stars rating={averageRating || 0} />
                <s-text type="strong">{averageRating ? averageRating.toFixed(1) : "No ratings yet"}</s-text>
              </s-stack>
              <s-text color="subdued">{approved.length} published {approved.length === 1 ? "review" : "reviews"}</s-text>
            </s-stack>
          </s-box>
          <s-button href="/app/settings">Customize widget</s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}
