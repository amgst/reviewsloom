import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Card, InlineStack, Layout, Page, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const CHART_DAYS = 14;

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildDailyBuckets(reviews) {
  const days = [];
  for (let i = CHART_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push({ key: dayKey(date), label: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }), all: 0, approved: 0, disapproved: 0 });
  }
  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const review of reviews) {
    const bucket = byKey.get(dayKey(new Date(review.createdAt)));
    if (!bucket) continue;
    bucket.all += 1;
    if (review.status === "APPROVED") bucket.approved += 1;
    if (review.status === "REJECTED") bucket.disapproved += 1;
  }
  return days;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CHART_DAYS);

  const [totalReviews, approvedReviews, recentReviews, requests] = await Promise.all([
    prisma.review.count({ where: { shop, deletedAt: null } }),
    prisma.review.findMany({ where: { shop, deletedAt: null, status: "APPROVED" }, select: { rating: true } }),
    prisma.review.findMany({ where: { shop, deletedAt: null, createdAt: { gte: cutoff } }, select: { status: true, createdAt: true } }),
    prisma.reviewRequest.findMany({ where: { shop }, select: { emailId: true, error: true } }),
  ]);

  const approvedCount = approvedReviews.length;
  const averageRating = approvedCount ? approvedReviews.reduce((sum, review) => sum + review.rating, 0) / approvedCount : 0;
  const positiveCount = approvedReviews.filter((review) => review.rating >= 4).length;
  const negativeCount = approvedReviews.filter((review) => review.rating <= 2).length;

  const emailsSent = requests.filter((request) => request.emailId).length;
  const emailsFailed = requests.filter((request) => request.error).length;

  const daily = buildDailyBuckets(recentReviews);

  return json({
    totalReviews,
    approvedCount,
    averageRating: Number(averageRating.toFixed(1)),
    positiveCount,
    negativeCount,
    emailsSent,
    emailsFailed,
    daily,
  });
};

function StatCard({ title, value, rows }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">{title}</Text>
        <Text as="p" variant="heading2xl">{value}</Text>
        <BlockStack gap="100">
          {rows.map((row) => (
            <InlineStack key={row.label} align="space-between">
              <Text as="span" tone="subdued">{row.label}</Text>
              <Text as="span">{row.value}</Text>
            </InlineStack>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function ReviewsChart({ daily }) {
  const max = Math.max(1, ...daily.map((day) => day.all));
  const chartHeight = 160;
  const barGroupWidth = 100 / daily.length;

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">Reviews over the last {CHART_DAYS} days</Text>
        <svg viewBox={`0 0 100 ${chartHeight + 24}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }} role="img" aria-label="Reviews over time">
          {daily.map((day, index) => {
            const x = index * barGroupWidth;
            const allHeight = (day.all / max) * chartHeight;
            const approvedHeight = (day.approved / max) * chartHeight;
            const disapprovedHeight = (day.disapproved / max) * chartHeight;
            return (
              <g key={day.key} transform={`translate(${x}, 0)`}>
                <rect x={barGroupWidth * 0.15} y={chartHeight - allHeight} width={barGroupWidth * 0.7} height={allHeight} fill="#e3d9cb" />
                <rect x={barGroupWidth * 0.15} y={chartHeight - approvedHeight} width={barGroupWidth * 0.32} height={approvedHeight} fill="#2e7d32" />
                <rect x={barGroupWidth * 0.53} y={chartHeight - disapprovedHeight} width={barGroupWidth * 0.32} height={disapprovedHeight} fill="#c0392b" />
              </g>
            );
          })}
        </svg>
        <InlineStack gap="400">
          <InlineStack gap="100" blockAlign="center"><span style={{ width: 10, height: 10, background: "#e3d9cb", display: "inline-block" }} /><Text as="span" tone="subdued">All reviews</Text></InlineStack>
          <InlineStack gap="100" blockAlign="center"><span style={{ width: 10, height: 10, background: "#2e7d32", display: "inline-block" }} /><Text as="span" tone="subdued">Approved reviews</Text></InlineStack>
          <InlineStack gap="100" blockAlign="center"><span style={{ width: 10, height: 10, background: "#c0392b", display: "inline-block" }} /><Text as="span" tone="subdued">Disapproved reviews</Text></InlineStack>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default function Analytics() {
  const { totalReviews, approvedCount, averageRating, positiveCount, negativeCount, emailsSent, emailsFailed, daily } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneThird">
            <StatCard title="Approved reviews" value={approvedCount} rows={[{ label: "Total reviews", value: totalReviews }, { label: "Approved reviews", value: approvedCount }]} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Average rating" value={averageRating || "--"} rows={[{ label: "Positive reviews", value: positiveCount }, { label: "Negative reviews", value: negativeCount }]} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <StatCard title="Email sent" value={emailsSent} rows={[{ label: "Sent", value: emailsSent }, { label: "Failed", value: emailsFailed }]} />
          </Layout.Section>
        </Layout>
        <ReviewsChart daily={daily} />
      </BlockStack>
    </Page>
  );
}
