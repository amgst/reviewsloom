# ReviewLoom release and operations guide

## Release

Builds no longer change the database. Apply migrations explicitly as a release step:

1. Take a database backup and confirm which environment `DATABASE_URL` and `DIRECT_URL` point to.
2. Run `npm ci` and `npm run check`.
3. Run `npm run migrate:deploy` against the intended database before serving the new build.
4. Deploy the web app with your existing hosting workflow, then deploy the theme extension with `npm run deploy`.
5. Visit `/health` and test installation, a review submission, moderation, restore, and export on a development store.

The new migration is additive. It does not remove historical demo reviews, because sample records were not marked and might have been edited. Inspect known sample products (`demo-1`, `demo-2`, `demo-3`) before manually removing them. Fresh installations no longer create demo records.

## Request delivery

Configure secrets in the hosting provider; never commit them:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Existing Resend sending account |
| `RESEND_FROM_EMAIL` | A sender on a verified production domain |
| `RESEND_WEBHOOK_SECRET` | Resend signing secret for `/webhooks/email` |
| `REVIEW_REQUEST_SECRET` | Optional separate, persistent invitation signing key; defaults to the Shopify app secret |
| `CRON_SECRET` | Strong random bearer token protecting `/internal/jobs` |
| `AUTOMATIC_REQUESTS_APPROVED` | Keep unset until Shopify approval and order subscriptions are configured |

Configure a scheduler to call `GET /internal/jobs` with `Authorization: Bearer <CRON_SECRET>` every five minutes. The same route accepts POST. A Vercel Cron job can supply this header from `CRON_SECRET`; configure its frequency according to your hosting plan. No scheduler is activated by this source change.

Each invocation processes at most ten due jobs. Jobs use atomic database claims and a ten-minute recovery lease. Failed jobs retry after 5, 10, and 20 minutes, up to four delivery attempts. Resend receives a stable idempotency key for each request. Resend's idempotency retention is finite: inspect provider activity before retrying an uncertain send after an extended outage. Monitor the queue age and increase invocation frequency or worker capacity as traffic grows. This is a database-backed worker suitable for the current app, not an unbounded high-volume mail system.

In Resend, subscribe `/webhooks/email` to `email.delivered`, `email.bounced`, and `email.complained`. Signatures are verified using the installed Resend SDK. Bounce and complaint events suppress future requests to that address for the shop. Delivery events are idempotent and can arrive out of order. An unusually early event arriving before the provider ID is committed may require reconciliation from provider activity.

Manual requests are deduplicated per customer, product, shop, and UTC day. Shopify resolves the actual published product URL. A signed invitation links review completion to the original request. Manual requests never establish a verified purchase. Signed fulfillment-generated invitations can do so. Invitation links expire after 90 days and are single use for submission. Unsubscribe links also expire after 90 days. Customers can unsubscribe through a confirmation page; email delivery is never triggered by merely opening that page.

## Enable automatic collection after approval

1. Obtain the required Shopify protected customer data access and `read_orders` scope. Do not enable the feature before approval.
2. Add `read_orders` to app scopes, deploy app configuration, and have merchants grant access.
3. Add subscriptions for `orders/fulfilled`, `orders/cancelled`, and `refunds/create` with URI `/webhooks/orders`. The authenticated handler is included but these subscriptions are deliberately not active in the current TOML.
4. Set `AUTOMATIC_REQUESTS_APPROVED=true` and configure the worker and email webhooks.
5. Enable automatic requests in the merchant's settings; select a fulfillment delay and optional reminder.
6. Test duplicate fulfillment events, cancellation, refunds, unsubscribes, bounces, a completed review, and a reminder on a development store.

Orders are deduplicated by shop, order, and product. Any refund conservatively cancels queued requests for that order. Reminders are sent once for automatic invitations and stop when the original review is completed, cancelled, or bounced. Cancellation cannot retract a message already accepted by the provider. Uninstall disables collection and cancels outstanding jobs.

## Monitoring and recovery

- `/health` verifies database connectivity and returns 503 on failure. Point your hosting provider's uptime monitor at it and alert on failures.
- The Express server emits JSON records for server errors and requests slower than 1.5 seconds, with request IDs and paths, without URL query strings or customer review text. Hosting environments that bypass `server.js` must use their platform request logs too.
- Queue failures emit request IDs without customer email addresses. Alert on growing `QUEUED` age, recurring `FAILED` jobs, and scheduler failures.
- Configure your database provider's backups/PITR. Restore a backup into a separate database monthly, run migrations there, and check review counts and shop isolation before considering the backup verified. No live restore has been performed by this change.
- Run the GitHub Actions checks on pull requests. They use placeholders and do not connect to the production database.

## Merchant support

For missing reviews, check moderation status, the correct product template, the saved app block or embed, and a live product preview. The setup checklist distinguishes merchant confirmation from a signed widget connection; a connection alone does not prove correct placement on every template.

For missing emails, check email settings, scheduler activity, the request status, Resend domain verification, suppression, and provider activity. Do not describe `SENT` as delivered: it means provider acceptance. Delivered requires a signed provider event.

For privacy requests, use the authenticated compliance webhooks. Customer redaction removes matching reviews, questions, requests, and suppression records. Review activity and votes cascade with review deletion. Data requests are acknowledged and logged as counts only; the merchant must still fulfill the actual customer data export using their support process.

## Storefront QA before publication

- Test the Reviews block, auto-embed, carousel, rating badge, and Q&A on a development theme, including empty states and every rating.
- Test narrow mobile widths, keyboard navigation, text zoom, photo links, disabled browser storage, and slow or failed requests.
- Use either the Reviews block or auto-embed for a product, avoiding duplicate widgets on the same page.
- Compare Lighthouse and Shopify web performance measurements before and after enabling widgets. Images have explicit dimensions and lazy loading; this does not establish a measured performance score.
- Confirm signed app proxy requests succeed and direct unsigned requests fail.

The changed Liquid blocks passed Shopify AI Toolkit theme checks using the toolkit's bundled documentation fallback. Both new Admin GraphQL queries passed schema validation for the app's pinned 2026-01 API. The toolkit's newer App Home component validator targets web components/Preact and cannot validate this existing Polaris React interface; the app retains its React stack and has separate render smoke tests, lint, and a production build. A live browser visual check and live-store end-to-end delivery test are still required before publication.

## Analytics definitions

Periods use UTC calendar days including today. Review metrics include non-deleted reviews created during the period. The rating card includes all received ratings. The request funnel groups original requests by creation date, excludes reminders, and reports their latest outcomes. Imported and unsolicited reviews are included in review totals, but do not become attributed invitation completions. Revenue attribution is not claimed.
