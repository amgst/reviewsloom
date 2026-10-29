# ReviewLoom release and operations guide

## Release: remove customer email workflows

This release removes email fields from reviews and questions, invitations, reminders,
delivery tracking, suppression records, and invitation-based purchase verification.
It keeps Shopify merchant/staff authentication sessions, including staff email fields
required by the session adapter. It does not migrate reviews to Shopify storage.

1. Run `npm ci` and `npm run check`.
2. Stop old application instances/workers and pause any scheduler while upgrading.
3. Apply `npm run migrate:deploy` to the intended database. The migration permanently
   drops customer email columns and the ReviewRequest/EmailSuppression tables, including
   saved provider payloads and signed invitation links. Other review content remains.
   Legacy import fingerprints are cleared because they included emails; previously
   imported reviews can be imported again, so check before reimporting old files.
   Development startup no longer applies migrations automatically; apply them explicitly
   to a separate test database before using `npm run dev`.
4. Deploy the matching web app and theme extension (`npm run deploy`). Old versions
   are incompatible with the new schema. Do not run them against the migrated database.
5. Remove RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_WEBHOOK_SECRET,
   REVIEW_REQUEST_SECRET and AUTOMATIC_REQUESTS_APPROVED from deployment environments.
   Remove any legacy order/email webhook subscriptions and Resend webhook registration.
   The retired endpoints return 410 without reading or persisting payloads.
6. Confirm `/health`, storefront review/Q&A submission, moderation, import and export.
   Old email fields sent by cached widgets are ignored. CSV email columns are rejected.
7. Retain a scheduler calling `/internal/jobs` with `Authorization: Bearer <CRON_SECRET>`
   for publishing and retention only. No email worker remains.

## Historical copies

Applying the migration removes structured customer email data from the current application
database. It cannot erase historical copies in Supabase snapshots, downloaded dumps,
Resend delivery history, logs or merchant exports. Review those systems separately,
delete copies where supported and document backup expiration. If restoring an old backup,
keep it isolated and apply the removal migration before serving the application.
User-written names, text, questions or URLs may themselves contain email addresses;
review and remove that content separately. This release does not scan historical prose.

## Privacy requests

Storefront reviews no longer require customer login. Legacy `customerEligibility`
values are ignored by submission/display routes and normalized to `everyone` when
settings are saved. No new database migration is needed for this change. Shopify's
signed proxy requests may still contain a customer identifier, but application
collection code does not read, return or save it. Preserve proxy signature verification.

Mandatory Shopify compliance webhooks remain authenticated and subscribed. Shop redaction
deletes reviews, questions, settings and sessions; images, events and votes cascade.
Customer data/redaction webhooks emit `privacy.manual_review_required` with shop, topic
and webhook ID only. They do not save or log the customer payload. Alert support on these
events; acknowledgement is not fulfillment. Complete requests within Shopify's required
30-day window. Since email/customer links no longer exist, work with the merchant to
identify submissions from product, content, timestamp and submission ID. Never match by
display name alone. Export matching reviews, provide matching question data through
support, permanently delete matched reviews from Trash and delete matched questions
through the database support process. Do not retain the incoming email as a new record.
The public privacy page still needs the operator's monitored support email before release.

## Monitoring and retention

The authenticated job purges trash older than 30 days, expired rate-limit keys and votes
older than a year. Active review/question records remain while installed. Verify scheduler
execution and define any additional retention periods required by business practices.
Monitor `/health` and server errors. Never enable request-body logging for customer forms.
Configure database backups and test restores in an isolated environment using dummy data.

## Storefront QA

Check review block, embed, carousel, rating badge and Q&A on a development theme. Check
mobile layout, keyboard use, slow requests, disabled browser storage, moderation and
shop isolation. No customer email field or verified-purchase badge should appear.
Production database updates, provider deletion and deployment require their own verification.
