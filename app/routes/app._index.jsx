import { json } from "@remix-run/node";
import { useEffect, useState } from "react";
import {
  Form,
  useFetcher,
  useLoaderData,
  useSearchParams,
} from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Modal,
  Page,
  Pagination,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundedFormData } from "../security.server";
import { autoPublishEligibleReviews } from "../reviews.server";
import {
  inboxQuery,
  inboxWhere,
  moderateReviews,
  PAGE_SIZE,
} from "../review-workflow";
import { OnboardingWizard } from "../components/OnboardingWizard";

export const loader = async ({ request }) => {
  const {
    session: { shop },
  } = await authenticate.admin(request);
  const settings = await prisma.reviewSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
  await autoPublishEligibleReviews(shop, settings.autoPublishThreshold);
  const filters = inboxQuery(new URL(request.url).searchParams);
  const where = inboxWhere(shop, filters);
  const [total, groups, average] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.groupBy({
      by: ["status"],
      where: { shop, deletedAt: null },
      _count: true,
    }),
    prisma.review.aggregate({
      where: { shop, deletedAt: null, status: "APPROVED" },
      _avg: { rating: true },
    }),
  ]);
  const page = Math.min(
    filters.page,
    Math.max(1, Math.ceil(total / PAGE_SIZE)),
  );
  const reviews = await prisma.review.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { images: { orderBy: { position: "asc" } } },
  });
  const events = reviews.length
    ? await prisma.reviewEvent.findMany({
        where: { shop, reviewId: { in: reviews.map(({ id }) => id) } },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    reviews,
    events,
    settings,
    shop,
    filters: { ...filters, page },
    total,
    counts: Object.fromEntries(groups.map((g) => [g.status, g._count])),
    average: average._avg.rating,
  });
};

export const action = async ({ request }) => {
  const {
    session: { shop },
  } = await authenticate.admin(request);
  const data = await boundedFormData(request);
  if (data.get("intent") === "onboarding") {
    const step = data.get("step");
    if (!["theme", "complete"].includes(step))
      return json({ error: "Invalid setup step." }, { status: 400 });
    await prisma.reviewSettings.update({
      where: { shop },
      data:
        step === "theme"
          ? { setupThemeConfirmedAt: new Date() }
          : { onboardingCompletedAt: new Date() },
    });
    return json({ message: "Setup progress saved." });
  }
  const result = await moderateReviews(prisma, {
    shop,
    ids: data.getAll("id"),
    intent: data.get("intent"),
    status: data.get("status"),
  });
  return json(result, { status: result.code || 200 });
};

const statusInfo = {
  PENDING: ["Pending", "attention"],
  APPROVED: ["Published", "success"],
  REJECTED: ["Rejected", "critical"],
};
const tabs = [
  { id: "ALL", content: "All reviews" },
  ...Object.entries(statusInfo).map(([id, [content]]) => ({ id, content })),
];
function Stars({ rating }) {
  return (
    <span className="review-stars" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="empty-stars">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function Reviews() {
  const {
    apiKey,
    reviews,
    events,
    settings,
    shop,
    filters,
    total,
    counts,
    average,
  } = useLoaderData();
  const fetcher = useFetcher();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState(filters.q);
  const [product, setProduct] = useState(filters.product);
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    setSelected([]);
    setDetail(null);
  }, [reviews]);
  useEffect(() => {
    setQ(filters.q);
    setProduct(filters.product);
  }, [filters.q, filters.product]);
  const change = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const submit = (intent, status, ids = selected) => {
    const data = new FormData();
    data.set("intent", intent);
    if (status) data.set("status", status);
    ids.forEach((id) => data.append("id", id));
    fetcher.submit(data, { method: "post" });
  };
  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const activeDetail = reviews.find((r) => r.id === detail);
  return (
    <Page
      title="Reviews"
      subtitle="Build customer trust, one honest review at a time."
      primaryAction={{
        content: "Collect reviews",
        url: "/app/collect-reviews",
      }}
      secondaryActions={[{ content: "Import / export", url: "/app/import" }]}
    >
      <TitleBar title="Reviews" />
      <BlockStack gap="500">
        {!settings.onboardingCompletedAt ? (
          <OnboardingWizard
            settings={settings}
            shop={shop}
            apiKey={apiKey}
            reviewCount={allCount}
          />
        ) : null}
        <div className="reviewloom-metrics">
          {[
            [
              "Awaiting moderation",
              counts.PENDING || 0,
              "Reviews needing your attention",
            ],
            [
              "Published reviews",
              counts.APPROVED || 0,
              "Visible on your storefront",
            ],
            [
              "Average rating",
              average ? average.toFixed(1) : "—",
              "From published reviews",
            ],
          ].map(([label, value, caption]) => (
            <Card key={label}>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm" tone="subdued">
                  {label}
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
        <div aria-live="polite">
          {fetcher.data?.message ? (
            <Banner tone="success">{fetcher.data.message}</Banner>
          ) : null}
          {fetcher.data?.error ? (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          ) : null}
        </div>
        <Card padding="0">
          <Tabs
            tabs={tabs.map((tab) => ({
              ...tab,
              content: `${tab.content} (${tab.id === "ALL" ? allCount : counts[tab.id] || 0})`,
            }))}
            selected={Math.max(
              0,
              tabs.findIndex((t) => t.id === filters.status),
            )}
            onSelect={(index) =>
              change("status", tabs[index].id === "ALL" ? "" : tabs[index].id)
            }
          />
          <div className="reviewloom-inbox-toolbar">
            <Form method="get" className="reviewloom-search-form">
              <input type="hidden" name="status" value={filters.status} />
              <input type="hidden" name="rating" value={filters.rating || ""} />
              <input type="hidden" name="days" value={filters.days || ""} />
              <TextField
                label="Search reviews"
                name="q"
                value={q}
                onChange={setQ}
                placeholder="Customer, product, or review"
                autoComplete="off"
              />
              <TextField
                label="Product"
                name="product"
                value={product}
                onChange={setProduct}
                placeholder="Filter by product name"
                autoComplete="off"
              />
              <Button submit>Search</Button>
            </Form>
            <div className="reviewloom-filter-grid">
              <Select
                label="Rating"
                value={String(filters.rating || "")}
                options={[
                  { label: "All ratings", value: "" },
                  ...[5, 4, 3, 2, 1].map((n) => ({
                    label: `${n} star${n === 1 ? "" : "s"}`,
                    value: String(n),
                  })),
                ]}
                onChange={(value) => change("rating", value)}
              />
              <Select
                label="Date"
                value={String(filters.days || "")}
                options={[
                  { label: "All time", value: "" },
                  ...[7, 30, 90].map((n) => ({
                    label: `Last ${n} days`,
                    value: String(n),
                  })),
                ]}
                onChange={(value) => change("days", value)}
              />
              <Button variant="plain" onClick={() => setParams({})}>
                Clear filters
              </Button>
              <Button url="/app/trash" variant="plain">
                Open trash
              </Button>
            </div>
          </div>
          {reviews.length ? (
            <>
              <div className="reviewloom-bulk-bar">
                <InlineStack gap="300" blockAlign="center">
                  <Checkbox
                    label={
                      selected.length
                        ? `${selected.length} selected`
                        : "Select this page"
                    }
                    checked={
                      selected.length === reviews.length
                        ? true
                        : selected.length
                          ? "indeterminate"
                          : false
                    }
                    onChange={(checked) =>
                      setSelected(checked ? reviews.map((r) => r.id) : [])
                    }
                  />
                  {selected.length ? (
                    <>
                      <Button
                        loading={busy}
                        disabled={busy}
                        onClick={() => submit("moderate", "APPROVED")}
                      >
                        Publish
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => submit("moderate", "REJECTED")}
                      >
                        Reject
                      </Button>
                      <Button disabled={busy} onClick={() => submit("delete")}>
                        Move to trash
                      </Button>
                    </>
                  ) : null}
                </InlineStack>
              </div>
              <div aria-busy={busy}>
                {reviews.map((review) => (
                  <article className="reviewloom-inbox-row" key={review.id}>
                    <Checkbox
                      label={`Select review by ${review.reviewer}`}
                      labelHidden
                      checked={selected.includes(review.id)}
                      onChange={(checked) =>
                        setSelected(
                          checked
                            ? [...selected, review.id]
                            : selected.filter((id) => id !== review.id),
                        )
                      }
                    />
                    <div className="reviewloom-review-copy">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h2" variant="headingSm">
                          {review.productName}
                        </Text>
                        <Badge tone={statusInfo[review.status]?.[1]}>
                          {statusInfo[review.status]?.[0] || review.status}
                        </Badge>

                        {review.source === "import" ? (
                          <Badge>Imported</Badge>
                        ) : null}
                      </InlineStack>
                      <Stars rating={review.rating} />
                      <p className="reviewloom-review-excerpt">{review.body}</p>
                      <Text as="p" tone="subdued">
                        {review.reviewer} ·{" "}
                        {new Date(review.createdAt).toISOString().slice(0, 10)}
                      </Text>
                    </div>
                    <InlineStack gap="200">
                      <Button onClick={() => setDetail(review.id)}>
                        View details
                      </Button>
                      {review.status === "PENDING" ? (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            submit("moderate", "APPROVED", [review.id])
                          }
                        >
                          Publish
                        </Button>
                      ) : null}
                    </InlineStack>
                  </article>
                ))}
              </div>
              <div className="reviewloom-pagination">
                <Text as="p" tone="subdued">
                  {(filters.page - 1) * PAGE_SIZE + 1}–
                  {Math.min(filters.page * PAGE_SIZE, total)} of {total} reviews
                </Text>
                <Pagination
                  hasPrevious={filters.page > 1}
                  hasNext={filters.page * PAGE_SIZE < total}
                  onPrevious={() => change("page", String(filters.page - 1))}
                  onNext={() => change("page", String(filters.page + 1))}
                />
              </div>
            </>
          ) : (
            <div className="reviewloom-empty">
              <Text as="h2" variant="headingLg">
                {allCount
                  ? "No matching reviews"
                  : "Your first review starts here"}
              </Text>
              <Text as="p" tone="subdued">
                {allCount
                  ? "Try another search or clear your filters."
                  : "Import genuine customer feedback or send your first review request."}
              </Text>
              <Button
                url={allCount ? undefined : "/app/collect-reviews"}
                onClick={allCount ? () => setParams({}) : undefined}
              >
                {allCount ? "Clear filters" : "Collect your first review"}
              </Button>
            </div>
          )}
        </Card>
        <Text as="p" tone="subdued">
          Publish genuine feedback of every rating. Deleted reviews can be
          recovered from trash for 30 days.
        </Text>
      </BlockStack>
      <Modal
        open={Boolean(activeDetail)}
        onClose={() => setDetail(null)}
        title="Review details"
      >
        {activeDetail ? (
          <Modal.Section>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Stars rating={activeDetail.rating} />
                <Badge tone={statusInfo[activeDetail.status]?.[1]}>
                  {statusInfo[activeDetail.status]?.[0]}
                </Badge>
              </InlineStack>
              <Text as="h2" variant="headingMd">
                {activeDetail.productName}
              </Text>
              <Text as="p">{activeDetail.body}</Text>
              <Text as="p" tone="subdued">
                {activeDetail.reviewer}
              </Text>
              <div className="reviewloom-photo-grid">
                {[
                  activeDetail.imageUrl,
                  ...activeDetail.images.map((i) => i.url),
                ]
                  .filter(Boolean)
                  .filter((url) => /^https:\/\//i.test(url))
                  .map((url, index) => (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      key={`${url}-${index}`}
                    >
                      <img
                        src={url}
                        alt={`Customer upload ${index + 1}`}
                        loading="lazy"
                        width="120"
                        height="120"
                      />
                    </a>
                  ))}
              </div>
              <InlineStack gap="200">
                <Button
                  disabled={busy}
                  onClick={() =>
                    submit("moderate", "APPROVED", [activeDetail.id])
                  }
                >
                  Publish
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    submit("moderate", "REJECTED", [activeDetail.id])
                  }
                >
                  Reject
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    submit("moderate", "PENDING", [activeDetail.id])
                  }
                >
                  Move to pending
                </Button>
                <Button
                  tone="critical"
                  disabled={busy}
                  onClick={() => submit("delete", null, [activeDetail.id])}
                >
                  Move to trash
                </Button>
              </InlineStack>
              <Text as="h3" variant="headingSm">
                Activity
              </Text>
              <Text as="p" tone="subdued">
                Submitted{" "}
                {new Date(activeDetail.createdAt).toISOString().slice(0, 10)} ·{" "}
                {activeDetail.source}
              </Text>
              {events
                .filter((e) => e.reviewId === activeDetail.id)
                .map((e) => (
                  <Text key={e.id} as="p" tone="subdued">
                    {e.action.replaceAll("_", " ")} ·{" "}
                    {new Date(e.createdAt)
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 16)}{" "}
                    UTC
                  </Text>
                ))}
            </BlockStack>
          </Modal.Section>
        ) : null}
      </Modal>
    </Page>
  );
}
