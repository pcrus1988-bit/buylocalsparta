# Buy Local Sparta — Build 0.36.0 Report

## Release purpose

Build 0.36.0 completes the staged PostgreSQL application-service cutover for the **Admin/governance layer**. Builds 0.33–0.35 progressively moved customer identity/account state, customer commerce/orders and Vendor operational state onto shared PostgreSQL services. Build 0.36 brings the production Admin workspace onto the same durable catalog, trust, finance, returns, fairness, privacy, CMS and operational state whenever `DATABASE_URL` is configured.

Development and deterministic domain tests continue to use the existing in-memory adapters. Production database mode no longer requires per-process Admin governance state.

## PostgreSQL Admin authentication

A dedicated `PostgresAdminAuthService` now provides platform-staff authentication/session handling in database mode.

The service:

- accepts only platform-role principals;
- persists opaque session and CSRF proofs rather than browser secrets;
- restores the same Admin session on another application instance;
- rejects persisted-CSRF mismatch and revoked sessions;
- uses the shared PostgreSQL fixed-window login throttle;
- executes platform operations with `platformAccess` scope rather than Vendor scope.

The production Next.js Admin session remains separate from customer and Vendor sessions. Admin cookies remain HttpOnly and SameSite=Strict, and every mutation route keeps server-side CSRF plus canonical permission checks.

## Durable Admin operations

`PostgresAdminOperationsService` provides database-backed platform operations for:

- vendor application/KYB state transitions and activation;
- Product Matching and new canonical creation;
- supplier-offer approval;
- media scan/review metadata and compliance verification decisions;
- procurement/payable approval;
- settlement creation, submission, checker approval and payout-reference recording;
- fairness appeal governance;
- platform market analytics;
- operational/security/audit projections.

Settlement maker/checker separation is retained. The settlement creator cannot approve the same batch.

## Durable expanded governance

`PostgresAdminGovernanceService` provides database-backed operations for:

- customer order/platform cancellation governance;
- return/RMA/receipt/inspection/remedy decisions;
- verified-review moderation and Vendor report resolution;
- customer privacy-request processing;
- category policy governance;
- CMS page creation/publication/archive/restore;
- product recall opening, affected-customer linkage, safety notifications, resolution and explicit restore;
- maintenance/retention jobs;
- market analytics and audit visibility.

Opening a recall sets the governed canonical product to suppressed/recalled state before it can remain publicly eligible. Affected fulfilled customers are persisted in `recall_affected_orders` and safety notifications are queued. Closing a recall does not silently republish the product while another blocking notice remains.

## Money-movement safety boundary

The PostgreSQL return workflow may persist platform remedy approval, but **real customer refund execution is intentionally fail-closed** until the approved PSP refund adapter exists. Build 0.36 does not mark money as refunded merely because an Admin approved the remedy.

This preserves the seller-of-record finance boundary rather than simulating provider money movement.

## Additional inconsistencies found and corrected

The Admin cutover and stricter semantic validation uncovered several issues that the deterministic runtime suite could not expose:

1. **Wrong notification repository** — the customer PostgreSQL state adapter attempted to write notifications through the identity repository. It now uses the notification/trust persistence adapter that actually owns `saveNotification`.
2. **Optional Vendor category code passed into required fields** — two Vendor catalog projections could pass `undefined` where the catalog contract requires a category. They now use a deterministic `uncategorized` fallback for legacy/demo variants without a category.
3. **Readonly Admin preview sorting** — two preview governance projections attempted to sort Core readonly arrays in place. They now sort copied arrays, keeping Core immutability intact and avoiding a production TypeScript build error.
4. **RBAC permission-name drift** — early Admin PostgreSQL wrappers used permission names that do not exist in the canonical Core permission model. The wrappers now use the actual `finance.write` and `fairness.manage` boundaries.
5. **Reservation-expiry maintenance count** — Admin maintenance used `count(*) FROM expire_stock_reservations(...)`, which counts the scalar function row rather than the integer returned by the function. It now selects the function result directly.
6. **Authentication-retention schema drift** — maintenance referenced `window_start` and attempted `RETURNING id`, but the durable table uses `window_started_at` with `(route,key_hash)` as its key. The query now matches the actual migration schema and no longer silently catches these mistakes.

The project consistency gate now protects these boundaries so the same drift fails future builds.

## Cross-instance PostgreSQL proof configured in CI

`scripts/db-integration-smoke.ts` now includes representative Admin operations using two independent PostgreSQL application runtimes. The configured proof covers:

- Admin login on one runtime and session restoration on another;
- persisted CSRF validation and cross-instance logout/revocation;
- category-policy mutation visible from the second runtime;
- CMS draft/publication state shared across runtimes;
- recall suppression from one runtime, visibility from the second, and explicit resolve/restore;
- settlement creation by a maker;
- maker self-approval rejection;
- approval by a separate platform-finance checker;
- cross-instance finance state visibility;
- audit visibility from the second runtime.

The existing live database proof also retains the customer persistent-cart/checkout/idempotency/last-unit contention tests and the Vendor session/inventory/catalog/fulfilment/tenant-isolation tests.

The database smoke script has its own semantic TypeScript gate (`npm run typecheck:db-smoke`).

## Production boundary after Build 0.36

With `DATABASE_URL` configured, production request-time state now uses PostgreSQL for the three major application surfaces:

- **Customer:** identity/session, account/personalization/notifications/privacy, public catalog, authenticated cart, checkout and customer orders.
- **Vendor:** identity/session, inventory, fulfilments, product submissions, compliance metadata, advice/appointments/notifications, finance/invoice projections, analytics and assigned return operations.
- **Admin:** identity/session, vendor/catalog/trust governance, finance maker/checker, fairness, orders/returns, reviews, privacy, category policy, CMS, recalls, analytics, maintenance and audit/operations.

The in-memory implementations remain development/explicit-preview adapters and retain their production fail-closed gates.

## Deliberately remaining production gates

Build 0.36 does not pretend external infrastructure exists where it does not:

- Vendor binary media remains blocked in database mode until S3-compatible storage, malware scanning/image processing and CDN delivery are connected.
- PostgreSQL Vendor rejection remains blocked until rescue-supplier release/reassignment and customer-order movement can happen atomically.
- Real customer payment/refund execution remains gated on the approved PSP adapter and legal/accounting activation.
- ERP/myDATA/digital-movement, courier, production notifications/messaging, search-provider and calendar/video integrations remain external adapters.
- A live backup/restore drill, penetration review, human accessibility audit and launch observability remain launch evidence requirements.

## Validation performed on the release source

The exact versioned source was validated locally with the tools available in this environment:

- `npm run check:consistency` — passed.
- `npm run db:verify` — **30/30** migration checks passed.
- `npm run test:core` — **209/209** Core tests passed.
- `npm run smoke:ui` — **4/4** generated development UI syntax checks passed.
- `npm run test:a11y` — **6/6** structural accessibility checks passed.
- `npm run smoke:runtime` — complete HTTP marketplace critical journey passed.
- `npm run typecheck:core` — passed.
- `npm run typecheck:postgres-runtime` — passed.
- `npm run typecheck:db-smoke` — passed.
- targeted strict semantic compilation of the database-aware Admin web runtime — passed.
- production web + PostgreSQL runtime source scan — **136 TypeScript/TSX files**, zero parse errors and zero missing relative imports.

No new SQL migration was required for this release; the existing 30-migration schema already contained the platform/governance persistence required by the cutover. No immutable migration was modified in Build 0.36.

## Validation not claimed locally

This execution environment does not provide a PostgreSQL server/`psql`, so the configured live PostgreSQL/PostGIS multi-instance integration test was **not executed locally**.

The environment also cannot freshly install the complete Next/React/pg dependency tree, so a genuine Node 24 `next build` was **not executed locally**. Both remain configured CI/deployment gates and should be retained as required evidence rather than inferred from source checks.

## Recommended next phase

The next phase should focus on completing the remaining deliberately gated production adapters rather than adding another broad UI layer:

1. Execute and retain the fresh PostgreSQL/PostGIS + Node 24 CI evidence for the full customer/Vendor/Admin cross-instance suite.
2. Implement atomic PostgreSQL Vendor rejection/rescue routing.
3. Connect S3-compatible media storage, malware scanning/image processing and CDN delivery.
4. Connect the approved PSP adapter for authorization/capture/refunds and settlement reconciliation.
5. Connect ERP/myDATA/digital-movement and courier/provider adapters.
6. Deploy durable workers/search/notification-provider integrations with operational alerting and backup/restore evidence.
