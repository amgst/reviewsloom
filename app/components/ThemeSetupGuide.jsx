import { BlockStack, Button, InlineStack, Text } from "@shopify/polaris";

export function ThemeSetupGuide({ shop, apiKey, detailed = false }) {
  const editor = new URL(`https://${shop}/admin/themes/current/editor`);
  editor.searchParams.set("template", "product");
  if (apiKey) {
    editor.searchParams.set("addAppBlockId", `${apiKey}/reviews`);
    editor.searchParams.set("target", "newAppsSection");
  }
  return (
    <BlockStack gap="300">
      <Text as="p">
        Add customer reviews to your product pages without editing code.
      </Text>
      <ol>
        <li>Click Add reviews to theme to open your current theme in a new tab.</li>
        <li>
          In Products → Default product, check the All product reviews block.
          Drag its section below your product details.
        </li>
        <li>Click Save in the theme editor.</li>
        <li>Open a product in your online store and check it on desktop and mobile.</li>
      </ol>
      <InlineStack gap="200">
        <Button url={editor.toString()} target="_blank" variant="primary">
          Add reviews to theme
        </Button>
        <Button url="/app/settings">Customize appearance</Button>
        {!detailed ? <Button url="/app/help">View setup guide</Button> : null}
      </InlineStack>
      <Text as="p" tone="subdued">
        Already added reviews? Open Online Store → Themes → Customize to edit
        the existing block. Clicking Add again can create a second widget.
        Repeat setup for any other product templates you use. For an unpublished
        theme, open that theme from Online Store → Themes instead.
      </Text>
      {detailed ? (
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">If the block does not appear</Text>
          <Text as="p">
            In the product template, click Add section → Apps → All product
            reviews under ReviewLoom. You can also use Add block → Apps inside a
            section that supports app blocks. Position it and click Save.
          </Text>
          <Text as="h3" variant="headingMd">Alternative: enable the app embed</Text>
          <Text as="p">
            For a theme without app block support, open App embeds in the theme
            editor, turn on Reviewloom auto-embed, and click Save. Reviews appear
            at the end of product pages by default. Use either this embed or the
            All product reviews block on a product page to avoid duplicate widgets.
          </Text>
          <Button
            url={`https://${shop}/admin/themes/current/editor?context=apps&template=product`}
            target="_blank"
          >
            Open app embeds
          </Button>
          <Text as="h3" variant="headingMd">Add more storefront features</Text>
          <Text as="p">
            Use Add block → Apps → Product rating badge near the product title,
            or add Questions &amp; answers below the details. Add the Review
            carousel to your home page from Add section → Apps. Save after each
            change.
          </Text>
          <Text as="h3" variant="headingMd">Check your setup</Text>
          <Text as="p">
            Confirm the product uses the template you edited and you saved the
            correct theme. An empty widget is normal until you publish a review
            for that product. If ReviewLoom is missing from Apps, check that the
            app is installed on this store. If reviews are temporarily
            unavailable, return to the app and try again later.
          </Text>
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}
