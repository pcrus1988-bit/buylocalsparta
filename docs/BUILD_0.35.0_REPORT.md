# Buy Local Sparta — Build 0.35.0 Report

## Release purpose

Build 0.35.0 is the staged PostgreSQL **Vendor operational cutover**. It preserves the deterministic in-memory Vendor runtime for development/testing, but production Next.js Vendor requests now select PostgreSQL automatically whenever `DATABASE_URL` is configured.

No new SQL migration is introduced in this release; the existing 30-migration schema already contains the required vendor membership, inventory, fulfilment, catalog, advice, notification, finance, analytics and return records.

## PostgreSQL Vendor authentication/session cutover

Added `PostgresVendorAuthService` and wired the production Vendor session layer to it.

The database path now provides:

- active + email-verified vendor-account enforcement;
- vendor-role and `vendorId` enforcement;
- signed opaque browser session tokens;
- persisted one-way session-token/CSRF proofs through the existing identity repository;
- cross-instance session restoration/touch/revocation;
- PostgreSQL fixed-window Vendor login throttling;
- vendor-scoped database transaction context for subsequent operations.

The ephemeral Vendor adapter remains development/explicit-preview only and still fails closed in normal production without PostgreSQL.

## PostgreSQL Vendor operations

Added `PostgresVendorOperationsService`, used by the production Vendor Backoffice in database mode.

### Dashboard, inventory and fulfilment

- Own approved offers/inventory only.
- Own fulfilments and lines only.
- SERIALIZABLE stock changes.
- Stock cannot be lowered below active customer reservations.
- Every manual stock change appends an inventory movement.
- Vendor acceptance uses the same persisted fulfilment graph created by PostgreSQL customer checkout.
- Pickup/local-delivery preparation remains blocked until the overall order is in a confirmed fulfilment-safe state.
- Carrier shipping delivery remains provider-confirmed; merchants cannot self-mark a carrier parcel delivered.
- PostgreSQL merchant rejection is intentionally fail-closed until rescue-supplier rerouting can release/reassign stock and move the customer order atomically. The deterministic development runtime still exercises the full reject/rescue invariant.

### Catalog

- Vendor product drafts persist in `vendor_product_submissions`.
- Draft submission persists the catalog workflow transition/event.
- Confirmed CSV rows create durable vendor source-product drafts after the existing preview parser validates the file.
- Product Matching/canonical decisions remain platform/Admin authority.

### Trust/compliance

- Vendor-owned canonical products/media metadata/compliance records are database projections.
- Compliance evidence metadata is persisted as `pending` for platform verification.
- Binary media upload is explicitly rejected in production database mode until S3-compatible storage and malware scanning are connected; no binary is silently accepted into process-local memory.

### Advice and notifications

- Vendor conversations/messages are scoped to the authenticated vendor.
- Appointments are vendor-scoped.
- Assigned Ask Local/counteroffer requests and private offers are vendor-scoped projections.
- Vendor in-app notification state is read from PostgreSQL.

### Finance

- Vendor finance reads persisted procurements and settlement batches.
- Vendor invoice submission is limited to that vendor's procurement.
- Platform payable approval, settlement approval and payout remain outside Vendor authority.

### Analytics and returns

- Vendor analytics reads only `analytics_vendor_daily` for the authenticated vendor.
- Assigned return/replacement/repair projections are tenant-scoped.
- Vendor replacement/repair operational actions retain vendor ownership predicates/RLS.

## Database-path inconsistencies found and fixed

The cutover review found issues that the in-memory runtime could not expose:

1. **Fulfilment delivery-price projection:** the initial Vendor SQL used a nonexistent legacy `delivery_pricing_snapshot`. The real schema stores `delivery_charge_minor` on `fulfilment_orders`; the projection now reads that authoritative field.
2. **Finance payout projection:** `procurements` does not contain a `payout_reference`. Vendor finance now derives the reference from the related `settlement_lines` / `settlement_batches` graph.
3. **Live DB smoke notification repository:** the integration smoke called `saveNotification` on the identity repository even though that write adapter belongs to the trust repository. The smoke now calls the correct persistence adapter.
4. **Stricter NodeNext compile narrowing:** the semantic DB-smoke typecheck exposed two Core narrowing issues in category governance and operational health handling. Both were corrected without changing behavior.

## Cross-instance database proof configured

`scripts/db-integration-smoke.ts` now extends the existing two-runtime customer commerce proof with Vendor assertions:

- Vendor login on runtime A restores on runtime B;
- CSRF is valid after cross-instance restoration;
- stock updated by runtime A is visible through runtime B;
- catalog draft created on runtime A is visible/submittable through runtime B and visible back on A;
- fulfilment accepted on runtime B is visible on runtime A;
- a forged other-vendor scope cannot mutate the real vendor's stock;
- Vendor logout/revocation propagates across runtimes.

The customer proofs from Build 0.34 remain: persistent cart visibility, checkout-key idempotency, last-unit contention/oversell protection, cross-instance customer order visibility/cancellation, pending-payment expiry cleanup and shared login throttling.

This live PostgreSQL/PostGIS script is configured in production CI but **was not executable locally** because this environment does not provide a PostgreSQL server.

## New release/CI guard

Added `npm run typecheck:db-smoke` and wired it into:

- `check:release`;
- `.github/workflows/production-ci.yml`;
- project consistency verification.

This semantically compiles the live database smoke under NodeNext so bad repository calls and stricter type errors cannot survive merely because dependency-free runtime tests do not execute PostgreSQL.

The consistency gate also now enforces:

- Vendor PostgreSQL auth/session/rate-limit cutover markers;
- explicit vendor inventory/fulfilment/catalog/advice/finance/returns ownership boundaries;
- production media fail-closed behavior;
- absence of the invalid legacy fulfilment delivery snapshot field;
- PostgreSQL rejection/rescue fail-closed boundary;
- cross-instance Vendor DB smoke proof markers;
- correct notification persistence adapter in the live DB smoke.

## Verification performed locally

The exact 0.35 source was verified with the available local toolchain:

- 209 / 209 Core tests passing;
- 30 / 30 migration checksum/integrity checks passing;
- project consistency/security/PostgreSQL gate passing;
- 4 / 4 generated development UI syntax checks passing;
- 6 / 6 structural accessibility checks passing;
- complete dependency-free HTTP marketplace smoke journey passing;
- strict Core TypeScript check passing;
- strict PostgreSQL-runtime TypeScript check passing;
- semantic `typecheck:db-smoke` passing;
- 131 production-web/PostgreSQL-runtime TS/TSX files syntax-transpiled with zero errors;
- 131 production-web/PostgreSQL-runtime files checked for relative imports with zero missing targets.

## Validation not claimed locally

Two production proofs remain external CI/deployment gates:

1. **Live PostgreSQL 18/PostGIS execution** of migrations, readiness, RLS/cross-instance integration smoke and concurrency assertions.
2. **Real Node 24 `next build`**, because this execution environment cannot freshly install the full Next/React/pg dependency tree.

The repository's production CI workflow is configured to run both.

## Production boundary after Build 0.35

### PostgreSQL-backed when `DATABASE_URL` is configured

- customer identity/session/login throttling;
- customer personalization/saved items/searches/notifications/privacy;
- public catalog and fair supplier assignment;
- authenticated customer cart;
- atomic customer checkout/reservations/order history/cancellation;
- Vendor identity/session/login throttling;
- Vendor inventory and persisted fulfilment projections/actions that are safe at this stage;
- Vendor catalog draft/submission;
- Vendor compliance metadata;
- Vendor advice/appointments/notification projections;
- Vendor finance/invoice projections;
- Vendor analytics;
- assigned Vendor replacement/repair operations.

### Still intentionally gated / next cutover

- Admin/governance request-time state;
- atomic PostgreSQL vendor rejection + rescue-supplier rerouting;
- production binary media storage/scanning/CDN;
- PSP payment capture and provider callbacks;
- ERP/myDATA/digital movement adapter;
- real courier/provider integrations;
- provider-backed outbound notifications/search indexing where still pending.

## Recommended next step

Cut over the **Admin/governance runtime** to PostgreSQL next, sharing the same catalog/trust/finance/returns state now used by customers and Vendors. The Admin cutover should add live two-instance/RBAC/maker-checker proofs and should not weaken the platform-only approval boundaries already enforced by the domain model.
