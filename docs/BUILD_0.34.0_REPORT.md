# Buy Local Sparta — Build 0.34.0 Report

**Release:** 0.34.0  
**Date:** 15 August 2026  
**Focus:** PostgreSQL public catalog + authenticated cart + checkout/customer-order cutover

## Executive summary

Build 0.34.0 extends the production PostgreSQL application-service cutover from customer identity/account state into the customer commerce path. When `DATABASE_URL` is configured, the production Next.js public catalog, fair supplier assignment, authenticated cart, checkout, stock reservation, customer order history/detail and cancellation now share PostgreSQL as the authoritative state.

Development without a database keeps the deterministic in-memory adapters used by the existing 209-test domain suite. Vendor and Admin request-time operational state remain the next persistence cutover stages.

## PostgreSQL customer commerce service

A new `PostgresCustomerCommerceService` is exported by `@buy-local-sparta/postgres-runtime` and attached to `ProductionPostgresRuntime`.

It provides:

- safe public canonical-product projection;
- fresh-stock/product availability without creating fairness exposure events;
- persistent public Fair Vendor assignment and sticky attribution;
- public vendor profile and vendor-canonical projection;
- authenticated customer cart read/full synchronization;
- serializable checkout;
- customer-owned order list/detail;
- pre-handover customer cancellation.

The service uses the existing `PostgresUnitOfWork`, PostgreSQL RLS scope and database-native inventory reservation functions rather than recreating stock accounting in application memory.

## Atomic checkout and oversell protection

Database checkout executes with SERIALIZABLE isolation. For each canonical line it:

1. resolves the active/non-suppressed/non-recalled canonical product from PostgreSQL;
2. identifies approved active supplier offers with fresh sufficient stock and compatible fulfilment mode;
3. evaluates persistent Fair Vendor state;
4. calls the row-locked `reserve_stock` function;
5. snapshots customer retail price, tax and private supplier economics;
6. persists one customer order plus private vendor fulfilments and payment intent;
7. clears the authenticated durable cart after commit.

A failure rolls back fairness changes, reservations and order rows together.

The live CI database smoke is configured with two independent application runtimes. It now proves that two checkouts contending for the final available stock unit produce exactly one successful reservation/order and one rejection.

## Cross-instance idempotency

`customer_orders.checkout_fingerprint` is introduced by migration 0030.

New checkout fingerprints include:

- trusted visitor hash;
- authenticated customer identity when present;
- market;
- postcode;
- fulfilment mode;
- canonical product IDs and quantities.

A retry with the same checkout key and identical fingerprint returns the existing order. Reusing the key with changed payload is rejected. A different trusted visitor cannot claim another visitor's idempotent checkout. A safe legacy marker is retained for pre-migration rows.

The CI smoke executes the same checkout key simultaneously through two independent PostgreSQL runtime instances and requires one persisted order ID.

## Durable authenticated cart

Migration 0030 adds one durable cart per authenticated customer/market plus customer/platform RLS for carts and cart items.

A PostgreSQL-specific NULL uniqueness issue was caught during implementation: the original three-column cart-item unique constraint includes nullable `private_offer_id`, so ordinary canonical cart items would not reliably conflict on duplicate inserts. Build 0.34 adds a partial unique index over `(cart_id, canonical_variant_id) WHERE private_offer_id IS NULL` and targets that index during upsert.

The production `CartProvider` now:

- keeps guest cart state in browser storage;
- detects an authenticated PostgreSQL cart;
- merges durable + browser cart state after login;
- uses authoritative server product title/price for existing durable items;
- synchronizes canonical IDs/quantities through a CSRF-protected API;
- never sends client title/price as authoritative commerce data.

## Public storefront cutover

`catalog-view.ts` is database-aware. With `DATABASE_URL` configured:

- homepage cards read PostgreSQL canonicals and persistent Fair Vendor assignment;
- `/shop` search/filter/sort starts from database canonical state;
- `/product/[id]` resolves database product/availability/assigned local partner;
- public vendor profiles resolve real active PostgreSQL vendor IDs instead of demo-only IDs;
- customer saved-product/recent-view validation uses the database public catalog.

This closes the previous source-of-truth split where a PostgreSQL checkout could have been attempted against products selected from the in-memory demo catalog.

## Customer account order cutover

Authenticated account order history, order detail and cancellation now switch to PostgreSQL when configured. Order state created on one application instance is therefore visible from another instance.

Cancellation remains restricted to the pre-handover window and releases active reservations before cancelling eligible fulfilments/payment intent/order state.

## Pending-payment lifecycle and PSP gate

Real payment capture remains intentionally unimplemented until the approved PSP/legal integration exists.

Production Next.js PostgreSQL checkout therefore fails closed unless the explicit preview flag is set:

`BLS_ALLOW_PRE_PSP_CHECKOUT=true`

This flag must remain false for a real production launch until a PSP adapter is connected.

The database service itself can create `pending_payment` orders for integration proof. These unpaid fulfilments are excluded from merchant-capacity load. After stock reservations expire, the PostgreSQL worker calls `expire_pending_payment_orders()` to cancel abandoned pending orders and their fulfilment/payment intent state.

## Migration 0030

`0030_customer_commerce_runtime.sql` adds:

- `checkout_fingerprint` to customer orders;
- one durable authenticated cart per customer/market;
- NULL-safe standard cart-item uniqueness;
- RLS for carts/cart items/customer orders/order lines/payments;
- `expire_pending_payment_orders()` worker function.

The expected schema version is now 30 and the web readiness endpoint derives this centrally instead of carrying its former stale hard-coded schema number.

## Pre-production migration-chain repair

Fresh-schema review discovered a pre-existing migration-chain defect: `0006_transactional_inventory.sql` creates `stock_confirmed_at` and `freshness_ttl_seconds`, while `0013_workers_search_freshness.sql` attempted to create the same columns again without `IF NOT EXISTS`.

A fresh PostgreSQL database would therefore fail at migration 13 even though checksum-file verification alone passed.

Because the project has not claimed a live production schema deployment, Build 0.34 repairs migration 0013 by making these repeated column additions idempotent and intentionally updates its repository checksum. The project consistency gate now checks this requirement so the defect cannot silently reappear.

This is explicitly a **pre-production migration-chain correction**, not an assertion that historical migration 0013 remained byte-for-byte immutable.

## Live PostgreSQL CI proof configured

`scripts/db-integration-smoke.ts` now seeds a temporary active vendor/location/approved offer/fresh inventory and is configured to prove:

- two-instance customer session/account state from Build 0.33;
- two-instance public catalog/availability agreement;
- cross-instance durable cart visibility;
- simultaneous same-key checkout idempotency;
- one persisted order per checkout key;
- authenticated cart cleared after committed checkout;
- customer order visibility across runtime instances;
- two-instance contention for the final stock unit without oversell;
- reservation-accounting correctness;
- cross-instance customer cancellation;
- abandoned `pending_payment` expiry cleanup;
- cross-instance login throttling and session revocation.

This local execution environment has no PostgreSQL/PostGIS binaries, so the live assertions are **configured CI/deployment gates and are not claimed as locally executed**.

## Local verification on the exact 0.34 source

Before packaging:

- 209 / 209 Core automated tests passed;
- 30 migration files passed checksum/integrity verification;
- project consistency/security/PostgreSQL gate passed;
- 4 / 4 generated development UI syntax checks passed;
- 6 / 6 structural accessibility checks passed;
- complete dependency-free HTTP marketplace smoke journey passed;
- strict Core TypeScript check passed;
- strict PostgreSQL-runtime TypeScript source check passed using the locally available compiler/type shim;
- 125 production-web TypeScript/TSX files parsed with zero syntax errors;
- 125 production-web files passed relative-import resolution with zero missing imports.

A genuine Node 24 `next build`, real `pg` package/type resolution and live PostgreSQL/PostGIS migration/concurrency execution remain the authoritative CI/deployment gates because the required dependency/database environment is not available locally.

## Remaining production cutover

The next persistence stages are:

1. Vendor sessions, inventory/fulfilment/catalog/advice/media/finance/returns request-time state → PostgreSQL;
2. Admin identity/governance/audit/finance/CMS/operations request-time state → PostgreSQL;
3. real PSP payment authorization/capture/webhooks and reconciliation;
4. S3/media scanner/CDN, production notifications/search workers, courier and ERP/myDATA adapters.
