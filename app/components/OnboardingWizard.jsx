import { useFetcher } from "@remix-run/react";
import { ThemeSetupGuide } from "./ThemeSetupGuide";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  ProgressBar,
  Text,
} from "@shopify/polaris";

export function OnboardingWizard({ settings, shop, apiKey, reviewCount }) {
  const fetcher = useFetcher();
  const themeDone = Boolean(settings.setupThemeConfirmedAt);
  const seen = Boolean(settings.widgetSeenAt);
  const collectionDone = reviewCount > 0;
  const completed = [themeDone, seen, collectionDone].filter(Boolean).length;
  const save = (step) =>
    fetcher.submit({ intent: "onboarding", step }, { method: "post" });
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <div>
            <Text as="h2" variant="headingLg">
              Welcome to ReviewLoom
            </Text>
            <Text as="p" tone="subdued">
              Bring authentic customer feedback to your storefront.
            </Text>
          </div>
          <Badge>{`${completed} of 3 complete`}</Badge>
        </InlineStack>
        <ProgressBar progress={(completed / 3) * 100} size="small" />
        <div className="reviewloom-setup-step">
          <div>
            <Text as="h3" variant="headingMd">
              1. Customize and add your widget
            </Text>
            <Text as="p" tone="subdued">
              Follow the steps below, then confirm once you have saved.
            </Text>
          </div>
          <ThemeSetupGuide shop={shop} apiKey={apiKey} />
          <InlineStack gap="200">
            <Button
              disabled={themeDone || fetcher.state !== "idle"}
              onClick={() => save("theme")}
            >
              {themeDone ? "Confirmed by you" : "I've saved my theme"}
            </Button>
          </InlineStack>
        </div>
        <div className="reviewloom-setup-step">
          <div>
            <Text as="h3" variant="headingMd">
              2. Preview a product page
            </Text>
            <Text as="p" tone="subdued">
              {seen
                ? "A signed storefront widget request has been received. Check placement on desktop and mobile."
                : "Open a product using that template. We'll detect when the widget connects; then check its placement on desktop and mobile."}
            </Text>
          </div>
          <Badge tone={seen ? "success" : "attention"}>
            {seen ? "Widget connected" : "Waiting for storefront visit"}
          </Badge>
        </div>
        <div className="reviewloom-setup-step">
          <div>
            <Text as="h3" variant="headingMd">
              3. Collect your first review
            </Text>
            <Text as="p" tone="subdued">
              Import real customer feedback or collect a review through your
              storefront.
            </Text>
          </div>
          <InlineStack gap="200">
            <Button url="/app/import">Import reviews</Button>
            {collectionDone ? <Badge tone="success">Started</Badge> : null}
          </InlineStack>
        </div>
        {fetcher.data?.error ? (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        ) : null}
        <InlineStack align="end">
          <Button
            variant="plain"
            onClick={() => save("complete")}
            disabled={fetcher.state !== "idle"}
          >
            {completed === 3 ? "Finish setup" : "Dismiss for now"}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
