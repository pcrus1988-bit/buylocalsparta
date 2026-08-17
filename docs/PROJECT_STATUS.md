# Buy Local Sparta — Project Status

**Build started:** 14 August 2026  
**Current development build:** 0.45.0  
**Continuity source:** this Git repository. Future work must inspect and preserve the existing implementation before modification.

This file is the current-state continuity record. Detailed historical implementation notes remain in the versioned `docs/BUILD_*.md` reports and provider/deployment runbooks.

## Build 0.45.0 — governed merchant photography

- [x] `/shops` prefers approved merchant photography when an eligible image is explicitly associated with the Vendor's published merchant story.
- [x] `/vendor/[id]` uses the same governed merchant image and retains the generated initial/graphic treatment when no approved photo exists.
- [x] The public media stream revalidates active Vendor state, Vendor-approved/published story state, same-Vendor media ownership, non-product scope, supported image MIME type, malware-clean state, rights approval, moderation approval and reviewed object metadata before streaming.
- [x] Admin `/admin/content` exposes a supported merchant-story image selector; direct SQL is no longer required to attach/remove the public merchant image.
- [x] Admin candidates are limited to the same Vendor's non-product images that already passed malware scan, rights review and moderation.
- [x] Story-media mutation requires `content.write`, Admin CSRF verification, PostgreSQL platform scope and a serializable transaction.
- [x] Attach/remove actions are recorded through the canonical Admin audit service.
- [x] Removing the association immediately restores the generated storefront fallback.
- [x] Product media behavior remains governed independently and Fair Vendor Exposure is unchanged.
- [x] No new migration was required; the existing `merchant_stories.og_image` association is used.
- [x] `check:merchants` now guards merchant-story publication, media ownership/moderation, public revalidation, Admin association and fairness-separation boundaries.
- [x] Production CI has proven the feature code against Node 24, a fresh PostgreSQL 18/PostGIS database, all migrations, live DB smoke, long-running worker typechecks, production worker-container build and the real Next.js production build before release versioning.

**Production boundary:** only explicitly governed media may replace generated storefront artwork. The feature does not scrape or auto-import merchant photography from the public web and does not treat an upload as permission to publish it.

## Current storefront and merchant experience

- [x] Greek-first customer storefront with dedicated category landing pages and category-aware fallback artwork.
- [x] `/shop` canonical catalog with search, category, availability and price controls.
- [x] Canonical product detail pages with local advice/fulfilment identity and governed product media.
- [x] Public `/shops` merchant directory and `/vendor/[id]` profiles separated from private Vendor backoffice routes.
- [x] Merchant stories are published only after Vendor approval; Build 0.45 adds approved merchant photography without bypassing that story approval.
- [x] Generated visual treatments remain safe fallbacks wherever approved photography is unavailable.
- [x] Hidden supplier offers, purchase prices and fairness deficits never appear in public catalog or merchant-directory views.

## Customer commerce

- [x] Persistent authenticated PostgreSQL carts plus local guest cart.
- [x] One checkout / one customer order / private multi-Vendor fulfilment split.
- [x] PostgreSQL stock reservations, expiry, idempotent checkout and concurrency/oversell protection.
- [x] Fair/sticky Vendor assignment is applied after canonical product discovery and remains separate from editorial/category/media choices.
- [x] Atomic Vendor rejection/rescue routing with replacement stock reservation and no-rescue customer-action state.
- [x] Secure pickup codes/QR and provider-authoritative shipping delivery.
- [x] BOX NOW locker-delivery adapter with stable provider order identity, reconciliation, label generation and signed/idempotent webhooks.
- [x] Customer order history/detail, pre-handover cancellation, returns/guarantees and recall workflows.

## Payments and finance

- [x] Viva Smart Checkout adapter with OAuth, hosted checkout, authoritative transaction retrieval and webhook reconciliation.
- [x] Provider-order creation and refunds use durable attempt/manual-reconciliation semantics instead of blind retries after uncertain network outcomes.
- [x] Late capture after cancellation triggers one stable automatic refund attempt.
- [x] Paid stock is protected from reservation expiry and consumed only when the assigned Vendor accepts fulfilment.
- [x] Supplier procurement, invoice matching, payable approval and settlement are separate from customer acquiring.
- [x] Maker/checker settlement control prevents the batch maker from approving the same payout.
- [x] Platform fees, shipping reimbursement, supplier invoice gross and Vendor payable remain separate monetary concepts.

## Identity, privacy and security

- [x] PostgreSQL-backed customer, Vendor and Admin sessions when `DATABASE_URL` is configured.
- [x] Signed HttpOnly sessions, persisted CSRF proof and shared cross-instance login throttling.
- [x] Vendor and platform RBAC plus server-side tenant isolation/RLS scope.
- [x] Database-less serverless preview sessions are stateless/HMAC-signed and require explicit preview/demo gates; real production remains PostgreSQL-backed.
- [x] Privacy-minimised security events, notification delivery history, analytics correlation and provider event storage.
- [x] Customer personalization preferences, saved products/searches, recent views, notification centre, privacy export/deletion/closure workflows.
- [x] Global production browser-security headers and trusted per-browser visitor identity in Next.js proxy.

## Catalog, fairness and trust

- [x] Canonical Product / hidden Vendor Offer architecture.
- [x] Product Matching Centre, manual source-product workflow and CSV dry-run/confirmed import.
- [x] Category governance, attributes, compatibility/regulated checkout gates and public facets.
- [x] Category-aware stock freshness feeds public/search/fairness eligibility.
- [x] Availability-adjusted deficit fairness rotation, deterministic tie-breaks, warm start and sticky attribution.
- [x] 30,000-selection fairness simulation plus multi-location fairness proof.
- [x] Media pipeline: private signed S3-compatible upload → verified storage → ClamAV scan → verified object → rights review → moderation → eligible public stream.
- [x] Merchant photography in Build 0.45 uses the same trust chain and explicit merchant-story association.
- [x] Compliance evidence, holds, recalls and explicit restore suppress products across search/catalog/account/checkout.

## Search, notifications and analytics

- [x] Meilisearch external canonical-product projection; no hidden supplier data enters the public index.
- [x] Search results resolve Fair Vendor Exposure only after canonical results have been chosen.
- [x] Resend transactional-email adapter over the existing durable PostgreSQL notification delivery queue.
- [x] Signed/deduplicated provider webhooks and privacy-minimised destination suppression.
- [x] Saved-search new-match alerts, saved-product availability/price alerts and grouped notification-centre lifecycle.
- [x] Platform demand analytics and Vendor-own aggregate analytics remain observational and do not alter fairness weights.

## Admin and Vendor workspaces

- [x] Vendor backoffice: catalog/import, stock, fulfilments, advice, media/compliance, analytics, invoices/settlements and assigned returns.
- [x] Admin command centre: Vendor onboarding/KYB, Product Matching, trust/compliance, fairness, finance, orders/returns, reviews, privacy, category governance, CMS/SEO, recalls, analytics, maintenance and provider activation evidence.
- [x] Build 0.45 extends Admin CMS with governed merchant-story image association and audit.
- [x] Merchants cannot self-approve matches, media rights/moderation, compliance, payables, settlements or payouts.
- [x] Vendors cannot self-confirm carrier delivery.

## Production infrastructure and deployment

- [x] Node.js 24 target.
- [x] Next.js monorepo build from repository root for Vercel; workspace build context is verified before `next build`.
- [x] PostgreSQL 18 + PostGIS authoritative database runtime with exact schema-readiness checks.
- [x] Separate Node 24 long-running worker container for PostgreSQL maintenance, search projection, notifications and media processing.
- [x] Production CI provisions fresh PostgreSQL/PostGIS, applies migrations, runs readiness + cross-instance DB smoke, typechecks provider/runtime/worker code, builds the worker container and builds the real Next.js application.
- [x] Provider activation evidence ledger and staging preflight/scenario workflows distinguish configuration, connectivity and actual end-to-end scenario proof.
- [ ] A committed root npm lockfile remains desirable for stricter deterministic production installs; current CI uses network-enabled npm installation and the package graph/version consistency gate.
- [ ] External provider staging/live scenarios still require real credentials and retained activation evidence.

## External/provider activation status

Prepared in code, but **not represented as live merely because the adapter exists**:

- [ ] Viva demo/live merchant credentials, portal source/webhook setup and controlled payment/refund scenario evidence.
- [ ] BOX NOW staging/live credentials, origin mappings, webhook secret and real parcel lifecycle evidence.
- [ ] Meilisearch staging/live cluster, index configuration/rebuild and query evidence.
- [ ] Resend verified sending domain, webhook and actual transactional-delivery evidence.
- [ ] S3-compatible production bucket/CORS/private-object controls and private ClamAV staging proof.
- [ ] AADE myDATA test credentials plus accountant-approved document/classification/VAT mapping before issuance.
- [ ] Google Calendar/Meet and any approved messaging transports remain future integrations.

## Automated proof

Current repository release proof includes:

- **210/210 Core automated tests**.
- **37 immutable PostgreSQL migrations** verified against checksums.
- Provider suites for Viva, AADE myDATA, media/ClamAV, Meilisearch, Resend and BOX NOW.
- Preview-auth, project-consistency, deployment-topology, storefront-taxonomy and merchant-directory/media governance gates.
- Structural accessibility checks and the complete dependency-free HTTP marketplace journey.
- Strict TypeScript checks for Core, production adapters, PostgreSQL runtime, staging tooling and long-running workers.
- Fresh PostgreSQL/PostGIS migration/readiness/cross-instance integration smoke in Production CI.
- Production worker-container build in Production CI.
- Real Next.js production build in Production CI.

## Current database schema

The latest schema migration remains `0037_activation_evidence.sql`. Build 0.45 requires **no new migration**.

`db/migrations/checksums.json` prevents registered migration history from being silently rewritten.

## Commercial and legal boundary

The architecture uses **Buy Local Sparta as the consumer-facing seller** and local merchants as suppliers, fulfilment partners and advisers. Do not activate real customer money, tax-document issuance or merchant contracting until the seller/supplier agreement, title/risk transfer, VAT/myDATA treatment, supplier invoicing/payout model and PSP/provider underwriting have been approved consistently by the relevant Greek legal/accounting professionals and providers.

## Next priorities

1. Merge/deploy Build 0.45 after the exact versioned release head passes Production CI.
2. Verify the resulting Vercel deployment and record deployment activation evidence for the exact build.
3. Onboard real Vendor/product media through the private upload/scan/rights/moderation path and exercise the new Admin merchant-story association in staging.
4. Run controlled staging scenarios for PostgreSQL, Viva, Resend, Meilisearch, S3/ClamAV and BOX NOW and retain evidence in `/admin/activation`.
5. Finalize accountant-approved AADE mapping and test issuance only in the official test environment before production.
6. Complete human WCAG review, authenticated penetration testing, backup/restore drill and external operational monitoring before launch.
