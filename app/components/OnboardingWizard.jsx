import { useState } from "react";
import { BlockStack, Button, InlineStack, Modal, ProgressBar, RadioButton, Text } from "@shopify/polaris";

const STEP_COUNT = 3;

function submitOnboarding(fetcher, data) {
  fetcher.submit({ intent: "onboarding", ...data }, { method: "post" });
}

function StepEnable({ reviewFormOn, setReviewFormOn }) {
  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">Step 1: Enable app</Text>
      <Text as="h2" variant="headingLg">Turn on the review form?</Text>
      <RadioButton label="Yes, let customers submit reviews" checked={reviewFormOn} id="onboarding-enable-yes" name="onboarding-enable" onChange={() => setReviewFormOn(true)} />
      <RadioButton label="Not yet" checked={!reviewFormOn} id="onboarding-enable-no" name="onboarding-enable" onChange={() => setReviewFormOn(false)} />
    </BlockStack>
  );
}

function StepEligibility({ customerEligibility, setCustomerEligibility }) {
  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">Step 2: Customer eligibility</Text>
      <Text as="h2" variant="headingLg">Who can leave reviews?</Text>
      <RadioButton label="Only login customers" checked={customerEligibility === "loggedIn"} id="onboarding-eligibility-loggedIn" name="onboarding-eligibility" onChange={() => setCustomerEligibility("loggedIn")} />
      <RadioButton label="Only verified customers" checked={customerEligibility === "verifiedBuyer"} id="onboarding-eligibility-verifiedBuyer" name="onboarding-eligibility" onChange={() => setCustomerEligibility("verifiedBuyer")} />
      <RadioButton label="All customers" checked={customerEligibility === "everyone"} id="onboarding-eligibility-everyone" name="onboarding-eligibility" onChange={() => setCustomerEligibility("everyone")} />
    </BlockStack>
  );
}

function StepDiscount({ reviewDiscountPercent, setReviewDiscountPercent }) {
  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">Step 3: Discount for reviews</Text>
      <Text as="h2" variant="headingLg">Offer discount for reviewers?</Text>
      <RadioButton label="10% discount" checked={reviewDiscountPercent === "10"} id="onboarding-discount-10" name="onboarding-discount" onChange={() => setReviewDiscountPercent("10")} />
      <RadioButton label="20% discount" checked={reviewDiscountPercent === "20"} id="onboarding-discount-20" name="onboarding-discount" onChange={() => setReviewDiscountPercent("20")} />
      <RadioButton label="No discount" checked={reviewDiscountPercent === "none"} id="onboarding-discount-none" name="onboarding-discount" onChange={() => setReviewDiscountPercent("none")} />
    </BlockStack>
  );
}

export function OnboardingWizard({ settings, fetcher }) {
  const [step, setStep] = useState(0);
  const [reviewFormOn, setReviewFormOn] = useState(settings.reviewFormOn);
  const [customerEligibility, setCustomerEligibility] = useState(settings.customerEligibility);
  const [reviewDiscountPercent, setReviewDiscountPercent] = useState(settings.reviewDiscountPercent);

  const skipAll = () => submitOnboarding(fetcher, { complete: "true" });

  const advance = () => {
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }
    submitOnboarding(fetcher, {
      complete: "true",
      reviewFormOn: String(reviewFormOn),
      customerEligibility,
      reviewDiscountPercent,
    });
  };

  return (
    <Modal open title="Quick setup" onClose={skipAll}>
      <Modal.Section>
        <BlockStack gap="500">
          <ProgressBar progress={((step + 1) / STEP_COUNT) * 100} size="small" />
          {step === 0 ? <StepEnable reviewFormOn={reviewFormOn} setReviewFormOn={setReviewFormOn} /> : null}
          {step === 1 ? <StepEligibility customerEligibility={customerEligibility} setCustomerEligibility={setCustomerEligibility} /> : null}
          {step === 2 ? <StepDiscount reviewDiscountPercent={reviewDiscountPercent} setReviewDiscountPercent={setReviewDiscountPercent} /> : null}
          <InlineStack align="space-between" blockAlign="center">
            <Button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
            <InlineStack gap="200">
              <Button onClick={advance}>I&rsquo;ll do it later</Button>
              <Button variant="primary" onClick={advance}>{step === STEP_COUNT - 1 ? "Finish setup" : "Next step"}</Button>
            </InlineStack>
          </InlineStack>
          <InlineStack align="end">
            <Button variant="plain" onClick={skipAll}>Skip all steps</Button>
          </InlineStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
