import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  BlockStack,
  Card,
  DataTable,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const {
    session: { shop },
  } = await authenticate.admin(request);
  const value = Number(new URL(request.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(value) ? value : 30;
  const end = new Date();
  end.setUTCHours(24, 0, 0, 0);
  const start = new Date(end.getTime() - days * 86400000);
  const previous = new Date(start.getTime() - days * 86400000);
  const where = { shop, deletedAt: null, createdAt: { gte: start, lt: end } };
  const [current, prior, approved, dailyRows, products, funnelRows] =
    await Promise.all([
      prisma.review.aggregate({ where, _count: true, _avg: { rating: true } }),
      prisma.review.count({
        where: {
          shop,
          deletedAt: null,
          createdAt: { gte: previous, lt: start },
        },
      }),
      prisma.review.count({ where: { ...where, status: "APPROVED" } }),
      prisma.$queryRaw`SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, COUNT(*)::int AS count FROM "Review" WHERE shop = ${shop} AND "deletedAt" IS NULL AND "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY day ORDER BY day`,
      prisma.review.groupBy({
        by: ["productId", "productName"],
        where,
        _count: true,
        _avg: { rating: true },
        orderBy: { _count: { productId: "desc" } },
        take: 10,
      }),
      prisma.$queryRaw`SELECT COUNT(*)::int AS queued, COUNT(*) FILTER (WHERE r."emailId" IS NOT NULL)::int AS sent, COUNT(*) FILTER (WHERE r."deliveredAt" IS NOT NULL)::int AS delivered, COUNT(*) FILTER (WHERE r."bouncedAt" IS NOT NULL)::int AS bounced, COUNT(*) FILTER (WHERE r."completedAt" IS NOT NULL)::int AS completed, COUNT(*) FILTER (WHERE v.status = 'APPROVED' AND v."deletedAt" IS NULL)::int AS published FROM "ReviewRequest" r LEFT JOIN "Review" v ON v."requestId" = r.id AND v.shop = r.shop WHERE r.shop = ${shop} AND r."parentId" IS NULL AND r."createdAt" >= ${start} AND r."createdAt" < ${end}`,
    ]);
  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Date(start.getTime() + index * 86400000)
      .toISOString()
      .slice(0, 10);
    return { day, count: dailyRows.find((r) => r.day === day)?.count || 0 };
  });
  return json({
    days,
    current: current._count,
    average: current._avg.rating,
    prior,
    approved,
    daily,
    products: products.map((p) => ({
      name: p.productName,
      count: p._count,
      average: p._avg.rating,
    })),
    funnel: funnelRows[0],
  });
};

export default function Analytics() {
  const { days, current, average, prior, approved, daily, products, funnel } =
    useLoaderData();
  const [, setParams] = useSearchParams();
  const change = prior
    ? `${Math.round(((current - prior) / prior) * 100)}% versus previous ${days} days`
    : "No reviews in the previous period";
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <Page
      title="Analytics"
      subtitle="Understand your review collection and customer feedback."
    >
      <TitleBar title="Analytics" />
      <BlockStack gap="500">
        <InlineStack align="end">
          <Select
            label="Reporting period (UTC)"
            value={String(days)}
            options={[7, 30, 90].map((n) => ({
              label: `Last ${n} days`,
              value: String(n),
            }))}
            onChange={(value) => setParams({ days: value })}
          />
        </InlineStack>
        <div className="reviewloom-metrics">
          {[
            ["Reviews received", current, change],
            [
              "Average rating",
              average ? average.toFixed(1) : "—",
              "All received ratings, including pending feedback",
            ],
            ["Published", approved, "From reviews received in this period"],
          ].map(([title, value, caption]) => (
            <Card key={title}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  {title}
                </Text>
                <Text as="p" variant="heading2xl">
                  {value}
                </Text>
                <Text as="p" tone="subdued">
                  {caption}
                </Text>
              </BlockStack>
            </Card>
          ))}
        </div>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              Review request funnel
            </Text>
            <Text as="p" tone="subdued">
              Original requests created in this period. Delivery and review
              outcomes update as customers respond. Reminders are excluded.
            </Text>
            <div className="reviewloom-funnel">
              {[
                ["Queued", funnel.queued],
                ["Sent", funnel.sent],
                ["Delivered", funnel.delivered],
                ["Review received", funnel.completed],
                ["Published", funnel.published],
              ].map(([title, value]) => (
                <div key={title}>
                  <Text as="p" variant="headingXl">
                    {value}
                  </Text>
                  <Text as="h3" variant="headingSm">
                    {title}
                  </Text>
                </div>
              ))}
            </div>
            <InlineStack gap="500">
              <Text as="p">
                Request completion:{" "}
                {funnel.sent
                  ? `${((funnel.completed / funnel.sent) * 100).toFixed(1)}%`
                  : "—"}
              </Text>
              <Text as="p">Bounces: {funnel.bounced}</Text>
            </InlineStack>
            <Text as="p" tone="subdued">
              Delivered counts require email provider webhook configuration.
              Revenue attribution is not tracked.
            </Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              Reviews over time
            </Text>
            {current ? (
              <div
                className="reviewloom-bar-chart"
                role="img"
                aria-label={`${current} reviews received over ${days} days. Daily values are available in the table below.`}
              >
                {daily.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.count}`}
                    style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                  />
                ))}
              </div>
            ) : (
              <Text as="p" tone="subdued">
                No reviews received during this period.
              </Text>
            )}
            <InlineStack align="space-between">
              <Text as="p" tone="subdued">
                {daily[0].day}
              </Text>
              <Text as="p" tone="subdued">
                {daily[daily.length - 1].day}
              </Text>
            </InlineStack>
            <details>
              <summary>View daily numbers</summary>
              <DataTable
                columnContentTypes={["text", "numeric"]}
                headings={["Date (UTC)", "Reviews"]}
                rows={daily.map((d) => [d.day, d.count])}
              />
            </details>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Top products by review volume
            </Text>
            {products.length ? (
              <DataTable
                columnContentTypes={["text", "numeric", "numeric"]}
                headings={["Product", "Reviews", "Average rating"]}
                rows={products.map((p) => [
                  p.name,
                  p.count,
                  p.average?.toFixed(1) || "—",
                ])}
              />
            ) : (
              <Text as="p" tone="subdued">
                Product insights will appear when reviews arrive.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
