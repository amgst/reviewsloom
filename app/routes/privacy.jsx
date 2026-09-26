// Public privacy policy page, linked from the App Store listing.
const CONTACT_EMAIL = "REPLACE_WITH_SUPPORT_EMAIL";
const LAST_UPDATED = "September 26, 2026";

export const meta = () => [{ title: "ReviewLoom Privacy Policy" }];

const styles = {
  page: { maxWidth: 760, margin: "0 auto", padding: "40px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", lineHeight: 1.6, color: "#1a1a1a" },
  h2: { marginTop: 32, fontSize: 20 },
};

export default function Privacy() {
  return (
    <main style={styles.page}>
      <h1>ReviewLoom Privacy Policy</h1>
      <p>Last updated: {LAST_UPDATED}</p>

      <p>
        ReviewLoom ("the App") helps Shopify merchants collect and display product reviews and
        questions. This policy describes what personal information the App collects, how it is
        used, and how it is shared when a merchant installs the App.
      </p>

      <h2 style={styles.h2}>Information we collect</h2>
      <p>When a merchant installs the App, we access the following through the Shopify API:</p>
      <ul>
        <li>Store information: shop domain and the access token needed to run the App.</li>
        <li>Store staff account details provided by Shopify at login (name, email, locale).</li>
        <li>Product information (product IDs, titles and URLs) to attach reviews to products.</li>
        <li>Discount codes the App creates to reward reviewers, when the merchant enables them.</li>
      </ul>
      <p>From the merchant's customers, when they use the App's storefront widgets or receive a review request:</p>
      <ul>
        <li>Name and email address submitted with a review or question.</li>
        <li>Review content: star rating, written review and photo links.</li>
        <li>Question content and the merchant's answers.</li>
        <li>Email address and product name for review request emails the merchant sends.</li>
      </ul>
      <p>We do not collect payment information, and we do not use tracking cookies on the storefront.</p>

      <h2 style={styles.h2}>How we use information</h2>
      <ul>
        <li>To store, moderate and display reviews and questions on the merchant's store.</li>
        <li>To send review request emails on the merchant's behalf.</li>
        <li>To create discount codes for reviewers when the merchant enables this feature.</li>
        <li>To show the merchant analytics about their reviews and review emails.</li>
        <li>To provide support and keep the App working.</li>
      </ul>
      <p>We do not sell personal information or use it for advertising.</p>

      <h2 style={styles.h2}>Sharing</h2>
      <p>We share information only with service providers needed to run the App:</p>
      <ul>
        <li>Vercel (application hosting).</li>
        <li>Our PostgreSQL database provider (data storage).</li>
        <li>Resend (sending review request emails).</li>
        <li>Shopify (the platform the App runs on).</li>
      </ul>
      <p>We may also disclose information if required by law.</p>

      <h2 style={styles.h2}>Data retention and deletion</h2>
      <p>
        We keep data while the App is installed. When a customer requests deletion through Shopify,
        we delete their reviews, questions and review request records. Within 48 days after a
        merchant uninstalls the App, Shopify sends a deletion request and we erase all data stored
        for that shop.
      </p>

      <h2 style={styles.h2}>Your rights</h2>
      <p>
        If you are in the EEA, UK or another region with data protection rights, you can ask to
        access, correct or delete your personal information. Customers of a store should contact
        the store owner, who can fulfil the request through Shopify, or contact us directly.
        Merchants act as the data controller for their customers' data, and we process it on
        their behalf.
      </p>

      <h2 style={styles.h2}>Changes</h2>
      <p>We may update this policy from time to time. The date above shows the latest version.</p>

      <h2 style={styles.h2}>Contact</h2>
      <p>
        Questions about this policy? Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </main>
  );
}
