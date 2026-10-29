// Public privacy policy page, linked from the App Store listing.
const CONTACT_EMAIL = "REPLACE_WITH_SUPPORT_EMAIL";
const LAST_UPDATED = "October 29, 2026";

export const meta = () => [{ title: "ReviewLoom Privacy Policy" }];

const styles = {
  page: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "40px 16px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    lineHeight: 1.6,
    color: "#1a1a1a",
  },
  h2: { marginTop: 32, fontSize: 20 },
};

export default function Privacy() {
  return (
    <main style={styles.page}>
      <h1>ReviewLoom Privacy Policy</h1>
      <p>Last updated: {LAST_UPDATED}</p>

      <p>
        ReviewLoom ("the App") helps Shopify merchants collect and display
        product reviews and questions. This policy describes what personal
        information the App collects, how it is used, and how it is shared when
        a merchant installs the App.
      </p>

      <h2 style={styles.h2}>Information we collect</h2>
      <p>
        When a merchant installs the App, we access the following through the
        Shopify API:
      </p>
      <ul>
        <li>
          Store information: shop domain and the access token needed to run the
          App.
        </li>
        <li>
          Store staff account details provided by Shopify at login (name, email,
          locale).
        </li>
        <li>
          Product information (product IDs, titles and URLs) to attach reviews
          to products.
        </li>
        <li>
          Discount codes the App creates to reward reviewers, when the merchant
          enables them.
        </li>
      </ul>
      <p>
        From the merchant's customers, when they use the App's storefront
        widgets:
      </p>
      <ul>
        <li>Display name submitted with a review or question.</li>
        <li>Review content: star rating, written review and photo links.</li>
        <li>Question content and the merchant's answers.</li>
      </ul>
      <p>
        To prevent abusive submissions and duplicate review votes, we process a
        visitor's IP address to generate a shop-specific hashed identifier. Our
        application stores this identifier rather than the raw IP address in its
        rate-limit and voting records. Hosting providers may also process IP
        addresses in their operational logs.
      </p>
      <p>
        We process the logged-in customer identifier forwarded by Shopify to
        check whether a visitor may submit a review when the merchant limits
        reviews to logged-in customers. The review widget also uses browser
        local storage to remember votes on that device.
      </p>
      <p>
        We do not collect payment information, and we do not use tracking
        cookies on the storefront.
      </p>

      <h2 style={styles.h2}>How we use information</h2>
      <ul>
        <li>
          To store, moderate and display reviews and questions on the merchant's
          store.
        </li>
        <li>
          To limit abusive submissions, prevent duplicate votes and apply the
          merchant's review submission eligibility settings.
        </li>
        <li>
          To create discount codes for reviewers when the merchant enables this
          feature.
        </li>
        <li>To show the merchant analytics about their reviews.</li>
        <li>To provide support and keep the App working.</li>
      </ul>
      <p>
        Published reviews and questions display the submitted name and content
        on the merchant's storefront, including review ratings and photo links
        where provided. We do not request customer email addresses or send
        review invitation emails. Please do not include email addresses or other
        private contact information in names, review text, questions or photo
        links. Merchants can access submitted customer information in the App to
        manage reviews and questions.
      </p>
      <p>We do not sell personal information or use it for advertising.</p>

      <h2 style={styles.h2}>Sharing</h2>
      <p>
        We share information only with service providers needed to run the App:
      </p>
      <ul>
        <li>Vercel (application hosting).</li>
        <li>Supabase (PostgreSQL database hosting and data storage).</li>
        <li>Shopify (the platform the App runs on).</li>
      </ul>
      <p>We may also disclose information if required by law.</p>

      <h2 style={styles.h2}>Data retention and deletion</h2>
      <p>
        We keep reviews, questions and settings while the App is installed.
        Customer email addresses and order information are not collected through
        dedicated fields. We do not link submissions to Shopify customer
        records. To access or delete a submission, contact the merchant with the
        product and submission details so it can be identified safely. Shopify
        sends a shop deletion request 48 hours after uninstall. On receipt, we
        delete the shop's reviews, questions, settings and sessions from our
        application database.
      </p>

      <h2 style={styles.h2}>Your rights</h2>
      <p>
        If you are in the EEA, UK or another region with data protection rights,
        you can ask to access, correct or delete your personal information.
        Customers of a store should contact the store owner with details
        identifying their submission, or contact us directly. Merchants act as
        the data controller for their customers' data, and we process it on
        their behalf.
      </p>

      <h2 style={styles.h2}>Changes</h2>
      <p>
        We may update this policy from time to time. The date above shows the
        latest version.
      </p>

      <h2 style={styles.h2}>Contact</h2>
      <p>
        Questions about this policy? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </main>
  );
}
