import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function Help() {
  return (
    <Page
      title="Help & getting started"
      subtitle="Get your reviews live and keep collection running smoothly."
    >
      <TitleBar title="Help" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Install your storefront widget
            </Text>
            <Text as="p">
              Open your theme editor and select a product template. Add the
              ReviewLoom Reviews app block, or enable the auto-embed in App
              embeds, then save. Preview a product that uses that template on
              both desktop and mobile.
            </Text>
            <Text as="p" tone="subdued">
              Use one main reviews widget per product page. Your setup checklist
              detects a widget connection; you still need to check its placement
              in the theme.
            </Text>
            <InlineStack gap="200">
              <Button url="/app/settings">Customize widget</Button>
              <Button url="/app">Open setup checklist</Button>
            </InlineStack>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Why isn't a review visible?
            </Text>
            <Text as="p">
              Check its status in Reviews. Pending and rejected reviews stay
              hidden until published. Confirm the widget is on the correct
              product template and the review belongs to that product.
            </Text>
            <Text as="p">
              Deleted reviews stay in Trash for 30 days. Restore them there if
              you removed one by mistake.
            </Text>
            <Button url="/app">Manage reviews</Button>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Understand request statuses
            </Text>
            <Text as="p">
              Queued means a request is waiting for delivery. Sent means the
              email provider accepted it. Delivered means delivery was
              confirmed. Review received means the customer submitted feedback
              through their invitation link.
            </Text>
            <Text as="p">
              Failed requests can be retried. Customers who unsubscribe or
              bounce are excluded from future requests. Automatic collection
              becomes available after the app has the required Shopify access.
            </Text>
            <Button url="/app/requests">Manage requests</Button>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Import authentic feedback
            </Text>
            <Text as="p">
              Paste a CSV with product ID, product name, reviewer, rating, and
              review body. Preview the rows before confirming. Imported reviews
              enter Pending, and matching repeat imports are skipped.
            </Text>
            <Text as="p" tone="subdued">
              Verified purchase labels are reserved for reviews linked to a
              verified order invitation. Imported reviews do not receive that
              label.
            </Text>
            <Button url="/app/import">Import / export</Button>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Keep feedback trustworthy
            </Text>
            <Text as="p">
              Publish genuine reviews across all ratings. Use rejection for
              spam, abusive content, or feedback unrelated to the product. If
              you offer an incentive, explain it clearly and offer it regardless
              of rating.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
