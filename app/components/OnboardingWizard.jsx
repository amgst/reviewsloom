import { useId, useState } from "react";
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
  const id = useId();
  const [opened, setOpened] = useState(null);
  const done = [
    Boolean(settings.setupThemeConfirmedAt),
    Boolean(settings.widgetSeenAt),
    reviewCount > 0,
  ];
  const completed = done.filter(Boolean).length;
  const next = done.findIndex((value) => !value);
  const active = opened === null ? next : opened;
  const busy = fetcher.state !== "idle";
  const save = (step) =>
    fetcher.submit({ intent: "onboarding", step }, { method: "post" });
  const steps = [
    {
      title: "Add reviews to your theme",
      status: "Theme saved",
      description: "Add the widget, save your theme, then confirm below.",
    },
    {
      title: "Check your product page",
      status: "Widget connected",
      description:
        "Open a product page with your widget. Check how it looks on desktop and mobile.",
    },
    {
      title: "Collect your first review",
      status: "First review collected",
      description:
        "Import genuine feedback from a CSV or collect a review through your product page.",
    },
  ];
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <div>
            <Text as="h2" variant="headingLg">
              {completed === 3
                ? "You're ready to collect reviews"
                : "Set up ReviewLoom"}
            </Text>
            <Text as="p" tone="subdued">
              {completed === 3
                ? "Your theme is confirmed, your widget is connected, and your first review is in."
                : "Three steps to bring customer feedback to your storefront."}
            </Text>
          </div>
          <Badge
            tone={completed === 3 ? "success" : undefined}
          >{`${completed} of 3 complete`}</Badge>
        </InlineStack>
        <ProgressBar progress={(completed / 3) * 100} size="small" />
        <div className="reviewloom-wizard-steps">
          {steps.map((step, index) => {
            const expanded = active === index;
            return (
              <section
                key={step.title}
                className={`reviewloom-wizard-step${expanded ? " reviewloom-wizard-step--active" : ""}`}
              >
                <button
                  type="button"
                  className="reviewloom-wizard-heading"
                  aria-expanded={expanded}
                  aria-controls={`${id}-step-${index}`}
                  onClick={() => setOpened(expanded ? -1 : index)}
                >
                  <span
                    className={`reviewloom-wizard-number${done[index] ? " reviewloom-wizard-number--done" : ""}`}
                    aria-hidden="true"
                  >
                    {done[index] ? "✓" : index + 1}
                  </span>
                  <span className="reviewloom-wizard-title">{step.title}</span>
                  {done[index] ? (
                    <Badge tone="success">{step.status}</Badge>
                  ) : next === index ? (
                    <Badge tone="info">Next step</Badge>
                  ) : null}
                  <span aria-hidden="true" className="reviewloom-wizard-toggle">
                    {expanded ? "−" : "+"}
                  </span>
                </button>
                <div
                  id={`${id}-step-${index}`}
                  hidden={!expanded}
                  className="reviewloom-wizard-content"
                >
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      {done[index]
                        ? [
                            "You've confirmed your theme is saved. You can edit its appearance in Settings.",
                            "Your widget is connected. Check how it looks on a product page.",
                            "Your first review is in. Manage feedback and publish approved reviews from your inbox.",
                          ][index]
                        : step.description}
                    </Text>
                    {index === 0 && !done[0] ? (
                      <>
                        <ThemeSetupGuide shop={shop} apiKey={apiKey} compact />
                        <InlineStack gap="200">
                          <Button
                            loading={
                              busy && fetcher.formData?.get("step") === "theme"
                            }
                            disabled={busy}
                            onClick={() => {
                              setOpened(null);
                              save("theme");
                            }}
                          >
                            I've saved my theme
                          </Button>
                        </InlineStack>
                      </>
                    ) : null}
                    {index === 1 && !done[1] ? (
                      <>
                        <InlineStack gap="200">
                          <Button
                            url={`https://${shop}/collections/all`}
                            target="_blank"
                            variant="primary"
                          >
                            Open storefront
                          </Button>
                          <Button url="/app/help" variant="plain">
                            Need help?
                          </Button>
                        </InlineStack>
                        <Text as="p" tone="subdued">
                          Choose a product that uses the template you edited.
                          Then return here and refresh to update this step.
                        </Text>
                      </>
                    ) : null}
                    {index === 2 && !done[2] ? (
                      <InlineStack gap="200">
                        <Button url="/app/import" variant="primary">
                          Import CSV reviews
                        </Button>
                        <Button
                          url={`https://${shop}/collections/all`}
                          target="_blank"
                          variant="plain"
                        >
                          Visit storefront
                        </Button>
                      </InlineStack>
                    ) : null}
                    {done[index] && index === 0 ? (
                      <InlineStack>
                        <Button url="/app/settings" variant="plain">
                          Customize appearance
                        </Button>
                      </InlineStack>
                    ) : null}
                  </BlockStack>
                </div>
              </section>
            );
          })}
        </div>
        {fetcher.data?.error ? (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        ) : null}
        <InlineStack align="end">
          <Button
            variant={completed === 3 ? "primary" : "plain"}
            onClick={() => save("complete")}
            disabled={busy}
            loading={busy && fetcher.formData?.get("step") === "complete"}
          >
            {completed === 3 ? "Finish setup" : "Dismiss for now"}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
