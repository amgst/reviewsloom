import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Badge,
  Button,
  Card,
  Divider,
  InlineStack,
  Page,
  ResourceItem,
  ResourceList,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { purgeExpiredTrash } from "../reviews.server";

const TRASH_RETENTION_DAYS = 30;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  // Purge and list run together (one round trip, not two): the list query
  // already excludes anything past retention, which is exactly what the purge removes.
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [, reviews] = await Promise.all([
    purgeExpiredTrash(session.shop),
    prisma.review.findMany({ where: { shop: session.shop, deletedAt: { gt: cutoff } }, orderBy: { deletedAt: "desc" } }),
  ]);
  return json({ reviews });
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const id = formData.get("id");

  if (formData.get("intent") === "restore") {
    await prisma.review.update({ where: { id }, data: { deletedAt: null } });
  } else if (formData.get("intent") === "delete-forever") {
    await prisma.review.delete({ where: { id } });
  }
  return json({ ok: true });
};

function daysLeft(deletedAt) {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

export default function Trash() {
  const { reviews } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <Page>
      <TitleBar title="Trash" />
      <Card padding="0">
        <div className="reviewloom-section-heading">
          <div>
            <Text as="h2" variant="headingLg">Deleted reviews</Text>
            <Text as="p" tone="subdued">Reviews stay here for {TRASH_RETENTION_DAYS} days before being permanently removed.</Text>
          </div>
        </div>
        <Divider />
        {reviews.length ? (
          <ResourceList
            resourceName={{ singular: "review", plural: "reviews" }}
            items={reviews}
            renderItem={(review) => (
              <ResourceItem id={review.id}>
                <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                  <div>
                    <InlineStack gap="200">
                      <Text as="h3" variant="headingMd">{review.productName}</Text>
                      <Badge>{`${daysLeft(review.deletedAt)} days left`}</Badge>
                    </InlineStack>
                    <Text as="p">&quot;{review.body}&quot;</Text>
                    <Text as="p" tone="subdued">{review.reviewer} · {review.email}</Text>
                  </div>
                  <InlineStack gap="200">
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="restore" />
                      <input type="hidden" name="id" value={review.id} />
                      <Button submit variant="primary">Restore</Button>
                    </fetcher.Form>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete-forever" />
                      <input type="hidden" name="id" value={review.id} />
                      <Button submit tone="critical">Delete forever</Button>
                    </fetcher.Form>
                  </InlineStack>
                </InlineStack>
              </ResourceItem>
            )}
          />
        ) : (
          <div className="reviewloom-section-heading"><Text as="p" tone="subdued">Trash is empty.</Text></div>
        )}
      </Card>
    </Page>
  );
}
