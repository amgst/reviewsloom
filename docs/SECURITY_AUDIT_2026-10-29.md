# ReviewLoom bug and security audit — October 29, 2026

## Outcome

Reviewed application routes, public widgets, authentication boundaries, database
queries, CSV processing, uploads, rewards, deletion, dependency versions and CI.
Applied locally reproducible fixes and added regression coverage. This is a source
and local-test audit, not a live penetration test or a security certification.
No production database, deployment or merchant records were modified.

## Fixed in this change

| Finding | Change |
| --- | --- |
| Public rewarded submissions trusted an arbitrary product ID before creating a discount or uploading photos | Require a numeric product ID and verify an active, online-store product in the authenticated shop before these side effects. Uses only product API fields. |
| Visitor-only rate limits allowed costs to grow across rotating addresses | Add atomic per-shop UTC-day limits: 100 review submissions, 100 questions and 30 submissions containing photos. Failed attempts consume budget. Existing visitor limits remain. These are operational caps, not proof of customer identity or a replacement for bot protection. |
| Signed proxy handling did not require an installed shop session | Require an offline shop session matching the signed shop before any database lookup. Signature verification remains in Shopify's official library. |
| Q&A and admin forms were parsed without an application body-size bound | Add bounded stream parsing: 24 KB for public Q&A, 64 KB for admin forms, 2.5 MB for CSV form envelopes. The existing photo envelope has a 3.5 MB bound. CSV posts use multipart encoding to avoid percent-encoding expansion. |
| Unexpected file-valued text inputs and malformed moderation IDs caused invalid queries/errors | Reject file-valued text fields and validate question IDs/actions before querying. |
| CSV export omitted photos in ReviewImage | Export the first ordered photo when the legacy imageUrl is absent. The single-image CSV format still does not export every image. |
| Failed CSV imports could display a success message with zero imported rows | Show success only if the response has no errors. |
| QR input accepted arbitrary schemes and oversized content | Require a bounded HTTPS URL and limit the form before QR generation. |
| Rendering errors were logged as whole objects | Log error type/code only, avoiding accidental request or credential detail disclosure. |
| Visitor hashes had a predictable fallback key | Fail closed if the Shopify secret is absent. |
| Auto-publish lookup used inherited object properties | Use an own-property allowlist for stored thresholds. |
| Scaffold workflow could force-push converted JavaScript branches on main pushes | Make the conversion workflow manual-only. |
| Node test files inherited Jest lint rules and could not be linted reliably | Remove the unused Jest-specific ESLint preset; tests use node:test. |

## Dependencies

An online npm production-tree audit reported 39 flagged packages before compatible
updates: 2 critical, 23 high, 9 moderate and 5 low. The saved post-update audit reports
32: 1 critical, 17 high, 9 moderate and 5 low. These counts include transitive and
meta-vulnerability entries, not that many independently demonstrated application exploits.
Build tools are included because several are declared under dependencies.

Compatible updates include proxy-addr 2.0.8, compression 1.8.2, body-parser 1.20.9,
undici 6.29.1 and the pinned minimatch override 9.0.7. package-lock.json records
the dependency graph. npm's broad automatic fix was stopped when registry fetches
stalled; a targeted compatible update completed instead. No forced framework
upgrade or outside-range dependency override was applied.

Remaining dependency work requires review rather than blind `npm audit fix --force`:

* **tar 6.2.1 (critical advisory classification)** comes through cacache 17 and
  @remix-run/dev. This is the build/tooling path, not a public tar-upload endpoint.
  Upgrade the parent toolchain or validate a compatible replacement before release.
* **turbo-stream 2.4.1** is pinned by Remix 2.17.5. The recorded advisory concerns
  single-fetch; this project currently sets `v3_singleFetch: false`. Preserve that
  mitigation and plan a supported framework upgrade. The audit entry remains.
* **Vite 6.4.3** has development-server/editor advisories. Do not expose the dev
  server to untrusted networks or use it as the production server.
* Prisma/config/deepmerge-ts, source-map-js, toml and other transitive findings
  remain in the npm report and need parent-package/compatibility investigation.

Primary advisory references:

* [tar hardlink traversal](https://github.com/advisories/GHSA-34x7-hfp2-rc4v)
* [single-fetch denial of service](https://github.com/advisories/GHSA-rxv8-25v2-qmq8)
* [Vite editor command handling](https://github.com/advisories/GHSA-587h-7wmj-h5pm)

Raw npm evidence is in ignored local files `.cache/security-audit-before.json` and
`.cache/security-audit-after.json`; regenerate it when reviewing newer dependencies.

## Outstanding application and operational findings

1. **Photo lifecycle:** completed Shopify Files are not automatically deleted when
   reviews are permanently deleted, trash expires or a shop uninstalls. The existing
   support procedure must delete the Files assets separately. Reliable automated
   cleanup needs retained file IDs, retries and an uninstall ownership policy.
2. **Pending photos are public Files:** moderation excludes the review from widgets
   but does not make the CDN file private. This is disclosed in the picker/policy;
   it is a storage-design property, not a privacy guarantee.
3. **Customer privacy fulfillment is manual:** customer data/redaction webhooks are
   authenticated and acknowledged but only log a follow-up event. Support must identify
   relevant content with the merchant and fulfill the request; HTTP 200 is not fulfillment.
4. **Contact placeholder remains in local source:** privacy.jsx still contains
   REPLACE_WITH_SUPPORT_EMAIL. Use a real monitored address and verify the deployed page.
5. **No comprehensive personal-data read/export audit trail:** moderation events are
   not a substitute for staff access logging. Database/provider access needs review too.
6. **Anonymous reward abuse:** caps bound total requests but do not guarantee one
   reward per person. Consider CAPTCHA and merchant-adjustable caps if abuse occurs.
7. **Publication fairness:** high-rating-only automatic publishing options require
   App Store/policy review. They are not a code injection issue, but can bias visible reviews.
8. **Infrastructure:** production TLS enforcement, backups, environment separation,
   staff MFA/permissions, incident response and log retention were not verified here.
9. **CI:** template CLA automation still references a tag rather than an immutable
   action commit. Review/pin third-party CI actions and token permissions separately.

## Verification and release

41 tests pass, including cross-shop isolation, unauthenticated rejection, body limits,
invalid file/text fields, store budgets, invalid-product rejection, CSV handling and
reward success/failure behavior. Lint and the production build pass. The build retains
an existing Polaris CSS minifier warning. The product query passed Shopify AI Toolkit
validation for the pinned Admin API version. The toolkit's App Home validator does
not resolve this project's legacy @shopify/polaris React package; render checks and
the local build cover compilation, not a successful toolkit component verdict.

The audit did not find an unescaped customer-text path in the inspected widgets,
unbound SQL interpolation, a committed .env file, or a demonstrated cross-shop read.
Those observations are limited to the reviewed paths and tests, not blanket proof.

Deploy the web app and current Shopify configuration together. Set hosting SCOPES to
`read_products,write_discounts,read_files,write_files`; remove unused write_products
and write_themes grants through the normal Shopify permission update flow. Existing
photo uploads still require their previously added migration and Files permissions.
No additional database migration was introduced by this audit.

Verify live OAuth/reinstallation, proxy requests, upload/Files processing, code
redemption at checkout, scheduler cleanup, and restored backups on a development
store before submission. Shopify CLI live checks remain unverified due to the
network/DNS failures observed during this session. Do not mark the app fully secure
or the App Store self-review complete based solely on this audit.
