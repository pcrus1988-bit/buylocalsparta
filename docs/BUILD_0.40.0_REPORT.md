# Buy Local Sparta — Build 0.40.0 Report

**Release:** 0.40.0  
**Focus:** Production canonical-product search + durable transactional email delivery  
**Status:** verified source checkpoint; live Meilisearch and Resend credentials/network/staging evidence remain deployment gates

## Executive summary

Build 0.40.0 connects two previously provider-neutral production contracts to concrete external transports while preserving Buy Local Sparta's core marketplace invariants.

- **Meilisearch** is now the rebuildable external search projection for canonical public products.
- **Resend** is now the transactional email transport over the existing durable PostgreSQL notification queue.

PostgreSQL remains authoritative for catalog/publicability, search projection state, notification state, delivery attempts, user preferences and provider-event deduplication. Neither external provider becomes a marketplace source of truth.

A critical fairness boundary is preserved: Meilisearch returns canonical product IDs only. Hidden Vendor offers, supplier economics and Fair Vendor Exposure state are never indexed. The platform performs Fair Vendor Exposure only after the canonical search result set is known and only for products that are actually rendered to a visitor.

## 1. Meilisearch production adapter

New workspace:

`packages/meilisearch-search`

Prepared capabilities:

- separate query/search API key and index-management API key;
- index creation/configuration;
- asynchronous task polling;
- canonical document upsert/removal;
- query filtering and public price sorting;
- autocomplete;
- bounded request/task timeouts;
- normalized search hit mapping.

The production web process requires only the restricted search key. Index-management credentials are reserved for trusted configuration/reconciliation workers.

## 2. Canonical-only external search projection

`PostgresProductionSearchService` now projects governed canonical products from PostgreSQL into Meilisearch.

Indexed data is intentionally limited to public canonical information such as:

- canonical public ID;
- localized public title/description;
- brand/model/public product identifiers;
- governed category/attribute data;
- public platform retail price;
- aggregate availability/pickup/advice flags.

The external index must not contain:

- hidden Vendor offers;
- supplier acquisition prices;
- Vendor fairness deficits/weights;
- competitor exposure statistics;
- customer identifiers;
- private Ask Local prices;
- settlement/finance data.

The projection reuses existing canonical `active`, `suppressed` and `recalled` governance state. An invalid duplicate product-notice predicate was caught during schema review and removed rather than inventing columns or competing publicability rules.

## 3. Search + Fair Vendor Exposure ordering

For a non-empty production `/shop` query with search enabled:

1. Meilisearch selects relevant canonical product IDs.
2. Buy Local Sparta resolves only those governed canonical products.
3. Fair Vendor Exposure runs inside BLS only for the canonical products that can actually be rendered.
4. The customer sees one canonical product card with the assigned eligible local advice/fulfilment partner.

This ordering prevents the external search engine from choosing Vendors and prevents invisible search candidates from generating phantom Fair Vendor Exposure assignments.

Blank-query browsing and search-disabled development retain the PostgreSQL fallback path.

## 4. Durable search reconciliation

The existing `search_index_state` PostgreSQL table remains the durable projection ledger.

Build 0.40 adds:

- stable document hashing;
- skip-unchanged behavior;
- durable indexed/removed/failed state;
- suppression/removal reconciliation;
- full PostgreSQL-driven rebuild capability;
- `npm run search:configure`;
- `npm run worker:search`.

Meilisearch therefore remains replaceable/rebuildable rather than becoming catalog authority.

The current reconciliation worker is intentionally documented as normally single-active-worker per index. Repeated document upserts remain safe through stable IDs/hashes, but a dedicated distributed lease for this provider loop remains a future hardening item.

## 5. Resend transactional email adapter

New workspace:

`packages/resend-notifications`

Prepared capabilities:

- transactional email submission;
- provider message-ID capture;
- provider idempotency using the durable notification public ID;
- bounded HTTP timeout;
- optional reply-to;
- signed raw-body webhook verification;
- webhook timestamp tolerance;
- normalized provider event representation.

Application request handlers do not call Resend directly. The existing PostgreSQL notification queue remains the durable control plane.

## 6. Notification-worker hardening

The Core delivery worker was tightened as part of the concrete email integration.

Previously, an email-only provider configuration could lease SMS/push notifications and consume their retry attempts even though no matching provider existed. Build 0.40 changes the claim contract so a worker leases only channels for which it has configured providers.

Recipient-resolution failures are also isolated per notification. One malformed/missing recipient no longer aborts an entire worker tick or block unrelated due deliveries.

These changes added one new Core regression test, increasing the Core suite from 209 to **210 tests**.

## 7. Privacy-minimised provider-event persistence

New migration:

`0035_search_email_providers.sql`

The repository now contains **35 verified migrations**.

It adds durable platform-scoped state for:

- notification provider events;
- provider event IDs/types/message IDs;
- privacy-minimised event details;
- destination suppressions;
- suppression reason/source event;
- stable HMAC destination hashes rather than raw suppressed email addresses.

Provider events are unique by provider/event ID, making at-least-once webhook redelivery idempotent.

## 8. Resend webhook and suppression handling

New endpoint:

`POST /api/webhooks/resend`

The endpoint reads the raw request body before parsing and verifies the provider signature headers through the Resend/Svix verifier.

Current event handling includes:

- `email.delivered` — provider event recorded;
- `email.failed` — matching sent notification marked failed for operational visibility;
- `email.bounced` — event recorded, destination HMAC suppressed, notification marked failed;
- `email.complained` — event recorded, destination HMAC suppressed, notification marked failed.

Suppressed destinations are not automatically re-enabled. An explicit verified operational process is required.

## 9. Payment-driven transactional events

When external email delivery is enabled, the existing PostgreSQL/Viva orchestration now creates durable transactional notification events for:

- `order.payment_confirmed`;
- `order.refund_completed`.

Each event also creates the normal in-app notification.

If Resend is not enabled, the application does not create an undeliverable external-email backlog; the in-app notification remains available.

This retains the important architecture rule that payment processing enqueues a domain notification rather than calling an email provider inline.

## 10. Production workers and readiness

New/extended commands:

- `npm run search:configure`
- `npm run worker:search`
- `npm run worker:notifications`

When `BLS_SEARCH_ENABLED=true`, search becomes a production readiness dependency. The production readiness route checks the configured Meilisearch path.

Email provider health is observable without making temporary email-provider degradation indistinguishable from critical database/payment unavailability.

Deployment configuration is documented in:

`docs/SEARCH_NOTIFICATION_RUNBOOK.md`

## 11. Cross-instance live-DB proof prepared

The PostgreSQL integration smoke now includes deterministic fake Meilisearch and Resend transports so CI can prove the orchestration without relying on third-party network availability.

Prepared search proof:

- runtime A configures/projects a canonical product;
- runtime B queries the same external search projection;
- the canonical result is returned;
- no Vendor/supplier-private field is exposed.

Prepared email proof:

- Viva-confirmed customer payment creates a durable email notification;
- another runtime leases and sends it through the Resend adapter;
- provider message ID is persisted;
- a third-party-style delivered webhook is processed by another runtime;
- replaying the same provider event is a duplicate/no-op.

These tests remain part of the real PostgreSQL/PostGIS CI path and were type-checked locally. This execution environment does not provide a live PostgreSQL server, so the actual DB/network integration run is not claimed here.

## 12. Environment and CI additions

Meilisearch production configuration includes:

- `BLS_SEARCH_ENABLED`
- `MEILISEARCH_URL`
- `MEILISEARCH_INDEX_UID`
- `MEILISEARCH_SEARCH_KEY`
- `MEILISEARCH_ADMIN_KEY`
- request/task timeout controls
- reconciliation worker identity/interval.

Resend production configuration includes:

- `BLS_EMAIL_DELIVERY_ENABLED`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_REPLY_TO`
- `RESEND_WEBHOOK_SECRET`
- `RESEND_BASE_URL`
- request timeout
- stable destination-suppression secret
- notification worker identity/poll/batch controls.

Production CI now includes strict type checks for both provider packages. The database smoke remains provider-network independent through deterministic fakes.

## 13. Security and consistency hardening

The project consistency gate now verifies, among other things:

- release/package version alignment;
- Meilisearch/Resend workspace wiring;
- separate Meilisearch search/admin credential semantics;
- canonical-only external search projection;
- search-before-fairness ordering;
- platform-scoped search/provider-event database writes;
- signed raw-body Resend webhook handling;
- provider idempotency;
- privacy-minimised suppression persistence;
- email-only channel leasing;
- payment notification enqueue behavior;
- migration `0035` presence/checksum;
- cross-instance search/email DB-smoke proof markers;
- required environment/runbook/CI configuration.

## 14. Exact release verification

The exact clean Build 0.40.0 source passed:

- **210 / 210 Core tests**
- **7 / 7 Viva payment-adapter tests**
- **4 / 4 AADE myDATA tests**
- **3 / 3 media/ClamAV tests**
- **2 / 2 Meilisearch adapter tests**
- **2 / 2 Resend adapter tests**
- **35 / 35 migration integrity checks**
- project consistency/security/PostgreSQL/search/email gate
- **4 / 4** development UI syntax checks
- **6 / 6** structural accessibility checks
- complete HTTP marketplace smoke journey
- strict Core TypeScript
- strict Viva TypeScript
- strict myDATA TypeScript
- strict Meilisearch TypeScript
- strict Resend TypeScript
- strict PostgreSQL-runtime TypeScript
- strict object-storage TypeScript
- strict media-processing TypeScript
- strict media-worker TypeScript
- semantic PostgreSQL/Meilisearch/Resend DB-smoke TypeScript
- **352 TS/TSX source files** parsed through the TypeScript AST
- **0 parse errors**
- **0 missing relative imports**

All temporary local validation shims were removed before the final dependency-free `npm run check`, which passed again on the clean source tree.

## 15. Remaining deployment evidence

Build 0.40 contains the production adapters but does not claim live-provider activation.

Still required before production declaration:

### Meilisearch
- real cluster/network/TLS provisioning;
- restricted search key + separate management key;
- index configuration task evidence;
- Greek/English/Greeklish relevance acceptance;
- recall/compliance removal evidence;
- full rebuild/recovery evidence;
- exported-index review proving no supplier-private leakage.

### Resend
- verified sending domain;
- SPF/DKIM/provider health evidence;
- real staging transactional email;
- idempotency replay evidence;
- signed live webhook evidence;
- duplicate webhook proof;
- bounce/complaint suppression proof;
- worker crash/recovery proof.

The genuine Node 24 `next build`, live PostgreSQL/PostGIS smoke, Viva staging, S3/ClamAV staging and AADE test/accounting gates also remain deployment evidence where previously documented.

## Conclusion

Build 0.40 completes the concrete production transport layer for public search and transactional email without weakening the human-first/local-fairness marketplace model.

External search chooses **products, not Vendors**. External email transports **durable domain notifications, not business logic**. PostgreSQL remains authoritative for both.
