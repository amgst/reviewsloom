import { BlockStack, Button, Card, Layout, Page, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

function CollectCard({ title, description, action, url }) {
  return (
    <Layout.Section variant="oneThird">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">{title}</Text>
          <Text as="p" tone="subdued">{description}</Text>
          <Button url={url}>{action}</Button>
        </BlockStack>
      </Card>
    </Layout.Section>
  );
}

export default function CollectReviews() {
  return (
    <Page>
      <TitleBar title="Collect reviews" />
      <BlockStack gap="500">
        <Text as="p" tone="subdued">Proactively collect and motivate customers to leave reviews.</Text>
        <Layout>
          <CollectCard
            title="Review request"
            description="Manually email a customer asking for a review of a recent order."
            action="Manage"
            url="/app/requests"
          />
          <CollectCard
            title="Import & export reviews"
            description="Import reviews you already have from other platforms, or export your current reviews, via CSV."
            action="Import / export"
            url="/app/import"
          />
          <CollectCard
            title="Email notifications"
            description="Customize the sender name and reply-to address used on review request emails."
            action="Setup"
            url="/app/settings"
          />
          <CollectCard
            title="Discount"
            description="Incentivize customers to leave more reviews and make more purchases by discounts."
            action="Setup"
            url="/app/settings"
          />
          <CollectCard
            title="QR code generator"
            description="Generate product-specific QR codes and make reviewing easier than ever."
            action="Setup"
            url="/app/qr-code"
          />
        </Layout>
      </BlockStack>
    </Page>
  );
}
