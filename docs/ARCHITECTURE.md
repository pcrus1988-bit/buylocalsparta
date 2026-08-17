# System Architecture

## Product in one paragraph

Buy Local Sparta is a Greek-first, human-first local-commerce platform in which customers discover canonical products and real local expertise, see each identical product only once, receive a fairly assigned local shop/adviser, and buy through one platform cart, payment and customer order. Internally, the platform maintains private vendor offers, reservations, supplier fulfilment orders, procurement obligations, settlements and auditable ledgers, while native advice, appointments and private counteroffers preserve the relationship with Sparta merchants without turning them into a public price auction.

## Core domains

- Market / town configuration
- Identity, authentication and RBAC
- Customer profiles and privacy
- Vendors, locations, verification and plans
- Taxonomy, brands and canonical catalog
- Product matching and source provenance
- Vendor offers and inventory
- Fair vendor assignment and attribution
- Search and merchandising
- Cart and checkout
- Customer orders and vendor fulfilment
- Payments and refunds
- Procurement, supplier invoices and settlements
- Logistics, shipments and pickup
- Messaging, advisers and appointments
- Ask Local / counteroffers
- Returns, guarantees, disputes and recalls
- Verified reviews, merchant responses and moderation
- CMS, SEO and content
- Notifications and background jobs
- Audit, analytics and operational health

## Reference stack

Production target:

- Node.js 24 LTS
- Next.js 16.2 Active LTS line with current security patch
- React 19.2
- TypeScript 5.9 initially (avoid a just-released major compiler change during foundation work)
- PostgreSQL 18 + PostGIS
- Drizzle ORM stable line / SQL migrations
- Redis-compatible cache/queue layer
- Meilisearch/Typesense/OpenSearch abstraction for product/search indexing
- S3-compatible object storage
- Transactional outbox + background workers

The domain core is deliberately dependency-light and independently testable. The web, database and provider adapters depend inward on domain interfaces.

## Deployment shape

Start as a modular monolith. Customer web/PWA, vendor workspace and admin workspace share one application/domain model. Background workers may run as a separate process from the same repository. Service extraction requires measured scale or compliance/team isolation.

## Critical invariants

1. One public canonical variant per market/locale.
2. Vendor offers are private supply records, not duplicate public product listings.
3. Vendor assignment is eligibility-gated and fairness-led; supplier cost never breaks a tie inside the eligible set.
4. Sticky attribution prevents price/vendor flicker and protects advice attribution.
5. Cart quantity is not reserved until checkout reservation succeeds.
6. Customer order is one platform contract; fulfilment/procurement records split privately by vendor/location.
7. Money uses integer minor units; percentages use fixed integer precision.
8. Payment/webhook operations are idempotent.
9. Inventory, financial ledger, fairness assignment and privileged audit histories are append-only.
10. Vendor authorization is enforced server-side and scoped by vendor/location.


## Vendor source-product layer

Build 0.7 retains the canonical boundary introduced in Build 0.4 and the persistence/fulfilment/finance boundaries added in Build 0.5. A merchant never writes directly to the public canonical product. Manual/API/CSV input first creates a vendor-owned source submission. Matching compares that source against canonical identities; exact/high-confidence evidence may link automatically while uncertain results enter the Product Matching Centre. Platform QA then approves the hidden supplier offer. New canonical creation is an explicit platform action with a platform-controlled retail price. This preserves source provenance, makes false merges reversible, and prevents vendor imports from creating duplicate indexable products.


## Build 0.6 persistence boundary

The production database adapter is no longer only a future diagram. `PostgresUnitOfWork` owns transaction boundaries and sets transaction-local `app.actor_user_id`, `app.vendor_id`, `app.market_id`, `app.request_id` and explicit `app.platform_access` values so PostgreSQL RLS policies can enforce the same scope as the application authorization layer. Initial catalog and inventory repositories depend only on the SQL executor interface, keeping domain code independent from a particular Node PostgreSQL driver.

Migrations are immutable once registered. `db/migrations/checksums.json` is checked before the automated suite and the migration runner refuses an applied migration whose filename/checksum no longer matches source control. The runner serializes deployments with a PostgreSQL advisory lock and uses a transaction per migration.

Inventory reservation is designed to be authoritative in PostgreSQL: `reserve_stock`, `consume_stock_reservation`, `release_stock_reservation` and `expire_stock_reservations` lock the relevant balance/reservation rows and write inventory movements. Redis/queues may later accelerate expiry scheduling but never become the stock source of truth.

## Secure local pickup

An accepted `pickup` fulfilment may move to `ready_for_handover`, which issues one stable pickup credential. The customer receives a short code and signed QR representation; the assigned vendor verifies either proof. Credentials expire, count invalid attempts, lock on repeated abuse, are vendor/customer scoped and cannot be reused after collection. Collection is the operational event that marks the fulfilment delivered and permits procurement accrual.

## Supplier settlement control

Supplier money follows `fulfilled → procurement accrued → vendor invoice required → matched → payable → settlement draft → approval required → approved → paid/settled`. A settlement batch snapshots exact procurement amounts, one procurement may belong to only one batch, the maker cannot approve their own batch, and an external bank/PSP payout reference is required before the batch is considered paid. Database constraints mirror these application controls.


## Media, product trust and recall boundary — Build 0.6

Product media is a governed asset, not an arbitrary public URL. The storage interface issues one-time upload intents tied to canonical product, vendor, kind, filename and required rights/alt metadata. Finalized assets remain private while scan, rights and moderation states are unresolved. Only `clean + rights approved + moderation approved` media can be surfaced from canonical product responses. Compliance documents are separately reviewed and can expire independently of media.

Product safety controls operate at the canonical layer. A recall or compliance hold suppresses the canonical variant, which prevents every hidden vendor offer from remaining publicly sellable. Resolving a notice does not silently republish the product: restoration is an explicit audited platform action and fails if another blocking notice remains open.

## Background execution — Build 0.6

The transactional outbox now supports retry leases, failure backoff, a terminal `dead_lettered` state and explicit replay. `BackgroundWorker` claims only registered event types so unrelated domain events are not falsely failed. `MaintenanceJobs` provides deterministic periodic task registration. Build 0.9 adds durable worker lease ownership and scheduled-job storage contracts, including PostgreSQL adapters. The in-memory development worker remains a deterministic harness; production still requires a separately deployed worker process/queue runtime and alerting.

## Shipping boundary — Build 0.6

`ShippingService` normalizes direct-vendor shipping independently from carrier/provider APIs. An accepted shipping fulfilment creates one active shipment, then moves through label/tracking, physical handover, carrier transit and carrier-confirmed delivery. Provider event IDs are idempotency keys. Vendors may not self-mark shipping parcels delivered; this prevents supplier accrual from being triggered by an unauthenticated operational shortcut. Pickup continues to use secure collection proof and local delivery uses a separate platform-defined completion path.

## Public ID / internal UUID boundary — Build 0.7

Application/domain identifiers are stable opaque strings such as `vendor-…`, `cv-…` and `ord-…`; PostgreSQL relational keys remain UUIDs. Migration `0011_public_ids_fairness_governance.sql` adds unique `public_id` values to business records that cross the application boundary. Repository adapters resolve public IDs to internal UUIDs inside transactions, and vendor transaction scope resolves a public vendor ID to its UUID before RLS evaluates. This prevents domain-friendly identifiers from being written into UUID foreign keys while keeping internal joins compact and type-safe. Existing rows are backfilled with their UUID text so the migration is non-destructive.

## Fairness governance boundary — Build 0.7

Fair rotation remains separate from merchant quality and paid promotion. Vendors can see product-level target/actual exposure information for products they actually supply and can submit a reasoned appeal only within their own supplier scope. Platform operators can move an appeal through review to a reason-coded resolution. Operational anomaly detection uses configurable minimum sample size and exposure-share deviation thresholds; anomalies can be acknowledged/resolved but do not silently alter rotation weights. Appeals, anomaly actions and exceptional assignment decisions are auditable governance records rather than hidden ranking controls.

Fairness governance also has dedicated RBAC permissions rather than inheriting generic platform access. Vendor owners can submit appeals, vendor catalog staff can inspect fairness without changing it, and only designated platform operations/catalog roles can resolve appeals or anomalies. Vendor dashboard responses are assembled by permission so specialist staff do not receive finance, advice, fulfilment or fairness data outside their role.


## Identity, vendor and trust persistence boundary — Build 0.8

Build 0.8 closes the largest remaining PostgreSQL adapter gap. `PostgresIdentityRepository` persists users, customer/platform/vendor roles, opaque session hashes, hashed CSRF proof and one-time email verification state without storing plaintext session or CSRF secrets. Session lookup and CSRF verification remain separate operations, matching the application security model. Transaction scope now resolves public actor, vendor and market identifiers to internal UUIDs before RLS-protected statements execute.

Vendor onboarding is durable through `vendor_applications` and append-oriented `vendor_application_events`. Owner RLS permits starting/submitting an application but cannot advance it into platform-controlled activation states. `PostgresVendorRepository.provisionActiveVendor` atomically creates the verified supplier business, primary location and owner membership only after the domain workflow is `active`.

Product media, compliance evidence, product notices, customer returns, notification content and privileged audit provenance now have PostgreSQL adapters. Returns carry an explicit vendor scope for the current one-line return workflow, while customer inserts are constrained to orders actually owned by that customer; vendor access is read-only and scoped. Notification recipients may mark read state but a database trigger prevents them from altering message/event content.

`PostgresPersistenceBundle` is the single construction point for all production repositories. The executable demo runtime is intentionally not switched yet because this environment has no live PostgreSQL server/driver; the bundle is ready for that cutover without pretending live-database proof exists.


## Durable workers, search projection and stock freshness — Build 0.9

Background processing now separates event delivery from scheduling. `BackgroundWorker` depends on an `OutboxStore`, claims only registered event types under a worker ID/lease and supports multiple independent subscribers for the same event. `PostgresOutboxRepository` implements `FOR UPDATE SKIP LOCKED` claiming plus persistent lock ownership, retry/dead-letter state and explicit replay. Periodic work uses `ScheduledJobRunner` over a `ScheduledJobStore`; the PostgreSQL implementation persists next-run time, lock owner/expiry, failures and last success so two workers cannot execute the same due job concurrently.

Stock freshness is governed by `StockFreshnessPolicy` instead of a universal 24-hour check. Category rules determine freshness TTL and reminder lead time. Confirmations feed `fresh`, `due_soon` and `stale` transitions; stale supply becomes ineligible for cart/order resolution and public search availability. Transition events can notify the merchant and trigger search re-projection without secretly changing fairness weights. PostgreSQL stores confirmation time, TTL and freshness state on inventory balances.

Public search is treated as a projection, never as the system of record. `SearchIndexingService` resolves a canonical product into a public document, hashes the normalized document to avoid unnecessary writes, and removes the document when the canonical product is suppressed or no longer publicly eligible. `search_index_state` persists projection status/hash/version for production reconciliation. A scheduled reconciliation job provides a recovery path if an event is missed. The development runtime uses `LocalSearchEngine`; a production Greek-capable search adapter remains replaceable behind the same boundary.


## CMS, SEO and merchant-story boundary — Build 0.11

Public content is no longer hard-coded into storefront templates. `ContentService` owns modular pages, translations, versioned navigation, redirects, canonical-product collections and merchant stories. Greek is mandatory for the Sparta pilot; English is optional but first-class where supplied. Pages move through draft/scheduled/published/archive states and every content mutation creates a revision snapshot. The scheduled-publication job uses the same durable scheduling contract as other maintenance work.

Merchant storytelling has a deliberate two-party publication rule: platform editorial staff can create the story, but the affected vendor owner must approve it before the platform may publish it. Vendor approval does not modify fairness weights or organic product assignment. Curated collections reference canonical variants only, so editorial merchandising cannot accidentally create duplicate public supplier listings.

The SEO projection emits locale-specific canonical URLs, hreflang alternates, robots/Open Graph metadata, XML sitemap entries and structured data. Product structured data names Buy Local Sparta as seller and records the selected local shop as a separate fulfilment-partner property, preserving the reseller model. Public sitemap paths are backed by real localized HTML routes in the executable development runtime rather than placeholder/404 URLs.

Migration `0015_cms_seo_storytelling.sql` and `PostgresContentRepository` persist pages/translations/revisions, menus, redirects, merchant stories and collections behind market/vendor/user public-ID resolution and RLS. The development runtime remains in-memory until a live PostgreSQL cutover environment is available.

## Delivery, supplier-commercial and dispute boundary — Build 0.10

Customer delivery pricing is a commerce concern and is deliberately separate from supplier reimbursement. `DeliveryPricingService` resolves market/vendor/postcode-specific customer charges, free-shipping thresholds and package increments before payment authorization. The resolved quote is snapshotted onto each fulfilment order together with the rule/version that produced it; the customer order then carries one consolidated delivery total inside the single platform payment. Rescue-supplier routing preserves the already-authorized customer delivery promise instead of silently repricing after checkout. A future courier quote can inform operational cost without becoming the customer price source of truth unless an explicit pricing rule says so.

Supplier procurement economics remain independent from the public retail price and from identical-product fairness. `FeeRuleEngine` resolves versioned B2B service rules by explicit commercial precedence (`vendor_contract → campaign_credit → plan → category → market_default`) and stores immutable fee snapshots. Only after the supplier invoice is matched may the procurement commercial snapshot apply platform service fees, supplier shipping reimbursement or credits. The supplier invoice gross, service fee, reimbursement and final payable remain separate fields; settlements pay the resolved payable rather than deriving vendor money as `customer gross − commission`. Fee rules never participate in organic identical-offer rotation.

Payment disputes form a separate risk workflow. A provider chargeback opens an idempotent dispute record and places affected unsettled supplier procurements on hold without assuming merchant liability. Evidence, provider submission and provider outcome are retained. A lost chargeback requires an explicit, reasoned finance decision before loss is allocated to the platform or—where the supplier contract and facts justify it—to the supplier. Until that decision, the system does not silently deduct the disputed amount from vendor settlements. The internal ledger records the hold/outcome/allocation transitions so the eventual accounting treatment can be reconciled to the PSP and official books.

`PostgresCommercialRepository` persists delivery rules, fee rules/snapshots and payment-dispute evidence/provider events using the same public-ID/internal-UUID boundary as the rest of the persistence layer. Migration `0014_delivery_fees_disputes.sql` adds the corresponding row-level access policies. Live PostgreSQL and provider integration remain deployment gates; the development runtime exercises the same domain contracts with deterministic adapters.

## Analytics and demand-intelligence boundary — Build 0.12

`AnalyticsService` records privacy-minimised product/search/commerce events in the development runtime and produces deterministic market and vendor reports. Search-result clicks are accepted only when the originating search belongs to the same visitor/customer context. Search CTR is measured as unique search sessions with at least one click divided by searches, so one session clicking multiple products cannot inflate CTR above 100%. Zero-result queries and category demand are kept as explicit product-discovery signals.

The PostgreSQL model separates raw events from rollups. `analytics_events` is platform-only and stores one-way visitor hashes plus stable public object relationships. `analytics_market_daily` and `analytics_search_terms_daily` are platform-only aggregates; `analytics_vendor_daily` is readable only by the corresponding vendor or authorized platform scope. `PostgresAnalyticsRepository` supports event append, daily rollups/search demand and retention deletion.

Analytics never becomes the source of truth for orders, finance, stock or fairness. GMV is derived from idempotently attributed order events backed by the commerce domain, monetary values use integer minor units, and the Fair Vendor Exposure Engine does not consume analytics conversion metrics. Production persistence/runtime cutover remains gated on a live PostgreSQL environment.


## Notification delivery boundary — Build 0.13

`NotificationOrchestrator` is the event-to-message boundary. It always records the scoped in-app notification and then resolves active immutable template revisions for eligible external channels. `NotificationPreferenceService` applies exact event preferences before wildcard preferences; marketing is opt-in by default, SMS/push are opt-in, and a template explicitly classified as required transactional delivery cannot be disabled through the optional-channel preference switch. Marketing consent is not treated as interchangeable with transactional necessity.

External delivery never blocks the order/request that emitted it. `NotificationDeliveryWorker` leases queued messages, resolves the destination only at send time, uses the notification public ID as a provider idempotency key, and records sent/retry/terminal-failure outcomes. Delivery-attempt history stores a masked destination, provider name, provider message ID or error, and timestamps. Raw external destinations are not copied into the attempt/audit record. Admin can explicitly requeue a failed item after investigation.

Migration `0017_notification_delivery.sql` adds delivery lease/retry fields, immutable template revisions, scoped recipient preferences and masked attempt persistence. `PostgresNotificationOperationsRepository` implements the same delivery-store contract with `FOR UPDATE SKIP LOCKED`, so multiple workers can safely claim notification batches once a live PostgreSQL runtime is available. The current development providers are deterministic adapters only; production sender domains, SMS/push credentials, consent evidence and provider webhooks remain deployment/integration gates.


## Security, readiness and accessibility boundary — Build 0.14

Internet-facing request controls now sit ahead of the domain handlers. The development runtime applies request IDs, browser-security headers, a bounded JSON parser and route-specific abuse limits. Abuse-correlation keys are one-way hashes; the security-event service records only bounded sanitized metadata and has a 90-day retention path. Migration `0018_security_operational_events.sql` and `PostgresSecurityRepository` provide append-only, platform-RLS persistence for the production cutover. A production deployment must replace the in-process limiter with a shared Redis/edge control so limits hold across instances.

Operational health deliberately distinguishes process liveness from dependency readiness. Non-critical notification-provider degradation makes the service `degraded` without declaring the commerce core unavailable. Critical catalogue/search failures make readiness unhealthy and return 503. Admin health remains readable so operators can diagnose an unhealthy service.

Accessibility is treated as an architectural quality gate rather than a visual polish pass. Generated interfaces contain skip links, main landmarks, keyboard-visible focus, reduced-motion handling, programmatic labels and live-region/table semantics; `npm run test:a11y` renders all principal development surfaces and checks these invariants. The automated suite cannot establish WCAG 2.2 AA by itself: keyboard, screen-reader, zoom/reflow, contrast, dynamic-error and mobile testing remain a human launch gate documented in `docs/ACCESSIBILITY.md`.

The complete implementation threat model is in `docs/THREAT_MODEL.md`. It records both implemented controls and residual production risks such as live PostgreSQL RLS/concurrency proof, provider signature verification, production CSP nonce/hash configuration, distributed rate limiting and authenticated penetration testing.


## Verified review boundary — Build 0.15

A public review is not accepted merely because a user is logged in. `ReviewService` first proves one of two source relationships: an owned customer-order line with fulfilled quantity, or a verified advice interaction consisting of a two-sided platform conversation or completed appointment. One customer/source can create one review. The public projection deliberately removes customer identity and labels only the interaction provenance (`Verified buyer` or `Verified advice customer`).

Merchant response and merchant reporting are supplier-scoped. A report creates a moderation case but does not automatically suppress the customer's review. Platform moderation is explicit, reasoned and auditable; only `published` reviews contribute to product/vendor aggregates. Incentivized reviews require visible disclosure. Review status, rating or conversion performance is not an input to the Fair Vendor Exposure Engine, preserving the distinction between trust/content governance and equal organic supplier opportunity.

PostgreSQL migration `0019_verified_reviews.sql` enforces source-shape and duplicate-source constraints, persists vendor responses/reports and append-only review events, and separates customer/vendor/platform access through RLS. Public serving remains an application projection rather than anonymous direct database access.


## Return, guarantee and affected-recall boundary — Build 0.16

`ReturnService` is now the platform-owned consumer-remedy state machine rather than a vendor-controlled refund shortcut. A request proves customer/order-line ownership and records its source (`customer` or `safety_recall`), requested remedy and a configurable eligibility assessment. The policy window is an engineering configuration used to route obvious cases; a case outside that configured window becomes `manual_review` rather than being used as an automated declaration that statutory rights do not exist.

Physical reverse logistics has an explicit RMA and custody model. Authorization records the return destination, cost payer, instructions, optional carrier/tracking and an expiry. Customer dispatch, carrier/vendor/platform/repairer receipt and later repair return create append-oriented custody evidence. Inspection moves units back to sellable inventory or into blocked/quarantined stock before a remedy is approved. Vendors may perform only scoped operational actions; the platform owns remedy approval.

Replacement and repair are separate operational chains. A replacement reserves eligible stock independently of the original sale and prefers the original supplier only when it is still eligible and available; the Fair Vendor Exposure ledger is not retroactively manipulated by the remedy. A repair keeps the original unit blocked, carries custody and an operational due date, then records return to the customer. Price reduction creates an exact line-level monetary adjustment without falsely marking physical quantity returned.

`RecallOperationsService` fans out a canonical recall to every fulfilled outstanding order-line quantity (`fulfilled - already refunded`) and creates one affected-customer case per notice/order line. Notification, acknowledgement, selected remedy, linked return and resolution are tracked separately from the canonical product notice so safety suppression cannot be confused with individual customer remediation.

Customer protection is intentionally independent from supplier-settlement timing. If procurement is still unsettled, normal quantity reversal adjusts the supplier payable. If it is already settled, the closed payout remains historically closed and the finance domain posts a vendor receivable/post-settlement recovery entry instead. The customer refund proceeds without waiting for supplier recovery. Migration `0020_return_guarantee_recall.sql` persists these relationships, evidence/custody/remedy records and recall-affected cases behind customer/vendor/platform RLS. Exact official B2B credit-note and VAT treatment remains outside the domain assumption until accountant/legal approval.


## Consolidated order operations boundary — Build 0.17

`OrderOperationsService` projects the internal multi-vendor order into one customer-owned tracking view. The customer sees overall progress plus individual fulfilment stages, courier/pickup state, delay state and a durable logical timeline without gaining access to supplier-private procurement or settlement data.

Cancellation is a pre-handover commerce operation, not a return shortcut. Active stock reservations are released; already-consumed reservations are explicitly reversed into inventory; an authorized payment is cancelled and a captured payment is refunded for the cancellable amount. Once physical handover has started (`ready_for_handover`, `shipped` or `delivered`), the consumer-remedy/return domain owns the next action.

Substitution is consent-based. The assigned vendor may reserve an eligible alternative only from the same vendor/location context. The proposal records original/proposed canonical identity, offer, price, reason and expiry. The customer alone approves/rejects the pending proposal. This build permits only an equal/lower customer price; a higher price requires a new explicit payment authorization path. Fair Vendor Exposure history is not rewritten by a service-recovery substitution.

Fulfilment SLA is operational governance rather than secret ranking. Acceptance and preparation clocks open from actual state transitions, then progress through `open → breached → escalated → resolved`. Delays can be shown to customers and escalated to operations, but they do not directly modify fairness weights. Persistent SLA/timeline/substitution/cancellation storage is defined in migration `0021_order_tracking_substitutions_sla.sql`.


## Trading calendar and fulfilment-coverage boundary — Build 0.18

`TradingCalendarService` is the source of operational opening truth for a vendor location. Weekly rules support split intervals, while dated exceptions can close or replace ordinary hours. Customer opening state, pickup/advice windows and business-time deadlines are projections from this calendar rather than duplicated hard-coded opening-hour strings. `OrderOperationsService` and `AdviceService` accept business-deadline callbacks so an SLA can pause outside the responsible shop's configured hours.

`DeliveryCoverageService` answers whether a vendor location can serve a specific `market + postcode/coordinates + fulfilment mode + time` context. Pickup is location-bound, local delivery requires governed postcode-prefix and/or radius coverage, and shipping can be configured independently. This module is intentionally distinct from `DeliveryPricingService`: serviceability determines whether an offer may participate at all, while pricing calculates the customer delivery charge only after that serviceability gate passes. Supplier price and paid plan status remain absent from identical-product fairness selection.

The cart and checkout domains consume the same serviceability resolver used to construct eligible vendor offers, preventing a product from looking deliverable in discovery but becoming silently impossible at payment. The development storefront also exposes `open now` as an explicit customer filter rather than a hidden ranking penalty.

Migration `0022_trading_hours_delivery_coverage.sql` persists location calendars, weekly opening intervals, dated exceptions and fulfilment service zones separately from delivery-price rules. `PostgresAvailabilityRepository` writes merchant-owned configuration under actual vendor RLS scope. Live PostgreSQL/PostGIS and production geocoding/radius verification remain launch-gate evidence rather than assumed completion.


## Multi-location fairness and capacity boundary — Build 0.19

A vendor may operate more than one physical storefront or fulfilment point, but Fair Vendor Exposure remains merchant-fair rather than branch-count-fair. `FairVendorExposureEngine` first groups eligible offers by `vendorId`, grants each merchant one rotation ticket, resolves the merchant deficit/target share, and only then chooses the best currently eligible location/offer for the requested fulfilment context. Capacity weight is not summed across branches. This prevents a merchant from obtaining extra organic exposure simply by creating more locations.

`VendorLocationDirectory` owns the application-facing location identity and one-primary-location invariant. `FulfilmentCapacityService` applies explicit ceilings per vendor/location/mode using current open fulfilment counts. A full location is removed through transparent eligibility (`capacityOpen=false`); capacity does not become a secret quality or conversion score. `CartService` and `CommerceService` consume the same runtime capacity/serviceability resolver so discovery and checkout cannot disagree about whether the assigned branch can accept more work.

Migration `0023_multi_location_capacity.sql` adds primary/timezone fields, one-primary enforcement, vendor-location RLS and `fulfilment_capacity_rules`. `PostgresAvailabilityRepository` persists/reads public location IDs and capacity rules while internal foreign keys remain UUIDs. Radius zones remain PostGIS-ready, but production coordinate geocoding and live database concurrency verification are still launch gates.


## Category governance and progressive commerce — Build 0.20

`CategoryGovernanceService` is the shared policy boundary between taxonomy, vendor product validation, public filtering and checkout. Categories declare an explicit commerce mode plus governed attribute bindings. Canonical search documents carry normalized governed attributes, while vendor-specific hidden offers never become independent public facet records. This preserves the one-canonical-product invariant.

Commerce policy is evaluated explicitly rather than folded into Fair Vendor Exposure. Compatibility confirmation, regulated-product clearance, allowed fulfilment modes, advice and counteroffer availability can block or require an action, but they never manufacture a secret merchant ranking score. Vendor source products are normalized against the same attribute schema before canonical matching so search/filter identity and matching identity cannot drift apart.

The PostgreSQL layer stores these rules on categories/attribute definitions/bindings with translations and exposes them through `PostgresCategoryGovernanceRepository`. Build 0.20 still executes the complete development runtime in memory because a live PostgreSQL/PostGIS environment is unavailable; actual DB policy/RLS execution remains a launch-gate test.


## Platform retail pricing, promotions and coupons — Build 0.21

Retail pricing is a platform-owned commerce domain. `RetailPricingService` keeps append-only platform base-price history and time-bound public promotional prices for canonical variants. It is deliberately independent from `vendor_offers.supplier_price`: a supplier's private procurement cost can affect contractual offer eligibility/cost ceilings but never becomes the customer's public comparison/ranking signal.

Announced price reductions resolve the lowest actual public platform price in the preceding 30-day window from effective base-price changes and promotions that genuinely ran. Campaign creation is non-retroactive and non-overlapping per canonical product, and a later base-price change is rejected when it would make an unfinished campaign's promotional price equal to or higher than base. The order line snapshots pricing source, promotion ID and prior price so later campaign changes cannot rewrite the purchase record.

`CouponService` resolves versioned coupon rules against canonical/category/pricing-source eligibility, computes discounts using integer minor units and deterministically allocates the exact discount across eligible lines. Checkout stores those allocations; refunds use the paid line value rather than gross sticker price. Redemptions use one-way subject hashes in PostgreSQL and cap checks run under serialized/locked persistence. Only an order cancelled before capture releases its coupon usage through an append-only reversal.

Promotion/coupon configuration never changes Fair Vendor Exposure deficits, target shares or capacity weights. Vendor-attributed analytics records paid merchandise after allocated customer discounts, while supplier procurement/settlement remains governed by the separate B2B finance domain.


## Customer personalization and privacy boundary — Build 0.22

`CustomerPersonalizationService` stores only customer-owned convenience state: saved canonical products, saved merchants, bounded recently-viewed canonical products and explicit personalization preferences. It is not consumed by the Fair Vendor Exposure Engine and therefore cannot make a merchant win identical-product rotation because a customer happened to save or view it. Ordinary catalog/search/checkout remains available when personalization is disabled.

`PrivacyRequestService` models access/export/deletion/objection/marketing-withdrawal/account-closure requests independently from mutable account state. A deletion request can erase non-essential personalization immediately while business-critical order/tax/guarantee/security evidence remains represented in an explicit retention snapshot. Account closure pseudonymizes the consumer identity and revokes active sessions instead of cascading away financial/order history. Merchant/staff identities are excluded from consumer self-service closure because supplier contracts, auditability and role offboarding require a separate governed workflow.

The PostgreSQL implementation mirrors this boundary in migration `0026_customer_personalization_privacy.sql`: saved/recent tables use customer-own RLS plus authorized platform access, privacy request status/outcome becomes platform-controlled after submission, and `PostgresCustomerPrivacyRepository.closeCustomerAccount()` runs as a serializable transaction. The exact production retention schedule is intentionally not encoded as legal certainty until reviewed by Greek counsel/accounting/privacy specialists.

## Saved-product engagement boundary — Build 0.23

`SavedProductAlertService` is transition-based customer convenience state. A customer explicitly enables back-in-stock and/or public platform price-drop alerts for an already-saved canonical product. Configuration snapshots current public availability and Buy Local Sparta retail price; reconciliation emits only later false→true availability transitions or qualifying public-price drops. Supplier purchase price never enters this domain. Search/outbox events drive fast reconciliation and a leased scheduled job provides repair/reconciliation if an event is delayed.

`CustomerRecommendationService` ranks canonical products only. Inputs are customer-owned saved/recent canonical-product signals plus public category/brand/availability/advice metadata. It does not receive vendor IDs, supplier prices, vendor conversion or Fair Vendor exposure state. Once a canonical recommendation has been chosen, the customer-facing product projection independently invokes the normal Fair Vendor Exposure Engine to select/stick the local partner. Personalization therefore cannot become an undocumented second vendor-ranking algorithm.

Migration `0027_saved_product_alerts_recommendations.sql` persists customer-owned alert preferences and append-only alert history with own-user/platform RLS. `PostgresEngagementRepository` joins the unified persistence bundle. Privacy deletion/account closure remove alert preferences as non-essential personalization; business/order/financial records remain governed by their separate retention rules. Live PostgreSQL execution remains a production gate.


## Saved demand, notification centre and recommendation diversity — Build 0.24

`SavedSearchService` stores a normalized customer-owned search intent and a bounded baseline of canonical variant IDs. Creation or re-enabling snapshots current matches; reconciliation compares the later canonical result set and emits only never-before-alerted `new_match` events. Relevant catalog/inventory/pricing/search-projection events run the fast path, while a leased scheduled reconciliation repairs missed/delayed events. Saved-search state is non-essential personalization and participates in privacy export/erasure.

Search scoring now has an explicit lexical/identity gate for non-empty queries. Availability, pickup and advice quality may improve the rank of an already relevant canonical product, but they cannot convert an unrelated product into a query match. This invariant is required for truthful zero-result analytics and saved-demand alerts.

The notification centre is a projection over existing notifications, grouped into stable customer-operational categories. Read/archive state is recipient-mutatable, while notification content and external-delivery provenance remain protected. Archive is not deletion; compliance/operational history survives. PostgreSQL notification guards mirror that distinction.

`CustomerRecommendationService` remains canonical-product-only. Build 0.24 adds localized reason explanations and diversity caps (`maxPerBrand`, `maxPerCategory`) to reduce repetitive shelves. It still has no supplier purchase price, vendor conversion, plan, fairness deficit or paid-placement input. Only after a canonical recommendation is chosen does the existing Fair Vendor Exposure Engine resolve the visible local partner.
