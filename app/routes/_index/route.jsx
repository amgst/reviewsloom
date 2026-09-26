import { redirect } from "@remix-run/node";

export const meta = () => [
  { title: "ReviewLoom – Product reviews for Shopify" },
  { name: "description", content: "Collect product reviews with photos and Q&A, and show them with widgets that build shopper trust." },
];

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

const FEATURES = [
  { title: "Review requests", text: "Email customers after they buy and turn buyers into reviewers." },
  { title: "Reviewer rewards", text: "Thank reviewers with a one-time discount code for their next order." },
  { title: "Photo reviews", text: "Customers add star ratings and photos that show your products in real life." },
  { title: "Storefront widgets", text: "Review widget, star rating badge and carousel, added from the theme editor." },
  { title: "Product Q&A", text: "Shoppers ask questions on product pages and you answer them in the app." },
  { title: "Moderation & analytics", text: "Approve reviews before they go live, import or export by CSV, and track activity." },
];

const css = `
  body { margin: 0; }
  .rl { --accent: #D95D39; --ink: #1f1a17; --muted: #6b625c; --bg: #fbf8f4; --card: #ffffff; --line: #ece4da;
    min-height: 100vh; background: var(--bg); color: var(--ink);
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
  .rl * { box-sizing: border-box; }
  .rl-wrap { max-width: 1040px; margin: 0 auto; padding: 0 16px; }
  .rl-nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 0; }
  .rl-logo { font-weight: 700; font-size: 20px; letter-spacing: -0.01em; }
  .rl-logo span { color: var(--accent); }
  .rl-nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
  .rl-hero { text-align: center; padding: 72px 0 56px; }
  .rl-stars { color: var(--accent); font-size: 28px; letter-spacing: 4px; margin-bottom: 16px; }
  .rl-hero h1 { font-size: clamp(32px, 5vw, 52px); line-height: 1.15; margin: 0 auto 16px; max-width: 760px; letter-spacing: -0.02em; }
  .rl-hero p { font-size: 18px; color: var(--muted); max-width: 620px; margin: 0 auto; }
  .rl-note { margin-top: 28px; display: inline-block; padding: 10px 18px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); font-size: 14px; color: var(--muted); }
  .rl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; padding-bottom: 72px; }
  .rl-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }
  .rl-card h3 { margin: 0 0 6px; font-size: 17px; }
  .rl-card p { margin: 0; color: var(--muted); font-size: 15px; }
  .rl-foot { border-top: 1px solid var(--line); padding: 24px 0; font-size: 14px; color: var(--muted); display: flex; gap: 16px; justify-content: space-between; flex-wrap: wrap; }
  .rl-foot a { color: var(--muted); }
`;

export default function Index() {
  return (
    <div className="rl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="rl-wrap">
        <header className="rl-nav">
          <div className="rl-logo">Review<span>Loom</span></div>
          <a href="/privacy">Privacy policy</a>
        </header>

        <section className="rl-hero">
          <div className="rl-stars" aria-hidden="true">★★★★★</div>
          <h1>Product reviews that build shopper trust</h1>
          <p>
            Collect reviews with photos and Q&amp;A, reward the customers who leave them,
            and show them across your Shopify store.
          </p>
          <div className="rl-note">Install ReviewLoom from the Shopify App Store</div>
        </section>

        <section className="rl-grid">
          {FEATURES.map((feature) => (
            <div className="rl-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </section>

        <footer className="rl-foot">
          <span>© {new Date().getFullYear()} ReviewLoom</span>
          <a href="/privacy">Privacy policy</a>
        </footer>
      </div>
    </div>
  );
}
