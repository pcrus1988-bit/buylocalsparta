# Implementation Roadmap


## Build 0.43 — deployment topology / activation (current)

- [x] Repository-root Vercel monorepo configuration and build-context guard.
- [x] Node 24 worker container with separate postgres/search/notifications/media roles.
- [x] Worker-only ClamAV boundary and per-process environment matrix.
- [x] Production CI worker typecheck/container-build gates.
- [ ] Generate/commit root npm lockfile in a network-enabled Node 24 environment.
- [ ] Run real Vercel build + deploy and retain current-build deployment evidence.
- [ ] Deploy worker roles alongside staging PostgreSQL/Meilisearch/Resend/S3/ClamAV and verify liveness/restarts.
- [ ] Execute provider scenario evidence before production promotion.

## Build 0.42 — staging activation / evidence

- [x] Cross-provider read-only staging preflight.
- [x] Append-only, redacted build/environment activation evidence.
- [x] Manual controlled-scenario evidence workflow.
- [x] Admin activation-evidence workspace.
- [ ] Run the staging workflow with actual PostgreSQL/Viva/AADE/Meilisearch/Resend/S3/ClamAV/BOX NOW credentials.
- [ ] Execute and retain provider end-to-end scenario evidence listed in `docs/STAGING_ACTIVATION_RUNBOOK.md`.
- [ ] Obtain genuine Node 24 Next.js build/deployment evidence and staging observability evidence.
- [ ] Promote only provider configurations whose current-build connectivity + scenario gates are satisfied.

## Build 0.36 — PostgreSQL Admin/governance cutover

- [x] Platform/Admin authentication and sessions use shared PostgreSQL state when `DATABASE_URL` is configured.
- [x] Vendor onboarding, catalog matching, trust/compliance, finance maker-checker, fairness, orders/returns, reviews, privacy, categories, CMS, recalls, analytics, maintenance and audit projections use platform-scoped PostgreSQL services.
- [x] Live DB smoke now includes two-instance Admin session, category, CMS, recall, finance maker-checker and audit visibility proofs alongside existing customer/Vendor proofs.
- [x] Viva refund execution is wired behind durable PostgreSQL orchestration; uncertain provider outcomes fail to manual reconciliation rather than being retried or falsely completed.
- [x] Fixed latent production-build/schema issues discovered by strict semantic validation during cutover.
- [ ] Execute and retain the live PostgreSQL/PostGIS + Node 24 CI evidence; complete Viva demo/live credential validation; validate the prepared S3/ClamAV media pipeline and atomic Vendor rescue on live PostgreSQL; validate the prepared AADE myDATA ERP transport with test credentials + accountant-approved mapping, then connect the selected courier; validate the prepared Meilisearch and Resend providers.

## Build 0.31 — expanded Admin governance and safety propagation

- Added production Next.js Admin orders/returns, review moderation, privacy processing, category governance, CMS lifecycle, recalls, market analytics and maintenance/search-job surfaces.
- Kept all mutations behind the separate Admin session, Core RBAC and CSRF boundary; customer/vendor principals cannot execute platform decisions.
- Shared privacy, returns, catalog/trust, commerce and operational service state across the customer/vendor/Admin preview adapters instead of creating presentation-only copies.
- Closed the recall/compliance propagation gap: public catalog/product detail, account availability/saved searches and checkout now consume one governed canonical-publicability rule before fairness/commerce.
- Added direct governance and focused recall-suppression integration proofs plus consistency-gate regression checks.
- Highest next priority is no longer adding top-level backoffice screens: cut the production web/runtime over to PostgreSQL-backed shared state, run a real Node 24 `next build`, then connect S3/search/worker/notification/payment/ERP/courier providers behind the existing interfaces.


## Build 0.29 — expanded Vendor operations

- Added production Next.js Vendor catalog onboarding with manual drafts, matching submission and CSV preview/confirm import.
- Added vendor-bound media/compliance submission while retaining platform malware scan, rights/moderation and compliance verification authority.
- Added vendor-scoped Advice, appointments, notifications, own-performance analytics, supplier invoice/settlement tracking and returns operations.
- Extended server-side ownership checks and the consistency gate across every new Vendor mutation; Vendor APIs explicitly cannot approve catalog/trust/settlement controls.
- Added direct runtime proof for vendor scope + catalog/import/media/compliance/analytics/finance integration.
- Remaining production cutover: PostgreSQL-backed shared state, S3/malware scanning, provider adapters and real Node 24 Next.js build/deployment verification.

## Build 0.28 — production Vendor Backoffice and customer order detail

- Added authenticated Next.js vendor login/session with HttpOnly cookie, trusted visitor-scoped rate limiting and CSRF-protected mutations.
- Added private `/vendor` operations surface over the same Core commerce/inventory singleton as customer checkout, so assigned orders and stock are not presentation-only copies.
- Added strict server-side vendor ownership checks for inventory and fulfilment actions; active reservations cannot be invalidated by lowering on-hand below reserved units.
- Added accept/reject, confirmed pickup-ready and local-delivery completion boundaries. Carrier shipping delivery remains provider-confirmed and is intentionally absent from vendor actions.
- Added customer `/account/orders/[id]` detail plus pre-handover cancellation using existing payment/stock reversal invariants.
- Extended the project consistency gate to prevent regressions in vendor session security, isolation, carrier-delivery separation and cancellation CSRF.
- Production vendor/account state remains fail-closed on the ephemeral adapter and must cut over to PostgreSQL before multi-instance launch.

## Build 0.24 — saved searches, notification centre and explainable recommendations

- Added customer-owned saved searches across query, availability, advice, price, category and governed attribute filters. Creation snapshots all current canonical matches so alerts represent future demand changes rather than historical results.
- Added event-driven + scheduled reconciliation that emits one `saved_search.new_match` event per genuinely new canonical product. Alert disable/re-enable re-baselines current state and historical emitted IDs prevent repeat alerts.
- Corrected search semantics so non-empty zero-result queries stay zero-result: availability/advice/pickup boosts are applied only after a lexical/identity match exists.
- Added a grouped notification centre with unread/group filters, mark-all-read and archive. Archive hides a message from the ordinary centre but preserves the operational notification record.
- Recommendations now carry localized explanation text and enforce configurable per-brand/per-category diversity caps; the engine still selects canonical products only and delegates local merchant assignment to Fair Vendor Exposure afterward.
- Privacy export/deletion/account closure now include and erase saved searches/new-match event history as non-essential personalization.
- Added migration `0028_saved_search_notification_center.sql` plus PostgreSQL engagement/notification/privacy persistence updates.
- Build proof: 209 core tests, 28 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the full HTTP marketplace smoke workflow.
- Still pending: live PostgreSQL/RLS/concurrency execution, production search-provider adapter and production notification-provider credentials.

## Build 0.23 — saved-product alerts and privacy-safe recommendations

- Added explicit per-saved-product back-in-stock and public platform price-drop alert preferences. Enabling/changing an alert baselines the current state so an already-existing condition never generates a false immediate notification.
- Alert reconciliation consumes canonical public availability and Buy Local Sparta public retail price only; hidden supplier purchase prices and vendor conversion metrics are never alert inputs.
- Added event-driven alert reconciliation alongside search indexing plus a scheduled repair/reconciliation job, with existing notification preference/provider delivery semantics.
- Added customer recommendations using only canonical product metadata, saved products, bounded recent-view history, public availability and advice availability. Recommendations disappear immediately when the customer disables them.
- Recommendation ranking selects canonical products only. The local merchant shown on each recommendation is resolved afterward through the ordinary Fair Vendor Exposure Engine, so personalization cannot manufacture a hidden vendor boost.
- Privacy export now includes saved-product alert preferences/events; deletion and consumer account closure erase alert preferences together with other non-essential personalization.
- Added migration `0027_saved_product_alerts_recommendations.sql`, `PostgresEngagementRepository`, customer account controls and full HTTP smoke proof of price-drop notification + recommendation opt-out.
- Still pending: live PostgreSQL/RLS execution, production provider delivery credentials, and richer recommendation explanations/quality measurement that remain strictly separated from merchant fairness.

## Build 0.22 — customer personalization and GDPR-oriented account controls

- Added customer-scoped saved canonical products and saved shops without creating a new ranking signal or exposing hidden vendor offers.
- Added bounded recently-viewed history (90-day development default, max 50), explicit clear action, scheduled expiry and an immediate opt-out that stops future recording.
- Added separate personalization controls for recommendations and recent-history collection; ordinary shopping remains functional with personalization disabled.
- Added self-service privacy export covering the customer's own account, commerce, advice, returns, recalls, reviews, notifications and personalization while excluding password/session secrets and competitor-private data.
- Added deletion-request workflow that clears non-essential personalization immediately and records reasoned retained-data categories rather than pretending all order/tax/guarantee/security records may always be erased instantly.
- Added self-service consumer account closure with pseudonymized identity and session revocation; merchant/staff identities require governed administrative offboarding.
- Added platform privacy-request queue, dedicated RBAC, Admin processing/completion controls, audit history and PostgreSQL customer/platform RLS.
- Added migration `0026_customer_personalization_privacy.sql`, `PostgresCustomerPrivacyRepository`, runtime retention job and end-to-end account/privacy smoke proof.
- Still pending: lawyer/accountant-approved exact retention schedule, processor/export packaging policy, live PostgreSQL/RLS execution, and production identity/offboarding integration.


## Build 0.21 — platform promotions, prior price and coupons

- Added append-only platform retail-price history independently from hidden supplier purchase prices and Fair Vendor Exposure.
- Added fixed public price-reduction campaigns with non-overlap, non-retroactive creation, cancellation history and base-price guards so an unfinished campaign cannot cease to be a genuine reduction.
- Added 30-day lowest prior actual public price calculation that includes earlier promotions during the time they genuinely ran, even when later cancelled.
- Added versioned fixed/percentage coupon rules with canonical/category eligibility, private/promo exclusions, total/per-subject caps, deterministic integer-cent line allocation and explicit redemption reversals for pre-capture cancellations.
- Checkout snapshots promotion/prior-price/coupon allocations; partial refunds use customer-paid line value after allocated discounts.
- Customer cart and Admin backoffice expose coupon/promotion workflows; search/public product projections use current platform retail price.
- PostgreSQL migration `0025_promotions_price_history.sql` and `PostgresPromotionsRepository` persist the same model, including one-way coupon subject hashes and serializable cap enforcement.
- Build proof: 193 core tests, 25 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the full HTTP critical-path smoke workflow.
- Still pending: live PostgreSQL execution, production accounting/legal review of promotion/coupon tax-document treatment, and richer campaign segmentation/budgeting.

## Build 0.20 — category governance and progressive commerce

- Added data-driven category commerce policies for standard, logistics-sensitive, compatibility-sensitive, regulated/mixed, vehicles and directory-only categories.
- Added governed attribute definitions/bindings with Greek-first labels, required-field validation, canonical search projection attributes and category-aware facets/filters.
- Vendor source products now validate/normalize governed category attributes before matching, approval and publication.
- Compatibility-sensitive products require explicit customer confirmation before checkout; directory-only/vehicle categories cannot silently enter ordinary checkout, and regulated/mixed checkout requires product-level clearance unless policy explicitly permits it.
- Cart/product projections explain commerce requirements instead of hiding products through opaque ranking.
- Admin can inspect and audit category-governance configuration; changes are protected by platform catalog RBAC + CSRF and remain separate from Fair Vendor Exposure.
- PostgreSQL migration `0024_category_governance_attributes.sql` and `PostgresCategoryGovernanceRepository` persist category policy, translations and attribute bindings under the existing public-ID/internal-UUID architecture.
- Build proof: 185 core tests, 24 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the complete HTTP critical-path smoke workflow.
- Still pending: live PostgreSQL/PostGIS execution, richer Admin attribute-definition/value editing UX, and product/category compliance-policy review by Greek specialists before restricted-category launch.

## Build 0.19 — multi-location merchants and capacity-aware fulfilment

- Added a governed vendor-location directory with one primary storefront and additional active fulfilment/advice points.
- Fair Vendor Exposure now groups eligible offers by merchant before rotation: adding branches does **not** buy or manufacture extra organic exposure. Location choice happens only after the merchant opportunity is selected.
- Added per-location/per-mode fulfilment-capacity rules and live open-fulfilment counts; full locations become explicitly ineligible instead of receiving a hidden score penalty.
- Cart and checkout consume dynamic location capacity through the same runtime eligibility contract as fairness selection.
- Vendor owners can add locations and manage each branch's weekly calendar, dated closures, postcode/radius service coverage and capacity from the operations workspace; Admin gets location-level operational visibility.
- Demonstration data includes a second fictional Arkadia Tech location with radius-based local-delivery coverage to exercise PostGIS-ready service semantics.
- PostgreSQL migration `0023_multi_location_capacity.sql` and `PostgresAvailabilityRepository` persist locations/capacity under vendor/platform RLS.
- Still pending: production geocoding/map UX, capacity rules that vary by day/time/staff roster, and live PostgreSQL/PostGIS concurrency proof.
- Build proof: 177 core tests, 23 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the full HTTP critical-path smoke workflow.

## Build 0.18 — trading calendars and fulfilment coverage

- Added governed vendor-location weekly trading calendars, split shifts and dated closure/exception support in `Europe/Athens`.
- Added open-now/next-open projections plus schedule-backed pickup/advice windows for customers.
- Fulfilment acceptance/preparation and Ask Local response deadlines can now consume merchant business time rather than raw wall-clock time.
- Added fulfilment service zones for local-delivery postcode/radius coverage and nationwide shipping, explicitly separate from delivery-pricing rules.
- Cart, checkout, delivery quoting and Fair Vendor offer eligibility consume the same serviceability context.
- Vendor owners can edit hours and delivery coverage; Admin can inspect local operational state.
- PostgreSQL migration `0022_trading_hours_delivery_coverage.sql` and `PostgresAvailabilityRepository` persist the same model with scoped RLS.
- Live PostgreSQL/PostGIS execution and production geocoding/courier-area adapters remain pending infrastructure/integration gates.


## Build 0.17 — completed

- Added consolidated customer order tracking over one customer order and multiple private vendor fulfilments, including progress, shipment/pickup state and a customer-visible event timeline.
- Added customer cancellation before physical handover; active reservations release, consumed reservations reverse stock, and authorized/captured payments are cancelled/refunded idempotently.
- Added vendor-proposed substitutions with real stock reservation, same-vendor/location enforcement, explicit customer approve/reject, expiry, lower/equal-price guard and immutable provenance.
- Added acceptance/preparation fulfilment SLA cases with breach/escalation scanning, visible delay states, operational resolution and scheduled jobs.
- Added vendor and Admin workspace controls for substitutions/SLA and customer account controls for tracking/cancellation/approval.
- PostgreSQL migration `0021_order_tracking_substitutions_sla.sql` persists timeline, cancellations, substitutions and SLA cases with customer/vendor/platform RLS and guarded customer decision updates.
- Build proof: 162 core tests, 21 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the full HTTP critical-path smoke workflow.


## Build 0.16 — completed

- Expanded return cases from a simple refund path into customer-owned withdrawal/guarantee/safety-recall workflows with configurable eligibility evidence and explicit platform review.
- Added RMA authorization, return-cost ownership, carrier/tracking details, product evidence and append-only custody history from customer through carrier/vendor/platform/repairer.
- Added governed remedy decisions for refund, replacement, repair and price reduction; local vendors execute assigned receive/replacement/repair tasks but cannot unilaterally deny the consumer remedy.
- Replacement remedies reserve stock through a distinct supplier chain; repair remedies maintain blocked inventory, custody and an operational SLA.
- Canonical recall activation now identifies previously fulfilled outstanding quantities, notifies affected customers and links the customer's selected remedy to a return case.
- A supplier payout already marked settled no longer blocks the customer's refund: the finance domain records an auditable vendor receivable/post-settlement return recovery instead of mutating the closed payout batch.
- PostgreSQL migration `0020_return_guarantee_recall.sql` persists fulfilled/refunded evidence, RMA/custody/evidence, remedy records, affected-recall cases and post-settlement recovery state with scoped RLS.
- Build proof: 151 core tests, 20 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the full HTTP critical-path smoke workflow including affected-customer recall → RMA/custody → refund after supplier settlement.


## Build 0.15 — completed

- Verified reviews now require a fulfilled order line owned by the customer or a verified advice interaction (two-sided conversation or completed appointment).
- Public review projection exposes only `Verified buyer` / `Verified advice customer`, interaction type, rating/content, disclosure and merchant response—not customer IDs.
- Incentivized reviews require a visible disclosure; undisclosed incentive metadata is rejected.
- Merchants can respond publicly and open a scoped moderation report, but reporting never auto-hides customer content.
- Platform review moderation and report resolution require explicit state/reason and produce audit/review-history evidence.
- Review aggregates use published reviews only and are intentionally excluded from Fair Vendor Exposure ranking/weights.
- PostgreSQL persistence adds verified-source constraints, duplicate-source guards, vendor response/report tables, append-only review events and RLS.
- Customer, Vendor and Admin development interfaces expose the verified review workflow.
- Build proof: 143 core tests, 19 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the full HTTP critical-path smoke workflow.

## Build 0.10 — completed

- Configurable customer delivery pricing with vendor/postcode specificity, free thresholds and immutable checkout snapshots.
- Delivery charges remain part of the single customer payment while individual fulfilment records retain their own pricing provenance.
- Versioned B2B fee engine separates supplier purchase price from platform service fees, shipping reimbursements and final vendor payable.
- Procurement commercial snapshots are resolved before payable approval and settlements use the resolved payable amount.
- Payment disputes/chargebacks now support evidence, idempotent provider outcomes, supplier-payment holds and explicit liability allocation.
- PostgreSQL commercial persistence now covers delivery rules, fee rules/snapshots and dispute/evidence/provider-event records.
- Build proof: 104 core tests, 14 immutable migrations, 4 UI syntax checks and the full HTTP critical-path smoke workflow.

## Build 0.11 — completed

- Modular CMS pages now support Greek-first bilingual content, draft/scheduled/published/archive states and append-only revisions.
- Localized public routes emit canonical URLs, hreflang, robots/Open Graph metadata and indexable content rather than sitemap links to 404 placeholders.
- XML sitemap and robots.txt include published CMS pages, merchant stories, canonical collections, products and shops.
- Merchant stories require vendor-owner approval before platform publication; the workflow is exposed in Vendor and Admin workspaces.
- Curated collections operate only on canonical products and cannot create duplicate public vendor-offer listings.
- Product structured data keeps Buy Local Sparta as the customer-facing seller while naming the local fulfilment partner separately.
- PostgreSQL persistence now includes CMS pages/translations/revisions, navigation, redirects, merchant stories and canonical collections with RLS.
- Build proof: 113 core tests, 15 immutable migrations, 4 UI syntax checks and the full HTTP critical-path smoke workflow including CMS/SEO/story approval.

## Build 0.12 — completed

- Privacy-minimised analytics now records search, canonical-product discovery, cart, checkout, advice, appointments and Ask Local outcomes without storing raw visitor identifiers.
- Search queries are sanitized for common email/Greek-phone identifiers before analytics storage; Greek/English/Greeklish demand uses the same normalized search space as storefront search.
- Marketplace reporting now covers search success, zero-result demand, unique-search CTR, category demand, product views, GMV/AOV, advice and Ask Local conversion.
- Vendor analytics are restricted to that vendor's aggregate impressions/views/carts/orders/sales/advice activity; competitor and customer-level raw events are not exposed.
- Analytics permissions separate vendor-own aggregates from platform market intelligence, and analytics never feeds Fair Vendor Exposure rotation or hidden ranking.
- PostgreSQL persistence adds raw analytics events, daily market/vendor rollups, search-demand aggregates, RLS separation and retention cleanup.
- Storefront search interactions, Vendor Analytics and Admin marketplace-demand intelligence are wired into the executable development UI/API.
- Build proof: 122 core tests, 16 immutable migrations, 4 UI syntax checks and the full HTTP critical-path smoke workflow including search attribution, zero-result intelligence and vendor/platform analytics isolation.

## Build 0.14 — completed

- Added route-specific authentication/registration/advice/Ask Local rate limits with privacy-preserving correlation keys and standard 429 retry semantics.
- Added liveness/readiness endpoints, critical/non-critical dependency health, request IDs and browser security headers.
- Added privacy-minimised security events, platform security reporting, 90-day retention and PostgreSQL append-only/RLS persistence.
- Added keyboard/focus/reduced-motion/landmark improvements plus an automated structural accessibility regression suite across all development interfaces.
- Added an implementation threat model and WCAG 2.2 AA human acceptance matrix. These are preparation for—not substitutes for—penetration and human accessibility audits.

## Build 0.13 — completed

- Notification delivery now separates immediate in-app messages from asynchronous email/SMS/push channels.
- Immutable/versioned templates resolve by event, locale and channel; delivery preferences support event-specific or wildcard choices.
- Required transactional templates bypass optional channel opt-out, while marketing delivery remains opt-in by default.
- External delivery uses leased workers, provider idempotency, retry/backoff, terminal failure state and explicit requeue.
- Delivery-attempt observability stores masked destinations rather than reusable contact details.
- Customer and vendor workspaces expose optional email preference controls; Admin exposes provider/template/attempt health.
- PostgreSQL persistence adds template revisions, preferences, delivery queue/lease fields and masked attempt history.
- Real provider credentials are deliberately not fabricated: development email/SMS/push adapters exercise the production contracts.

The roadmap is dependency-driven. Checked items work in the executable development runtime or have implemented/tested adapter contracts; external provider and live-database proof remain separate production gates.

## Phase 1 — Foundation
- [x] Identity/session/CSRF/email verification
- [x] RBAC and vendor isolation
- [x] Market/town-aware schema
- [x] Vendor application lifecycle
- [x] Audit, transactional outbox, in-app notifications and provider delivery worker contracts
- [x] immutable migration manifest + migration runner
- [x] PostgreSQL unit-of-work and scoped SQL executor abstraction
- [x] explicit transaction-local vendor/platform RLS scope
- [x] PostgreSQL catalog/inventory/fairness/commerce/advice/finance/shipping repository adapters
- [x] PostgreSQL identity/vendor/media/trust/returns/notifications/audit repository adapters and unified persistence bundle
- [x] deployable PostgreSQL 18/PostGIS CI + local-compose integration-test recipe (live run still required)
- [ ] execute live PostgreSQL integration/RLS/concurrency suite in CI/deployment and retain artifacts
- [x] complete remaining PostgreSQL identity/vendor/media/trust repository coverage
- [x] executable `pg.Pool` + unified PostgreSQL runtime/readiness/worker foundation
- [~] inject PostgreSQL repositories into request-time services: customer identity/account/catalog/cart/checkout/orders plus Vendor identity/inventory/fulfilment/catalog/advice/finance/analytics/returns completed through Build 0.35; Admin/governance state remains
- [x] object-storage/upload abstraction and development upload/scan pipeline
- [ ] production S3-compatible signed-upload/CDN/virus-scanner adapter

## Phase 2 — Catalog & supply
- [x] Taxonomy seed
- [x] Canonical product / vendor-offer model
- [x] Duplicate matching core and Product Matching Centre
- [x] Vendor product CRUD/import with CSV dry-run/commit
- [x] Inventory history and stock-adjustment audit
- [x] database-side row-locked reservation/consume/release/expiry functions
- [~] PostgreSQL-backed catalog/import runtime: Vendor draft/submission/confirmed CSV rows are durable in Build 0.35; Admin matching approval + full import-batch operational proof remain
- [x] category-aware stock freshness TTL/confirmation model integrated with commerce eligibility and search
- [x] media rights/moderation and compliance-document workflow
- [x] recall/compliance-hold suppression and explicit restore

## Phase 3 — Fairness
- [x] Eligibility gate
- [x] Deficit rotation
- [x] Sticky attribution
- [x] Deterministic tie-break
- [x] Rescue supplier routing
- [x] Explainable exposure snapshots
- [x] 30,000-selection statistical test
- [x] fairness assignment repository, merchant appeal workflow and operational anomaly governance (domain + SQL adapter; live PostgreSQL integration still pending)
- [ ] database concurrency tests for simultaneous assignments/exposure writes

## Phase 4 — Storefront
- [x] Greek-first functional storefront
- [x] Greek/English/Greeklish search core
- [x] Category, availability, advice and price filters
- [x] Canonical cards with local adviser assignment
- [x] Merchant story cards
- [x] Customer account activity and secure pickup display
- [x] Production Next.js login/account surface with HttpOnly session, CSRF, saved products/searches, notifications, recommendations and privacy preferences; PostgreSQL customer cutover covers identity/account/catalog/cart/checkout/orders
- [x] Production Next.js Vendor Backoffice for scoped orders/stock, catalog/import, compliance, advice, analytics, finance tracking and assigned returns; Build 0.38 uses PostgreSQL when configured, with atomic rejection/rescue and private signed media upload/scanning prepared
- [x] Production Next.js Admin Command Centre for vendor/KYB transitions, Product Matching, trust/compliance review, finance maker-checker controls, fairness governance and operational health/audit; Build 0.36 uses PostgreSQL when configured
- [ ] production Next.js build when package installation is available
- [x] background search projection abstraction with stable hashing/removal semantics
- [ ] production search-provider adapter and PostgreSQL-backed projection worker
- [x] CMS-backed product/vendor/local SEO pages and canonical collection/story routes
- [~] richer production category landing-page templates and photography/media integration: six category landing pages and category-aware visual merchandising are implemented in Build 0.44; approved merchant/product photography rendering remains
- [ ] full mobile/accessibility audit

## Phase 5 — Commerce & fulfilment
- [x] Persistent cart
- [x] PostgreSQL authenticated-cart persistence + cross-instance merge/sync path
- [x] Stock reservations
- [x] PostgreSQL serializable checkout reservation/idempotency path with CI last-unit contention proof configured
- [x] One checkout / one payment intent
- [x] Multi-vendor fulfilment split
- [x] Vendor accept/reject and rescue flow
- [x] Private-offer price provenance
- [x] secure pickup code/QR handover workflow
- [x] direct-shipping shipment lifecycle and courier abstraction
- [x] configurable customer delivery-rate engine with vendor/postcode rules, free thresholds and immutable checkout snapshots
- [ ] production courier-rate/provider adapter and geocoding/radius integration (delivery-zone domain and postcode coverage are implemented)
- [x] Viva.com Smart Checkout production adapter prepared; live credentials/underwriting/demo-to-live evidence remain activation gates
- [x] abandoned PostgreSQL `pending_payment` cleanup; paid/confirmed reservations are protected from generic expiry; production checkout fails closed unless Viva is configured

## Phase 6 — Human layer
- [x] Native messaging domain
- [x] Appointments and adviser conflict prevention
- [x] Ask Local/private counteroffer workflow
- [x] Customer/vendor appointment and notification UI
- [ ] Google Calendar/Meet OAuth adapter
- [ ] WhatsApp/Viber consent adapters
- [x] attachment/media scan-state and moderation foundation
- [ ] advice attachment integration on top of media pipeline
- [x] verified order/advice review eligibility, public privacy projection, vendor response/report and Admin moderation
- [ ] production review-policy/legal copy review and moderation SLA/appeal operating procedure

## Phase 7 — Finance/returns hardening
- [x] Balanced ledger primitive
- [x] Procurement accrual
- [x] Return/refund supplier reversal
- [x] Versioned plans and 36-month Founding entitlement
- [x] Supplier invoice matching
- [x] Procurement payable approval
- [x] Settlement batches with maker/checker and external payout reference
- [x] settlement persistence guards/RLS migration
- [ ] PostgreSQL-backed finance end-to-end integration tests
- [x] configurable versioned B2B fee-rule engine beyond plan snapshot
- [x] AADE myDATA ERP transport adapter with durable MARK/UID/QR/error state and issuance gate; accountant-approved document/classification mapping + Digital Goods Movement activation remain launch tasks
- [x] chargeback/dispute evidence, payout hold and explicit liability-allocation workflow

## Phase 8 — Operational maturity
- [x] Persistent CMS/SEO domain, PostgreSQL adapter, scheduling, sitemap/robots and merchant-story approval
- [x] Privacy-minimised analytics event warehouse/reporting with search-demand intelligence and vendor-safe aggregates
- [x] Notification provider worker abstraction (email/SMS/push), versioned templates, preferences, retries and delivery observability
- [ ] Production email/SMS/push provider credentials/sender verification and provider-specific webhook adapters
- [x] background worker retry/dead-letter/replay foundation + development operations UI
- [x] persistent worker lease + scheduled-job lease contracts with PostgreSQL adapters
- [x] category-aware stock freshness scheduling and operational alerts
- [x] event-driven search projection/reconciliation abstraction with PostgreSQL projection state
- [ ] production worker process/queue deployment, alert routing and operational dashboards
- [x] automated structural accessibility regression suite
- [ ] human WCAG 2.2 AA review across customer/vendor/admin critical journeys
- [x] implementation threat model
- [ ] authenticated penetration review and remediation evidence
- [ ] Backup/restore drill
- [x] application liveness/readiness and Admin dependency-health checks
- [ ] external monitoring/error tracking, alert routing and production SLO validation
- [ ] Launch-gate evidence package
