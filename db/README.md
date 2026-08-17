# Database

Production target: PostgreSQL 18 with `pgcrypto`, `citext`, and PostGIS.

Migrations are intentionally SQL-first and preserve the accounting/domain invariants in the source specification. Apply them in filename order inside a controlled deployment transaction/migration tool.

Current migrations:

- `0001_core.sql` — normalized marketplace foundation: market/town, identity/RBAC, vendors, canonical catalog, hidden vendor offers, inventory, fairness, cart/order split, payments, procurement, settlement, advice, returns, CMS, outbox, audit and RLS scaffolding.
- `0002_runtime_hardening.sql` — delivered/refunded quantity invariants, session CSRF storage support, and idempotent/leased outbox state.
- `0003_identity_private_offers_notifications.sql` — one-time email-verification tokens, immutable private-offer price provenance, and in-app notification read/deduplication state.
- `0004_launch_plan_configuration.sql` — Free Listing, Founding/Early Bird and draft Standard commercial-plan configuration.
- `0005_catalog_workflows.sql` — vendor source-product submissions, CSV import batches/rows, Product Matching Centre linkage and append-only catalog workflow history with vendor RLS.
- `0006_transactional_inventory.sql` — row-locked reservation/consume/release/expiry functions plus stock freshness fields.
- `0007_settlement_controls.sql` — settlement maker/checker/payout guards and unique procurement batching.
- `0008_rls_platform_scope.sql` — explicit vendor-vs-platform RLS access policies driven by transaction-local application scope.
- `0009_media_compliance_jobs.sql` — governed product media metadata, scan/review states, compliance evidence lifecycle, product notices and dead-letter-aware outbox state with vendor/platform RLS.
- `0010_shipping_provider_events.sql` — direct-shipment state/identity fields, one-active-shipment guard, idempotent provider events and vendor/platform RLS.
- `0011_public_ids_fairness_governance.sql` — stable application-facing public IDs over internal UUID keys, fairness appeals/anomalies and vendor/platform RLS.
- `0012_identity_vendor_trust_persistence.sql` — durable auth/session identifiers, vendor application/history persistence, supplier provisioning, notification content/RLS, return timeline/RLS and audit actor provenance.
- `0013_workers_search_freshness.sql` — persistent outbox worker leases, scheduled jobs, search projection state and category-aware inventory freshness fields/policies.
- `0014_delivery_fees_disputes.sql` — customer delivery rules/snapshots, extended B2B fee-rule and fee-snapshot fields, supplier payable/dispute state, payment dispute evidence/provider events and associated RLS.
- `0015_cms_seo_storytelling.sql` — versioned CMS pages/translations/revisions, navigation menus, redirects, merchant stories with vendor-owner approval, canonical-product collections and public/vendor/platform RLS.
- `0016_analytics_reporting.sql` — privacy-minimised analytics events, market/vendor/search-demand aggregates, retention metadata and RLS.
- `0017_notification_delivery.sql` — external notification queue/lease/retry state, immutable template revisions, user/vendor channel preferences, masked delivery attempts and RLS.
- `0018_security_operational_events.sql` — append-only privacy-minimised security telemetry, retention support, platform-only RLS and update prohibition.
- `0019_verified_reviews.sql` — verified order/advice review provenance, incentive disclosure, vendor responses/reports, moderation history and customer/vendor/platform RLS.
- `0020_return_guarantee_recall.sql` — fulfilled/refunded order-line evidence, RMA authorization, return custody/evidence, replacement/repair remedies, recall-affected orders and post-settlement supplier-return recovery state.
- `0021_order_tracking_substitutions_sla.sql` — consolidated order timeline, customer cancellations, customer-approved vendor substitutions and fulfilment SLA cases with scoped RLS/update guards.
- `0022_trading_hours_delivery_coverage.sql` — vendor-location calendars, weekly/special opening intervals, service zones and vendor/platform RLS.
- `0023_multi_location_capacity.sql` — vendor primary-location governance, explicit location RLS and per-location/per-mode capacity ceilings.
- `0024_category_governance_attributes.sql` — category commerce modes, governed attribute translations/bindings and progressive-checkout policy persistence.
- `0025_promotions_price_history.sql` — append-only platform price history, non-overlapping/non-retroactive public price reductions, versioned coupons, redemption/reversal accounting and order-line promotion/discount snapshots.
- `0026_customer_personalization_privacy.sql` — customer saved products/shops, bounded recently viewed, personalization preferences, privacy-request lifecycle, consumer-closure fields and customer/platform RLS.

Migration files are registered in `migrations/checksums.json`. Run `npm run db:verify` in CI before tests/deployments. Run `npm run db:migrate` when `DATABASE_URL` and the `pg` package are available; the runner uses a PostgreSQL advisory lock, validates applied checksums and applies each pending migration transactionally.

## Important

The local dependency-free development runtime still uses in-memory repositories for the full executable demo, but Build 0.22 includes the PostgreSQL unit-of-work abstraction, public-ID/UUID bridge, repository adapters covering catalog/inventory/fairness/commerce/advice/finance/shipping plus identity/vendor/media/trust/returns/notifications/audit, a unified persistence bundle, database-side inventory transaction functions and persistence structures for product trust/background events/direct shipping plus CMS/SEO/storytelling, analytics reporting, notification template/preference/delivery state, verified review persistence, and the expanded return/guarantee/recall operating model. PostgreSQL remains the production source of truth; the in-memory runtime is not a production persistence substitute.

Before production checkout, the seller/supplier, AADE/myDATA, supplier invoice, VAT and PSP payout model must be approved as documented in `docs/LEGAL_TECH_GATE.md`.
