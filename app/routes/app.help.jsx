import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { ThemeSetupGuide } from "../components/ThemeSetupGuide";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop, apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function Help() {
  const { shop, apiKey } = useLoaderData();
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
            <ThemeSetupGuide shop={shop} apiKey={apiKey} detailed />
            <Text as="p" tone="subdued">
              Use one main reviews widget per product page. Your setup checklist
              detects a widget connection; you still need to check its placement
              in the theme.
            </Text>
            <InlineStack gap="200">
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
              Import authentic feedback
            </Text>
            <Text as="p">
              Paste a CSV with product ID, product name, reviewer, rating, and
              review body. Preview the rows before confirming. Imported reviews
              enter Pending, and matching repeat imports are skipped.
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
