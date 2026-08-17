# Buy Local Sparta — Project Status

**Build started:** 14 August 2026
**Current development build:** 0.44.0
**Continuity source:** this Git repository. Future work must inspect and preserve it before modification.


## Build 0.44.0 storefront category merchandising

- [x] Replaced generic homepage category anchors with six dedicated Greek-first category routes under `/category/[slug]`.
- [x] Added a shared storefront taxonomy that maps real catalog codes (including `home-lighting`, `technology`, `stationery`, `toys`, `cosmetics` and `footwear`) into customer-facing discovery categories.
- [x] Added server-side category filtering to `/shop` and `/api/catalog`; PostgreSQL filtering is applied before public fairness assignment and hidden supplier offers remain undisclosed.
- [x] Added category-aware product artwork and reused one canonical card component across homepage, shop, category and vendor storefronts.
- [x] Product detail pages now inherit the category visual system and link back to their category landing page.
- [x] Saved searches retain category intent and current-match calculation respects the same taxonomy mapping.
- [x] Added `npm run check:storefront` regression coverage for taxonomy mapping, category route filtering and fairness-routing invariants.
- [ ] Replace generated/category visual treatments with approved merchant/product photography as real media is onboarded; the media governance pipeline remains authoritative.

**Production boundary (Build 0.44.0):** this release improves public discovery and visual merchandising without changing seller-of-record, hidden-offer, pricing or vendor-assignment rules. Category pages consume the same canonical public projection as search.

## Build 0.43.0 deployment topology / Vercel hardening

- [x] Canonical Vercel project configuration moved into root `vercel.json`: repository-root install, workspace-targeted Next.js build and `apps/web/.next` output.
- [x] Root package now declares the npm package manager and the web build verifies that private monorepo workspaces are visible before `next build`.
- [x] Next.js `outputFileTracingRoot` points at the repository root so server traces can include private workspace files outside `apps/web`.
- [x] Added a shared Node 24 production worker image with fail-closed `postgres`, `search`, `notifications` and `media` roles.
- [x] Production CI now typechecks all long-running worker entrypoints and builds the worker container in addition to the Next.js application.
- [x] Separated web-critical media readiness from worker-only ClamAV reachability: Vercel checks PostgreSQL/object storage while the media worker and staging preflight prove ClamAV.
- [x] Added deployment topology/environment-matrix documentation and an automated `check:deployment` gate.
- [ ] Generate and commit a root npm lockfile from a network-enabled Node 24 environment before production promotion; this local environment cannot reach the npm registry.
- [ ] Execute the real Vercel Node 24 build and worker-container build in CI/staging and retain activation evidence.

**Production boundary (Build 0.43.0):** Vercel hosts request/response Next.js compute only. Durable polling/reconciliation/media loops are separate long-running worker processes. Database-less stateless demo sessions remain preview-only.

## Build 0.42.1 Vercel hotfix forward-port

- [x] Forward-ported all seven Build 0.37 Vercel hotfix patches onto the Build 0.42 architecture without reverting newer PostgreSQL/Viva/media/search/email/BOX NOW/staging work.
- [x] Database-less production previews can use HMAC-signed stateless demo sessions for customer, Vendor and Admin when every explicit preview/demo gate is enabled; PostgreSQL remains authoritative whenever `DATABASE_URL` is configured.
- [x] Catalog API now awaits the asynchronous production catalog projection before mapping results.
- [x] Memory Admin fairness projection is normalized to the supplier-array shape consumed by the Next.js fairness page.
- [x] Admin order/return PostgreSQL projection and wrapper now retain a concrete return shape for strict TypeScript/Vercel builds.
- [x] Vendor trust projection now returns `createdAt` and linked compliance media IDs, and the UI tolerates unassigned media.
- [x] Vendor catalog client uses valid `ReadonlyArray<T>` syntax; Next.js TypeScript enables `allowImportingTsExtensions`.
- [x] Added `npm run test:preview-auth` and consistency regression guards for all forward-ported hotfix boundaries.

**Production boundary (Build 0.42.1):** stateless preview auth is intentionally demo/preview-only. It requires production mode with no `DATABASE_URL`, `BLS_ALLOW_DATABASELESS_PREVIEW=true`, `BLS_ENABLE_DEMO_ACCOUNTS=true`, the relevant `BLS_ALLOW_EPHEMERAL_*` flag, and a shared `BLS_AUTH_SECRET`. Real production continues to require PostgreSQL-backed identity/session persistence.

## Build 0.42.0 staging activation + retained provider evidence

- [x] Added append-only `provider_activation_evidence` persistence in migration `0037_activation_evidence.sql`; rows are platform-only under RLS and store redacted metadata plus an evidence SHA-256 digest rather than provider credentials/raw payloads.
- [x] Added `npm run stage:preflight` for read-only PostgreSQL, Viva, AADE myDATA, Meilisearch, Resend-domain, S3, ClamAV, BOX NOW and deployed-web readiness checks.
- [x] Staging-labelled preflight refuses Viva live, BOX NOW production and AADE production credentials to reduce accidental live-provider use during verification.
- [x] Preflight requires the operational configuration the full flow needs (Meilisearch indexing key, Resend webhook/suppression config, HTTPS media upload origin and BOX NOW customer widget identity), not merely provider API authentication.
- [x] Added `npm run stage:evidence` for controlled scenario evidence. External provider/CI references are hashed before persistence; scenario notes are bounded/redacted.
- [x] Added Admin `/admin/activation` evidence view with current-build/freshness visibility.
- [x] Added manual GitHub `staging-activation.yml` and `staging-scenario-evidence.yml` workflows; manual inputs are quoted and staging secrets use GitHub environment secrets/variables.
- [x] Added cross-instance PostgreSQL smoke proof for activation evidence visibility.
- [x] Added read-only Viva credential readiness and Resend verified-sending-domain readiness provider checks.

**Production boundary (Build 0.42):** the system can now retain evidence, but the repository still does not claim that external providers have been verified. Real staging credentials and controlled scenario runs must be executed; AADE issuance remains accountant-mapping gated and live money/shipping remain legal/provider activation gates.

## Build 0.41.0 BOX NOW production courier bridge

- [x] Added a dedicated BOX NOW Partner API adapter with OAuth2 client-credentials token caching, origin/destination lookup, prepaid delivery request creation, PDF labels, parcel cancellation and order-number reconciliation.
- [x] Customer shipping checkout stores the selected BOX NOW locker and recipient contact snapshot; the browser uses the BOX NOW locker widget only when explicitly enabled.
- [x] Admin maps each Vendor location to an approved BOX NOW origin/warehouse ID; Vendor shipment operations remain tenant-scoped and CSRF protected.
- [x] Shipment creation uses the fulfilment public ID as a stable provider order number. `creating`/`manual_review` outcomes are reconciled before any repeat creation, preventing blind duplicate parcels.
- [x] BOX NOW webhooks verify HMAC-SHA256 against the exact raw `data` JSON, persist/dedupe provider event IDs and reject stale/out-of-order transitions using `data.time`.
- [x] Carrier events drive shipped/in-transit/delivered/exception/return state and customer-visible order timeline entries; Vendors cannot self-confirm carrier delivery.
- [x] Added migration `0036_boxnow_shipping_bridge.sql` for origin mappings and durable provider-attempt/shipment metadata.
- [x] Production readiness and CI/typecheck contracts include BOX NOW when enabled.

**Production boundary (Build 0.41):** the integration is code-complete against the documented Partner API contract but no real BOX NOW credentials/network delivery have been exercised in this environment. Staging credentials, origin mappings, webhook registration/secret and retained end-to-end parcel evidence remain activation gates.

## Build 0.40.0 production search + transactional email delivery

- [x] Added `@buy-local-sparta/meilisearch-search` with query/index settings, async task reconciliation, filters/sorts and separate search/admin API keys.
- [x] Added PostgreSQL-backed canonical search projection with durable document hashes/status in `search_index_state`; hidden supplier offers never enter the external index.
- [x] Production `/shop` queries Meilisearch for non-empty searches, then performs Fair Vendor Exposure only for the returned canonical products that are rendered.
- [x] Added search configure/reconcile worker and customer autocomplete endpoint.
- [x] Added `@buy-local-sparta/resend-notifications` with per-notification idempotent sends and signed raw-body Svix webhook verification.
- [x] Notification delivery worker claims only channels with configured providers and isolates recipient-resolution failures per notification.
- [x] Added privacy-minimised provider-event and destination-suppression persistence in migration `0035_search_email_providers.sql`.
- [x] Viva capture/refund orchestration can enqueue required customer in-app + email notifications when external email delivery is enabled.
- [x] Live PostgreSQL smoke is extended with fake Meilisearch + Resend transports to prove cross-instance canonical search projection, durable delivery, provider-message persistence and webhook deduplication without external network traffic.

**Production boundary (Build 0.40):** adapters and worker paths are implemented, but live Meilisearch cluster/index evidence and Resend verified sender/domain/webhook evidence remain staging/deployment gates. SMS/push remain provider-neutral and are not silently routed through the email adapter.

## Build 0.39.0 AADE myDATA ERP transport preparation

- [x] Dedicated `@buy-local-sparta/aade-mydata` package with ERP authentication headers, SendInvoices, income/expense classification transport, CancelInvoice and RequestDocs/RequestTransmittedDocs retrieval.
- [x] Migration `0034_aade_mydata_erp_bridge.sql` adds durable AADE MARK/UID/QR/mapping/transmission state and non-blind transmission attempts.
- [x] PostgreSQL myDATA service blocks automatic retries after uncertain network outcomes and requires exact accountant-approved mapping version before issuance.
- [x] Production readiness includes myDATA only when issuance is explicitly enabled; credentials alone do not activate issuance.
- [x] Admin `/admin/tax` workspace shows transport configuration and persisted document status; transmission is CSRF/RBAC protected.
- [x] Read-only `npm run mydata:check` connectivity command prepared for AADE credential validation.
- [x] Courier/provider selection runbook added; existing shipment domain remains provider-neutral until a real carrier contract/API is selected.

**Production boundary (Build 0.39):** the transport connection is prepared, but BLS does not yet automatically generate tax XML. Document types, classifications, VAT/delivery treatment, credit-note mapping and Digital Goods Movement responsibilities require Greek accountant/legal approval before enabling issuance.

## Build 0.38.0 atomic rescue + private media pipeline

- [x] PostgreSQL Vendor rejection now uses a serializable rescue transaction: reject old fulfilment, release its reservation/sticky assignment, rerun fair eligible-supplier selection excluding the rejecting supplier, reserve replacement stock, rewrite the order line, create a traceable replacement fulfilment and preserve the customer delivery charge exactly once.
- [x] A no-rescue outcome moves the order to `requires_customer_action` instead of silently stranding or overselling it; rejection replay is idempotent.
- [x] Paid-order reservations are protected both in scheduled expiry and inside `reserve_stock()` itself, so a later checkout cannot reclaim paid stock.
- [x] Production Vendor media supports private S3-compatible presigned PUT intents, server-side HEAD verification and PostgreSQL upload-intent persistence.
- [x] Separate `worker:media` streams private objects through ClamAV `INSTREAM`, computes authoritative SHA-256, verifies stored size, deletes malware objects and uses bounded leased retries for scanner failures.
- [x] Production Admin can no longer manually mark media malware-clean; automated scan state remains independent from rights/moderation approval.
- [x] Media readiness, CSP upload-origin allowlisting, environment/runbook guidance and cross-instance PostgreSQL media-state smoke proof are prepared.

**Production boundary (Build 0.38):** atomic rescue and the media pipeline are implemented, but live evidence still requires the configured PostgreSQL CI plus a real private S3-compatible bucket and private ClamAV service. Viva also still requires approved merchant/demo/live credentials before real-money activation.

## Build 0.37.0 Viva.com Smart Checkout payment-provider preparation

- [x] Added dedicated `@buy-local-sparta/viva-payments` provider package with demo/live host selection, OAuth2 token caching, Smart Checkout order creation, Retrieve Transaction verification, refunds, payment-order cancellation and webhook verification-key retrieval.
- [x] Production PostgreSQL checkout now fails closed unless Viva is configured; successful internal checkout creates/reuses a Viva payment order and returns the hosted Smart Checkout redirect.
- [x] Added durable provider order-code, provider transaction, verification/correlation and provider payload fields plus refund reconciliation metadata in migration `0031_viva_payments.sql`.
- [x] Added two-phase provider-order creation attempts so uncertain external outcomes are never blindly retried; stale `creating` attempts are moved to manual reconciliation.
- [x] Preserved 16-digit Viva order codes as strings before JSON parsing to prevent JavaScript safe-integer rounding.
- [x] Success/failure return pages verify transaction state via Viva Retrieve Transaction instead of trusting browser redirects.
- [x] Viva webhook endpoint implements verification-key handshake and handles 1796 payment success, 1798 failed/non-final payment and 1797 reversal/refund events with authoritative API reconciliation.
- [x] Webhook/payment transitions are monotonic: delayed or duplicate provider events cannot regress captured/refunded/chargeback state.
- [x] Paid customer stock reservations are excluded from generic expiry and consumed by Vendor acceptance only after the order is payment-confirmed.
- [x] Customer/Admin cancellation orchestrates Viva payment-order cancellation or captured refund before internal order cancellation; consumed stock is restored idempotently when cancellation is still allowed.
- [x] Cancellation/capture race is self-healing: a late successful Viva capture on an already-cancelled order triggers one stable full-refund attempt; unknown outcomes move to manual reconciliation without webhook retry loops.
- [x] Approved return refunds route through the Viva refund orchestration service; direct database return-refund mutation stays fail-closed.
- [x] Ambiguous refund outcomes become `manual_review` and cannot auto-retry; reversal transaction IDs dedupe synchronous refund success against later 1797 webhooks.
- [x] Admin operational health degrades when Viva payment/refund items require manual reconciliation.
- [x] Live PostgreSQL CI smoke is extended with a deterministic fake Viva gateway proving cross-instance payment-order reuse, capture, paid-stock protection, Vendor reservation consumption, refund/cancellation restoration, reversal dedupe, out-of-order event monotonicity and automatic exactly-once refund of a late capture after cancellation.
- [x] Added `docs/VIVA_PAYMENTS.md` with credential/source/webhook configuration and go-live checklist.
- [ ] Viva demo-account end-to-end network test requires actual merchant demo credentials and portal configuration.
- [ ] Live Viva activation requires merchant underwriting/KYB plus seller-of-record/legal/accounting/AADE confirmation.
- [ ] Genuine Node 24 `next build` and live PostgreSQL/PostGIS execution remain CI/deployment evidence gates in this local environment.

**Current production boundary (Build 0.37):** the payment adapter and durable orchestration are implemented, but real money remains disabled until deployment receives approved Viva credentials/configuration. Vendor payouts continue through the platform's separate supplier-payable maker/checker process.

## Build 0.36.0 PostgreSQL Admin/governance cutover

- [x] Production Admin authentication/session restoration now selects PostgreSQL automatically whenever `DATABASE_URL` is configured; the ephemeral Admin adapter remains development/explicit-preview only.
- [x] Added `PostgresAdminAuthService` for platform-role sessions with persisted CSRF proof, cross-instance restoration/revocation and shared PostgreSQL login throttling.
- [x] Added `PostgresAdminOperationsService` for durable vendor onboarding, Product Matching/canonical approval, trust/compliance, finance maker/checker settlement, fairness, analytics, operations and audit projections under platform RLS scope.
- [x] Added `PostgresAdminGovernanceService` for durable orders/returns decisions, review moderation, privacy processing, category policy, CMS lifecycle, recalls and maintenance operations.
- [x] Production Admin web routes dispatch to the PostgreSQL services in database mode while retaining separate platform authentication, explicit permission checks and CSRF on every mutation.
- [x] PostgreSQL recall opens suppress/recalled state on the governed canonical record, identify affected fulfilled customers, persist recall links and queue safety notifications; explicit resolve/restore is required before public re-entry.
- [x] Finance settlement retains maker/checker separation and cross-instance payout state; a settlement maker cannot approve the same batch.
- [x] Real customer refund execution remains fail-closed in PostgreSQL mode until the approved PSP refund adapter exists; remedy approval is not falsely represented as money movement.
- [x] Fixed stricter-build/database defects uncovered during cutover: notification writes now use the notification/trust repository, Vendor optional category codes are normalized, reservation-expiry maintenance reads the function's returned count, and auth-throttle retention uses `window_started_at` with a real returned column.
- [x] Live PostgreSQL smoke is configured to prove cross-instance Admin session, category governance, CMS publication, recall suppression/restore, settlement maker/checker and audit visibility in addition to existing customer/Vendor proofs.
- [x] Project consistency gate now protects the durable Admin service boundary, DB-smoke proof markers, refund fail-closed rule and corrected maintenance/customer-notification schema usage.
- [ ] Live PostgreSQL/PostGIS execution remains a CI/deployment proof because this local environment has no database server.
- [ ] Genuine Node 24 `next build` remains a CI/deployment gate because this local environment cannot install the complete Next/React/pg dependency tree.

**Current production boundary (Build 0.36):** with `DATABASE_URL`, customer identity/account + public catalog/cart/checkout/orders, Vendor operational state, and Admin/governance state all use shared PostgreSQL services. Remaining launch work is primarily external/provider integration and a few deliberately gated atomic workflows rather than another top-level persistence cutover.

## Build 0.35.0 PostgreSQL Vendor operational cutover

- [x] Production Vendor authentication/session restoration now selects PostgreSQL automatically whenever `DATABASE_URL` is configured; the ephemeral Vendor adapter remains development/explicit-preview only.
- [x] Added `PostgresVendorAuthService` with active/verified vendor-role enforcement, signed opaque browser tokens, persisted session/CSRF hashes, cross-instance restoration/revocation and shared PostgreSQL login throttling.
- [x] Added `PostgresVendorOperationsService` for vendor-scoped dashboard/inventory, fulfilments, product draft/submission, compliance metadata, advice/appointments/notifications, finance/invoice projections, analytics and assigned replacement/repair operations.
- [x] Inventory updates execute under SERIALIZABLE vendor scope, reject on-hand quantities below active reservations and append an auditable inventory movement.
- [x] Vendor fulfilment reads/actions use the same PostgreSQL order/fulfilment graph created by customer checkout; merchants still cannot self-confirm carrier shipping delivery.
- [x] Vendor product creation/submission and confirmed CSV rows now create durable vendor-product submission records instead of process-local catalog state. Platform canonical-match approval remains Admin-governed.
- [x] Compliance evidence metadata persists as pending platform review. Production binary media upload remains fail-closed until S3-compatible storage + malware scanning is available.
- [x] Advice conversations/messages, appointments, assigned Ask Local requests/private offers and in-app notifications are vendor-scoped PostgreSQL projections.
- [x] Finance reads persisted procurements/settlements and permits vendor invoice submission only for its own procurement; platform payable/settlement/payout approval remains outside Vendor authority.
- [x] Assigned replacement/repair operations use persisted return records and vendor RLS.
- [x] Fixed two live-schema projection defects found during cutover: use `fulfilment_orders.delivery_charge_minor` rather than nonexistent `delivery_pricing_snapshot`, and derive procurement payout references from settlement lines/batches rather than a nonexistent procurement column.
- [x] PostgreSQL Vendor rejection is intentionally fail-closed until rescue routing can atomically release/reassign stock and update the customer order; unsafe partial rejection is not exposed in DB mode.
- [x] Live DB smoke is extended to prove cross-instance Vendor session, inventory, catalog submission and fulfilment visibility plus explicit tenant-isolation denial across two runtime instances.
- [x] Added a dedicated `typecheck:db-smoke` release/CI gate; fixed a hidden wrong-repository notification write plus two Core narrowing issues exposed only by the stricter NodeNext compilation path.
- [ ] Live PostgreSQL/PostGIS execution remains an external CI/deployment proof because this local environment does not provide PostgreSQL binaries.
- [ ] Admin/governance request-time state remains the next PostgreSQL application-service cutover.

**Production boundary (Build 0.35):** customer identity/account/catalog/cart/checkout/order state and Vendor identity/operational projections are PostgreSQL-backed when `DATABASE_URL` is configured. Vendor media binaries and rejection/rescue stay gated until their durable atomic dependencies are available. Admin request-time state is still fail-closed preview state.


## Build 0.34.0 PostgreSQL customer commerce + public catalog cutover

- [x] Public Next.js catalog/product/vendor projections now switch to PostgreSQL whenever `DATABASE_URL` is configured; production catalog visibility, fresh stock and supplier eligibility no longer come from the demo runtime in database mode.
- [x] Added `PostgresCustomerCommerceService` for public catalog reads, persistent Fair Vendor assignment, authenticated carts, checkout, customer order history/detail and pre-handover cancellation.
- [x] Checkout runs under SERIALIZABLE isolation and uses database row-lock reservation functions; fairness state, reservations, order lines, private fulfilments and payment intent persist atomically or roll back together.
- [x] Checkout idempotency stores a canonical request fingerprint bound to the trusted visitor hash; same-key retries across instances return one order while changed payload/visitor reuse is rejected.
- [x] Authenticated carts persist under customer/platform RLS and use a NULL-safe partial unique index for ordinary canonical cart items; browser-local guest carts merge into the authenticated cart after login.
- [x] Customer `/account` order history/detail/cancellation now reads/writes PostgreSQL when configured, making order state visible across application instances.
- [x] `pending_payment` fulfilments do not consume merchant capacity before payment authorization; reservation expiry is followed by durable cancellation of abandoned pending-payment orders.
- [x] Production Next.js checkout remains fail-closed before the real PSP adapter unless the explicit `BLS_ALLOW_PRE_PSP_CHECKOUT=true` preview flag is set.
- [x] Added migration `0030_customer_commerce_runtime.sql` for checkout fingerprints, cart/customer-order/payment RLS, durable cart uniqueness and pending-payment expiry cleanup.
- [x] Fresh migration-chain review found and repaired the pre-production `0013` duplicate freshness-column DDL by making the repeated additions idempotent; checksum manifest was intentionally updated before any claimed production schema deployment.
- [x] Live DB smoke is configured to prove cross-instance cart state, same-key checkout idempotency, two-instance last-unit contention, order visibility/cancellation and pending-payment expiry cleanup.
- [ ] Live PostgreSQL/PostGIS execution remains an external CI/deployment proof because this local environment does not provide PostgreSQL binaries.
- [ ] Vendor and Admin request-time state remain the next PostgreSQL application-service cutover stages.

**Production boundary (Build 0.34):** customer identity/session/personalization/notifications/privacy, public catalog reads/fair assignment, authenticated cart and customer checkout/order state are PostgreSQL-backed when `DATABASE_URL` is configured. Vendor/Admin operational state remains on fail-closed preview adapters until its own cutover. Real payment capture remains disabled pending PSP/legal approval.


## Build 0.33.0 customer PostgreSQL application-service cutover

- [x] Production Next.js customer authentication now selects PostgreSQL automatically whenever `DATABASE_URL` is configured; the ephemeral account adapter remains development/explicit-preview only.
- [x] Added `PostgresCustomerAuthService` over `PostgresIdentityRepository`: password verification, signed opaque browser tokens, database session hashes, deterministic CSRF proof, shared session restoration/touch and cross-instance logout/revocation.
- [x] Restored PostgreSQL sessions verify both the signed browser token and the persisted `csrf_hash` before a customer principal is returned.
- [x] Passwordless/database identities without a password hash are ignored by the password-login path instead of producing a mapping exception.
- [x] Added PostgreSQL fixed-window login throttling with one-way hashed correlation keys and migration `0029_customer_account_runtime.sql`; the durable worker deletes stale throttle windows.
- [x] Customer preferences, saved products/alerts, recently viewed products, saved searches, notification-centre read/archive state and privacy requests now use the existing PostgreSQL persistence repositories in the production web path.
- [x] Admin privacy processing reads/actions the same PostgreSQL privacy-request queue used by customers when the database backend is active.
- [x] Added live DB integration smoke that creates two independent runtime instances and proves shared customer session/state, cross-instance revocation and cross-instance login-rate-limit enforcement.
- [x] Added `packages/postgres-runtime/tsconfig.json`, `typecheck:postgres-runtime` and a production-CI typecheck step for the PostgreSQL runtime.
- [x] Production login messaging now recognizes `DATABASE_URL` as the real account backend rather than incorrectly describing the PostgreSQL cutover as pending.
- [ ] Live PostgreSQL execution is still an external CI/deployment proof in this local environment because no PostgreSQL server is available here.
- [ ] Customer commerce/orders remain on the deterministic production-web commerce adapter; Vendor and Admin request-time state also remain pending PostgreSQL cutover.
- [ ] Production customer self-registration/email delivery is not yet activated; this build authenticates existing verified PostgreSQL customer accounts without faking an email provider.


## Build 0.32.0 PostgreSQL production-runtime foundation and Core type hardening

- [x] Added `@buy-local-sparta/postgres-runtime`, backed by a real `pg.Pool`, adapting pool/client transactions to the existing Core SQL contracts and constructing the unified `PostgresPersistenceBundle`.
- [x] Added database readiness that verifies PostgreSQL 18, `postgis`, `pgcrypto`, `citext` and exact applied migration version before the service is considered ready.
- [x] Added production Next.js `GET /api/health/ready`; in real production a missing/unready database returns HTTP 503. A separate `BLS_ALLOW_DATABASELESS_PREVIEW=true` override exists only for explicit preview deployments.
- [x] Added `npm run db:ready`, `npm run db:smoke`, `npm run check:postgres` and a transaction/RLS-aware integration-smoke script for deployment environments with `DATABASE_URL`.
- [x] Added `workers/postgres-worker.ts`, using the durable PostgreSQL scheduled-job lease store for reservation expiry plus security/analytics retention. Provider-dependent search/media/notification workers remain separate production integration work.
- [x] Added `compose.postgres.yml` for a PostgreSQL 18/PostGIS development target.
- [x] Added `.github/workflows/production-ci.yml` defining the intended Node 24 + PostgreSQL 18/PostGIS CI path: repository checks, Core typecheck, migrations, DB readiness/smoke and Next.js build.
- [x] Added `packages/core/tsconfig.json` and `npm run typecheck:core`; fixed latent compile-time inconsistencies that the dependency-free Node type-stripping tests could not detect.
- [x] Type fixes preserve behavior while aligning TypeScript with existing runtime/database states (`chargeback`, `bulky_special`), mutable internal finance/pickup state, `DatabaseScope`, media review naming and readonly-array contracts.
- [x] Expanded the project consistency gate to protect PostgreSQL workspace/dependency alignment, schema-version alignment, readiness 503 behavior, worker boundaries, environment documentation and CI requirements.
- [ ] Live PostgreSQL migration/RLS/concurrency smoke was not executable in the current container because no PostgreSQL server/`psql` or installed `pg` dependency is available locally; the CI workflow is configured to perform that proof.
- [ ] Customer/Vendor/Admin request-time state has **not yet been cut over** to PostgreSQL in this build. Their ephemeral adapters continue to fail closed in real production until repository-backed application-service wiring is completed.


## Build 0.31.0 expanded Admin governance and public safety propagation

- [x] Added production Next.js Admin surfaces for `/admin/orders`, `/admin/reviews`, `/admin/privacy`, `/admin/categories`, `/admin/content`, `/admin/recalls`, `/admin/analytics` and `/admin/maintenance`.
- [x] Consolidated order/return operations reuse the same commerce + ReturnService state as customer checkout and Vendor operations; platform cancellation/remedy decisions keep Core handover/refund/custody invariants.
- [x] Verified-review moderation and vendor-report resolution use platform `reviews.manage`; merchants cannot hide customer reviews merely by reporting them.
- [x] Admin privacy processing reads the same customer privacy-request queue used by the account workspace and requires `privacy.manage` for processing/completion.
- [x] Category commerce-policy edits require platform catalog permission and remain separate from Fair Vendor Exposure ranking.
- [x] CMS page creation/publication/archive/restore uses the Core content lifecycle; the current storefront shell remains code-rendered until the public CMS renderer/persistence cutover.
- [x] Recall opening creates a blocking recall notice, suppresses the governed canonical product and identifies affected fulfilled customers through RecallOperationsService.
- [x] Closed a production-web recall/compliance leak: catalog/product detail, account availability/saved searches and checkout now share `canonicalIsPubliclyAllowed`, filtering inactive/suppressed/recalled products before fairness selection and checkout.
- [x] Recall resolution alone does not republish a product; explicit restore is required after all blocking notices are closed.
- [x] Market analytics exposes platform-only 30-day KPIs without feeding Fair Vendor Exposure weights.
- [x] Admin maintenance can exercise the scheduled compliance-expiry, CMS-publication, search-reconciliation, analytics-retention and operational-sync contracts in preview; durable production workers remain a deployment gate.
- [x] Consistency gate now protects the new Admin CSRF/RBAC routes plus recall/compliance propagation into public commerce.
- [x] Direct governance integration proof passed for category policy, CMS publish, shared privacy queue, recall open/resolve/restore, scheduler/search maintenance and Admin projections.
- [x] Focused public-safety proof passed: product visible → recall → catalog/product/account/saved-search suppression → resolve/restore → visible again.




## Build 0.30.0 production-web Admin Command Centre

- [x] Separate authenticated `/admin` Next.js workspace with `/admin/login`, overview, vendors/KYB, Product Matching, trust/compliance, finance, fairness and operations surfaces
- [x] Admin identities use dedicated platform sessions and Core RBAC permissions; customer/vendor identities cannot be reused as staff principals
- [x] Admin login is visitor-rate-limited and issues HttpOnly, SameSite=Strict cookies; every Admin mutation route revalidates the session, permission and CSRF token server-side
- [x] Ephemeral Admin runtime is lazy and fails closed in real production unless `BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME=true` is explicitly enabled for preview; durable production requires PostgreSQL-backed staff identity/audit/governance persistence
- [x] Vendor application/KYB transitions delegate to the Core onboarding state machine and cannot skip required verification/catalog/test-ready gates
- [x] Product Matching Centre can approve/reject submitted matches, approve supplier offers and create a new canonical product from an unmatched vendor source while keeping supplier offers private
- [x] Trust workspace can record scan outcome and perform platform rights/moderation review plus compliance verification/rejection; merchants still cannot self-approve submitted evidence
- [x] Finance workspace uses the existing procurement/payable/settlement services; batch maker self-approval remains blocked, a separate finance checker can approve, and payout reference closes the governed settlement
- [x] Fairness workspace exposes merchant snapshots/appeals and review/resolution without allowing paid plans, price or analytics to alter Fair Vendor Exposure weights
- [x] Operations workspace exposes readiness, privacy-minimised security events and audit history through platform permissions
- [x] Consistency gate now protects Admin HttpOnly/Strict cookie policy, CSRF + permission checks, login rate limiting, production fail-closed state and maker/checker separation
- [x] Fixed pre-existing Vendor adapter TypeScript violations where readonly Core arrays were sorted in place; projections now clone immutable service results before sorting
- [x] Direct Admin runtime proof passed end-to-end: vendor transition → catalog match/offer approval → media/compliance approval → procurement/payable → maker self-approval rejection → checker approval → payout → fairness resolution → health/audit

## Build 0.29.0 expanded production-web Vendor operations

- [x] Private Next.js Vendor workspace now has dedicated `/vendor/catalog`, `/vendor/trust`, `/vendor/advice`, `/vendor/finance`, `/vendor/analytics` and `/vendor/returns` surfaces in addition to the 0.28 orders/stock dashboard
- [x] Vendor catalog supports manual source-product drafts, deterministic matching submission and CSV dry-run/explicit-confirm commit while keeping match/canonical/offer approval platform-only
- [x] Existing live supplier offers are mirrored into the vendor catalog workflow as approved migration records without exposing competitor offers or economics
- [x] Vendor media upload is canonical-product scoped and binds finalization to `principal.vendorId`; uploads stay private/pending until malware scan, rights review and moderation are completed by platform processes
- [x] Vendor compliance evidence can be submitted against owned canonical products and optionally linked to vendor-owned document media; verification/rejection remains platform-only
- [x] Vendor Advice surface projects only own conversations, appointments, Ask Local requests/private offers and in-app notifications; message/appointment actions re-check vendor ownership server-side
- [x] Vendor Finance projects own procurement and settlement lines only; merchants may submit an invoice reference/gross amount, while payable approval, maker/checker settlement and payout references stay outside Vendor APIs
- [x] Vendor Analytics uses the Core vendor aggregate report and exposes no competitor/customer-level/raw marketplace events; analytics remain observational and do not change Fair Vendor Exposure
- [x] Vendor Returns projects only assigned return/replacement/repair work; eligibility, inspection and customer remedy decisions remain platform-owned
- [x] Expanded consistency gate protects every new mutation with CSRF, vendor-bound media finalization, vendor-scoped analytics and an explicit prohibition on platform approval/payout methods in Vendor APIs
- [x] Direct runtime integration proof passed for scoped catalog creation/submission, CSV dry-run/commit, pending media/compliance trust gates and analytics/finance projections
- [x] Full repository regression remains green after the expansion: 209/209 Core tests, 28 immutable migrations, UI/accessibility checks and complete HTTP marketplace smoke workflow

**Production boundary:** these Next.js Vendor modules are production-surface adapters over deterministic preview state. Multi-instance production still requires the prepared PostgreSQL catalog/advice/media/finance/returns persistence adapters, real S3/malware scanning, provider notifications, PSP/ERP/courier integrations and a genuine Node 24 `next build` in CI/deployment.


## Build 0.28.0 authenticated production-web Vendor Backoffice + order detail

- [x] Production Next.js `/vendor/login` and `/vendor` now provide an authenticated merchant workspace over the same Core commerce/inventory singleton used by production-web customer checkout
- [x] Vendor session cookie is HttpOnly/SameSite, login is rate-limited by the trusted proxy-injected visitor identity and every vendor mutation requires the session CSRF token
- [x] Server-side vendor isolation is enforced independently for stock and fulfilment mutations; another merchant's offer/fulfilment IDs are rejected even if submitted manually
- [x] Vendor dashboard exposes only own products, own inventory, own assigned fulfilments and an explicitly non-payable supplier-value snapshot; competitor supplier economics/customer-level marketplace data are not exposed
- [x] Stock updates preserve active customer reservations by rejecting `onHand < activeReservations` and write an inventory movement actor/source through the existing InventoryEngine
- [x] Vendor fulfilment actions support accept/reject plus pickup-ready/local-delivery completion only after the overall order is confirmed; carrier shipping delivery remains provider-confirmed and cannot be self-marked delivered
- [x] Public vendor profile remains separate at `/vendor/[id]`; merchant backoffice is a private exact `/vendor` route and `/join` links existing partners to `/vendor/login`
- [x] Customer account orders now link to authenticated `/account/orders/[id]` detail pages showing line/vendor fulfilment state and authoritative backend totals
- [x] Customer pre-handover cancellation is ownership-scoped + CSRF protected and delegates stock/payment reversal to the existing Core `cancelOrder` invariant; after physical handover the UI correctly defers to return/withdrawal flow
- [x] Project consistency gate now protects vendor HttpOnly sessions, visitor-scoped login limiting, CSRF, production fail-closed vendor runtime, vendor isolation, carrier-delivery boundary and customer order-cancellation CSRF
- [x] Preview-only vendor adapter fails closed in production unless `BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME=true`; durable production remains gated on PostgreSQL identity/vendor persistence

**Production boundary:** the new Next.js Vendor Backoffice is deliberately a production-surface adapter over the deterministic in-memory runtime for executable preview. Multi-instance production must switch sessions/vendor operational state to the prepared PostgreSQL contracts, and shipping handover/delivery must use the real courier adapter rather than adding merchant-side shortcuts.


## Build 0.27.0 authenticated production-web customer account

- [x] Production Next.js `/login` and `/account` now use the existing signed-session Core contract rather than an unauthenticated account shell
- [x] Customer session token is HttpOnly/SameSite and account mutations require the session-specific CSRF token
- [x] Login abuse control is scoped to the trusted opaque browser identity inserted by `proxy.ts`; the browser cannot choose another visitor's limiter key
- [x] Product pages can save/unsave canonical products and record recently viewed history only for authenticated customers
- [x] Shop search can create customer-owned saved searches with a current canonical baseline and alerts enabled
- [x] Account dashboard exposes customer-linked orders, saved products/searches, grouped in-app notifications, recommendations, recent history and privacy preferences
- [x] Recommendation availability and saved-search baselines use the same stock-freshness + offer-eligibility semantics as the storefront instead of raw inventory alone
- [x] Authenticated checkout attaches `customerId`, creates an account notification and requires CSRF; guest checkout remains unchanged
- [x] Privacy UI supports recommendation/recent-history opt controls and creates a governed export request instead of deleting operational/legal records directly
- [x] Account runtime is lazy so `next build` analysis does not require a runtime secret, and ephemeral in-memory sessions fail closed in production by default
- [x] `BLS_AUTH_SECRET`, demo-account opt-in and preview-only ephemeral runtime override are documented in `.env.example`
- [x] Project consistency gate now protects HttpOnly sessions, visitor-scoped login limiting, CSRF, authenticated checkout identity and the production fail-closed account boundary
- [x] Full regression suite remains green: 209/209 Core tests, 28 immutable migrations, UI/accessibility checks and HTTP smoke workflow; 39 production-web TS/TSX files syntax-check cleanly
- [x] Direct server-runtime proof passed: authenticate demo customer → save product → save search → create customer-linked order → project saved/search/order/notification state

**Production boundary (updated by Build 0.34):** customer identity/session/personalization/notification/privacy plus public catalog/customer commerce/order state use PostgreSQL whenever `DATABASE_URL` is configured. Vendor/Admin request-time state remain on their fail-closed preview adapters until the next cutover stages.

## Build 0.26.1 consistency / production-web hardening

- [x] Release identity is derived from package metadata in the development runtime; health/smoke/UI no longer carry stale hard-coded Build 0.24 values
- [x] New project-consistency gate rejects root/web/docs version drift, npm-incompatible workspace protocol usage, core dependency mismatch, missing production security headers, shared hard-coded fairness visitor keys and broken static Next.js links
- [x] `apps/web` core dependency uses matching semver (`0.24.0`) so npm can workspace-link it; the previous `workspace:*` protocol failed in the target npm toolchain before dependency resolution
- [x] Production Next.js receives CSP, anti-framing, MIME/referrer/permissions, COOP/CORP, HSTS and DNS-prefetch response headers instead of relying only on the dependency-free development server
- [x] Opaque per-browser Fair Vendor Exposure identity is created/validated in Next.js `proxy.ts` and forwarded internally; production pages/APIs no longer share demo visitor keys
- [x] Catalog resolution recomputes category stock freshness, handles zero eligible suppliers without throwing and centralizes duplicate public-assignment logic
- [x] Search/product/vendor projections avoid phantom Fair Vendor Exposure events: query filtering happens before assignment, product detail resolves only its requested canonical product, and vendor profile product lists do not mutate fairness
- [x] Product metadata reads canonical public data without creating supplier exposure events
- [x] Production homepage no longer embeds the engineering checkout harness; dead product controls and missing `/join` route were replaced with truthful working navigation, and public `/admin`/`/vendor` dead links were removed
- [x] Cart localStorage hydration validates stored shape, price/title/id/quantity and supports the same 1–99 quantity range accepted by checkout
- [x] Checkout API validates trusted visitor identity, postcode, fulfilment mode, item shape/count and quantity; the browser no longer supplies its own fairness visitor key
- [x] Checkout retry idempotency key persists across lost-response retries and is scoped to cart + postcode + fulfilment mode; final backend-calculated order total is distinguished from browser-estimated merchandise subtotal
- [x] `.env.example` now documents the actual development-server runtime variables (`PORT`, `PUBLIC_ORIGIN`, `TRUST_PROXY`) instead of only reserved production adapter settings
- [x] Production web health payload now reports the web build version
- [x] Full repository regression verification remains green after the patch: 209/209 core tests, 28 immutable migrations, development UI checks, structural accessibility checks and HTTP smoke workflow

## Build 0.26 production web milestone

- [x] Production Next.js homepage upgraded from engineering-demo presentation to Greek-first marketplace storefront
- [x] Production `/shop` route with query, availability and price sorting controls over canonical products
- [x] Production `/product/[id]` route with one-public-product presentation, local adviser/fulfilment identity and human-commerce CTAs
- [x] Persistent browser cart with quantity management and shared live cart count
- [x] Production `/cart` route and `/checkout` customer journey wired to the existing domain-backed `/api/checkout` endpoint
- [x] Checkout supports pickup/local-delivery/shipping selection while keeping real payment capture disabled behind the PSP/legal launch gate
- [x] Production `/account` customer-hub shell maps the already-implemented order, saved-item, saved-search, notification, advice and privacy capabilities without bypassing authentication
- [x] Production `/vendor/[id]` local-partner profile route surfaces adviser identity and vendor-capable canonical products without creating synthetic fairness exposure or exposing hidden supplier offers
- [x] Existing Fair Vendor Exposure and inventory runtime reused by production surfaces with per-browser identity rather than duplicated presentation-only supplier logic
- [x] Responsive visual system, improved marketplace metadata and mobile layouts added without modifying tested domain invariants
- [x] Full repository verification remains green: 209/209 core tests, 28 migration checks, accessibility/UI checks and HTTP smoke workflow

## Working implementation

### Foundation, security and persistence
- [x] Route-specific abuse controls for login/registration/verification/advice/Ask Local with hashed correlation keys and explicit 429 semantics
- [x] Privacy-minimised security-event telemetry with 90-day retention, Admin security view and PostgreSQL append-only persistence adapter
- [x] Global browser-security headers (CSP, anti-framing, MIME/referrer/permissions/COOP/CORP controls; HSTS when HTTPS origin is configured)
- [x] Separate liveness/readiness health model with critical vs non-critical dependency semantics and Admin operational-health view
- [x] Structural accessibility regression suite for customer/vendor/admin/onboarding/localized public interfaces, including skip links, landmarks, focus visibility and reduced-motion support
- [x] Implementation threat model and accessibility acceptance matrix documented; human audit/penetration test remain launch gates
- [x] Signed opaque sessions, password hashing, session expiry and CSRF protection
- [x] Email verification with single-use tokens
- [x] Customer, vendor and platform RBAC with server-side vendor isolation
- [x] Customer saved products/shops and 90-day bounded recently-viewed history with explicit personalization opt-out
- [x] Explicit per-saved-product back-in-stock and public platform price-drop alerts with transition baselines, threshold controls and notification delivery
- [x] Privacy-respecting canonical-product recommendations using saved/recent category/brand signals and local availability, with localized explanations and explicit per-brand/per-category diversity caps; vendor assignment resolves separately through Fair Vendor Exposure
- [x] Customer saved searches with baseline snapshots, new-canonical-match alerts, alert pause/re-enable rebaselining and privacy-erasure integration
- [x] Grouped customer notification centre with group/unread filters, mark-all-read and archive lifecycle without deleting operational history
- [x] Self-service privacy export, deletion request and consumer account closure with immediate non-essential-data clearing and reasoned retention snapshots
- [x] Closed consumer accounts are pseudonymized and active sessions/verification credentials are revoked; business/staff accounts require administrative offboarding
- [x] Platform privacy-operations queue with dedicated `privacy.read` / `privacy.manage` permissions and audited processing/completion
- [x] Vendor application workflow through verification, catalogue onboarding, test-ready and activation
- [x] Privileged append-only audit history and transactional outbox primitive
- [x] In-app notifications with user/vendor scope, deduplication and read state
- [x] Versioned external notification templates, user/vendor delivery preferences and purpose/required-event rules
- [x] Email/SMS/push provider abstraction with leased delivery worker, exponential retries, idempotency and masked delivery-attempt observability
- [x] SQL-first PostgreSQL schema and immutable migration checksum manifest (28 migrations through saved-search alert and notification-centre persistence)
- [x] Migration runner with advisory lock, per-migration transaction and applied-checksum verification
- [x] PostgreSQL unit-of-work abstraction with transaction-local actor/vendor/market/request scope for RLS
- [x] PostgreSQL catalog, inventory, fairness, commerce, advice, finance and shipping repository adapters
- [x] PostgreSQL identity/session, vendor onboarding/provisioning, media/trust, returns, notifications, audit and security-event repository adapters
- [x] Stable application-facing public IDs bridged to internal PostgreSQL UUID keys and actor/vendor/market RLS scope
- [x] Database-side inventory reservation/consume/release/expiry functions with row locking
- [x] Background worker with registered-event claiming, persistent lease ownership, multiple subscribers, exponential retry, dead-letter state and explicit replay
- [x] Durable scheduled-job contract with lease ownership, retry timing and PostgreSQL store adapter
- [x] Category-aware stock freshness policy/monitor with confirmation timestamps, due-soon/stale transitions and fairness/search eligibility
- [x] Event-driven public search projection service with stable document hashing, remove-on-suppression semantics and PostgreSQL projection state
- [x] Scheduled maintenance for reservation expiry, compliance-document expiry, stock freshness, search reconciliation, analytics retention, CMS publication and external notification delivery

### Catalog, search and fairness
- [x] Platform retail-price history is append-only and separate from hidden supplier purchase prices
- [x] Public price-reduction promotions are time-bound, non-overlapping, non-retroactive and blocked from becoming invalid after a base-price change
- [x] 30-day prior price is calculated from actual platform public prices, including earlier/cancelled-after-use promotions, and snapshotted for active reductions
- [x] Versioned coupons support fixed/percentage rules, canonical/category eligibility, caps, deterministic line allocation and pre-capture redemption reversal
- [x] Coupon/promotion amounts are snapshotted into order lines so partial refunds return the amount actually paid
- [x] Category governance service with configurable commerce modes (`standard`, `logistics_sensitive`, `compatibility_sensitive`, `regulated_mixed`, `vehicles`, `directory_only`)
- [x] Governed category attribute schemas with Greek/English labels, required fields, enum/boolean normalization and category-aware public facets
- [x] Attribute filters are applied on canonical search documents; identical vendor offers remain hidden and cannot create duplicate filter results
- [x] Compatibility-sensitive checkout requires explicit customer confirmation; regulated/directory/vehicle categories use transparent checkout gates rather than silent availability/ranking changes
- [x] Vendor product create/edit/import validates governed category attributes before matching/publication
- [x] Admin Category Governance API/backoffice can inspect and audit commerce-mode/schema configuration without altering Fair Vendor Exposure weights
- [x] Canonical product / hidden vendor-offer model
- [x] Exact and confidence-based product matching with variant conflict safeguards
- [x] Vendor source-product draft/edit/submit workflow
- [x] Product Matching Centre with approve/reject/new-canonical decisions and source history
- [x] CSV dry-run + explicit-confirmation import
- [x] Approved supplier offers enter canonical search/fairness/commerce without duplicate public listings
- [x] Greek, English and Greeklish normalization
- [x] Category, availability, advice and price filters plus customer-controlled price sort
- [x] Availability-adjusted deficit fairness rotation, deterministic tie-breaks, warm start and sticky attribution
- [x] Stock freshness is governed by category TTL rather than a hard-coded global window and feeds offer eligibility/search availability
- [x] Product media upload intent/storage abstraction, malware-scan state, rights metadata and moderation gate
- [x] Product compliance-document review/expiry plus recall/compliance-hold suppression and explicit restore
- [x] Merchant-facing fairness exposure view, scoped appeal workflow and platform review
- [x] Exposure anomaly detection/acknowledgement/resolution with configurable sample/tolerance gates
- [x] 30,000-selection statistical fairness test

### Customer commerce and local fulfilment
- [x] Multi-location vendor directory with one governed primary location plus additional active storefront/fulfilment points
- [x] Multiple locations from one merchant count as one merchant opportunity in Fair Vendor Exposure; branches cannot multiply organic rotation share
- [x] Location-aware capacity ceilings for pickup, local delivery and shipping feed offer eligibility and checkout availability
- [x] Vendor operations workspace can select/add locations and manage each location's weekly schedule, holiday closures, postcode/radius service coverage and fulfilment capacity
- [x] Admin local-operations view exposes per-location capacity/open fulfilments and postcode/radius service areas
- [x] Vendor-location trading calendars with Europe/Athens timezone, split-day opening intervals and dated closure/exception support
- [x] Public opening status, next-open state and generated pickup/advice windows from governed shop hours
- [x] Business-hour-aware fulfilment and Ask Local response deadlines that pause while the assigned shop is closed
- [x] Fulfilment service zones separated from delivery pricing: pickup, postcode/radius local delivery and nationwide shipping eligibility
- [x] Cart, checkout, delivery quote and Fair Vendor eligibility share the same delivery-serviceability rules
- [x] Vendor owner workspace can manage weekly hours, local-delivery postcode prefixes and shipping availability; changes are audited
- [x] Admin local-operations view exposes configured/open locations and service areas without altering merchant fairness
- [x] Consolidated customer order-tracking projection across multiple vendor fulfilments, with progress, shipment/pickup states and customer-visible timeline
- [x] Customer cancellation before physical handover with stock reversal/release and payment authorization cancellation or exact refund
- [x] Vendor-proposed substitutions require reserved alternative stock and explicit customer approval; higher-priced silent substitutions are rejected
- [x] Fulfilment acceptance/preparation SLA cases with breach, escalation, customer delay visibility, operator resolution and scheduled scanning
- [x] Persistent cart with locked supplier attribution
- [x] Stock reservations, expiry and oversell protection
- [x] One checkout / one payment / one customer order
- [x] Multi-vendor private fulfilment split
- [x] Vendor rejection and rescue-supplier routing
- [x] Private Ask Local prices preserve supplier and price provenance through checkout
- [x] Secure click-and-collect credential: six-digit code + signed QR token
- [x] Pickup credentials are vendor/customer scoped, expire, rate-limit invalid attempts and cannot be reused
- [x] Successful pickup verification completes fulfilment and triggers procurement accrual
- [x] Customer account shows ready pickup codes in the development UI
- [x] Direct-shipping lifecycle with courier abstraction, quote, label, tracking, handover and idempotent provider events
- [x] Carrier-confirmed delivery is separate from vendor local-delivery confirmation; shipping vendors cannot self-mark parcel delivered

### Human commerce
- [x] Native product-linked conversations
- [x] Adviser appointments with conflict prevention and fair attribution
- [x] Ask Local routed privately to one eligible merchant, never broadcast as a reverse auction
- [x] Time-limited private offer and accepted-offer-to-cart conversion
- [x] Vendor advice workspace for requests, conversations, appointments and notifications
- [x] Verified reviews require a fulfilled customer order line or a completed/two-sided advice interaction
- [x] Public reviews disclose verified interaction type without exposing customer identity; incentives require explicit disclosure
- [x] Vendor-scoped public response and report workflows; a report never auto-hides the review
- [x] Platform review moderation/report resolution is reasoned and auditable, with published-only aggregates
- [x] Review outcomes are deliberately excluded from Fair Vendor Exposure weights and organic identical-product assignment

### Finance, returns and commercial configuration
- [x] Integer minor-unit money and fixed-precision percentages
- [x] Balanced internal ledger primitives
- [x] Supplier procurement accrual after fulfilment
- [x] Vendor supplier-invoice matching workflow
- [x] Procurement approval-to-payable control
- [x] Settlement batches with reconciliation checks and one-procurement/one-batch protection
- [x] Maker/checker settlement approval: batch maker cannot approve the same payout
- [x] External bank/PSP payout reference closes the settlement and settles supplier procurements
- [x] Partial return/refund with supplier reversal and inventory disposition
- [x] Customer return/guarantee cases with configurable eligibility evidence, explicit RMA authorization, carrier/tracking and append-only custody history
- [x] Platform-owned inspection and remedy decision for refund, replacement, repair or price reduction; vendors perform only assigned operational work
- [x] Replacement stock is reserved through a separate supplier/fulfilment chain and repair work carries custody plus operational SLA state
- [x] Canonical recall activation identifies fulfilled outstanding customer quantities, notifies affected customers and links selected remedies to governed return cases
- [x] Customer refunds are not blocked when the original supplier payout is already settled; the supplier side records an auditable post-settlement receivable/recovery event instead
- [x] Versioned plans and fixed 36-month Founding/Early Bird entitlement
- [x] Founding planning price EUR 1,500 net, zero platform sales-service-fee snapshot; external costs remain separately configurable
- [x] Standard plan remains draft/unpublished because Blueprint v1.0 leaves final standard pricing unapproved
- [x] Versioned delivery-pricing rules with vendor/postcode specificity, free-shipping thresholds and per-fulfilment snapshots
- [x] B2B fee-rule engine with contractual precedence, fixed/percentage/credit calculations and immutable procurement fee snapshots
- [x] Supplier invoice gross, platform service fee, shipping reimbursement and vendor payable remain separate monetary concepts
- [x] Chargeback/payment-dispute workflow with evidence, idempotent provider outcomes, supplier payable holds and explicit platform/vendor liability allocation

### CMS, SEO and local storytelling
- [x] Modular Greek-first CMS pages with versioned translations, draft/scheduled/published/archived lifecycle and append-only revision history
- [x] Bilingual canonical/hreflang/Open Graph/robots metadata for public CMS pages
- [x] Indexable localized public content routes plus XML sitemap and robots.txt
- [x] Product structured data identifies Buy Local Sparta as seller while preserving the assigned local fulfilment partner as a separate property
- [x] Versioned navigation menus and audited redirect rules with redirect-loop safeguards
- [x] Merchant stories require actual vendor-owner approval before platform publication
- [x] Curated collections reference canonical products, never individual hidden supplier offers
- [x] CMS scheduled-publication job integrated with the durable scheduling contract
- [x] PostgreSQL CMS/SEO/story/collection/redirect repository adapter and RLS migration prepared

### Analytics and demand intelligence
- [x] Privacy-minimised behavioral event domain for search, canonical-product discovery, cart, checkout, advice, appointments and Ask Local
- [x] One-way visitor hashing; raw visitor/session identifiers are not stored in analytics events
- [x] Search-query sanitization for common email/Greek-phone identifiers before analytics storage
- [x] Search success, zero-result demand, unique-search click-through rate, category demand, GMV/AOV and advice/counteroffer reporting
- [x] Vendor analytics are supplier-scoped aggregates only and never expose competitor events, customer-level data or raw marketplace events
- [x] Analytics permissions separate vendor-own reporting from platform market intelligence
- [x] Analytics remain observational and do not feed Fair Vendor Exposure weights or hidden ranking decisions
- [x] PostgreSQL raw-event, daily market/vendor rollup and search-demand persistence with platform/vendor RLS separation
- [x] Retention controls in both development analytics service and PostgreSQL persistence
- [x] Customer search-result interaction attribution, Vendor Analytics workspace and Admin marketplace-demand dashboard

### Functional development workspaces
- [x] Greek-first storefront connected to live domain runtime
- [x] Customer registration/login, search, filters, cart, checkout, advice, booking, Ask Local, notifications and pickup display
- [x] Merchant application/onboarding page
- [x] Vendor workspace for products, stock, fulfilment, secure pickup verification, advice, supplier invoices and settlement status
- [x] Role-scoped vendor dashboard payload with least-privilege visibility for catalog, fulfilment, advice, finance and fairness data
- [x] Admin command centre for merchant activation, Product Matching, fairness, orders, returns, audit, operational health and privacy-minimised security events
- [x] Admin finance UI for procurement approval and maker/checker settlement workflow
- [x] Vendor media/compliance workspace with private-until-reviewed upload workflow
- [x] Admin media rights/moderation, compliance evidence, recall/hold, restore and background-job controls
- [x] Vendor direct-shipping UI for shipment creation, label generation and carrier handover
- [x] Vendor own-performance analytics workspace with no competitor/customer-level leakage
- [x] Admin demand-intelligence dashboard for search success, zero results, GMV, advice and Ask Local conversion
- [x] Customer verified-review submission/status UI, Vendor response/report workspace and Admin review moderation controls

## Automated proof

Current `npm run check` result:

- **210/210 core automated tests passing**
- **28 immutable SQL migrations verified against checksums**
- HTTP smoke workflow passing end to end:
  - liveness/readiness, browser security headers, abuse-rate limiting and privacy-minimised security event reporting
  - structural accessibility regression checks across all primary rendered interfaces
  - search + filters, including open-now status and schedule-backed advice windows
  - genuine zero-result search semantics (availability/advice boosts cannot fabricate lexical matches)
  - saved-search baseline → later canonical-product publication → new-match alert → grouped notification-centre read/archive lifecycle
  - localized recommendation explanations and brand/category diversity caps with merchant assignment still delegated to Fair Vendor Exposure
  - public/vendor/Admin multi-location trading-hours, capacity and delivery-coverage workflow, including radius/postcode configuration and service-area rejection
  - privacy-safe search event attribution, zero-result demand and vendor/platform analytics separation
  - verified purchase review → privacy-safe public projection → vendor response/report → Admin hide/restore/report resolution
  - CMS homepage/local pages, SEO canonical routes, sitemap, merchant story approval/publication and canonical collections
  - Ask Local assignment
  - private supplier offer and private customer price
  - checkout and supplier lock
  - advice appointment, in-app notifications, external notification preferences and required-vs-optional email delivery
  - cross-vendor access denial
  - secure pickup code/QR generation and collection verification
  - procurement accrual
  - return/refund
  - affected-customer recall → acknowledgement → evidence → RMA → custody → inspection → refund → recall resolution
  - already-settled supplier return → customer remedy remains independent → supplier receivable/recovery recorded
  - second fulfilled order → supplier invoice → payable approval
  - settlement maker → checker → external payout reference → settled procurement
  - customer registration + verification
  - merchant onboarding and versioned Founding entitlement
  - source product → canonical matching → hidden supplier offer publication
  - merchant fairness exposure → scoped appeal → platform review/resolution
  - CSV dry-run/commit → new canonical product → live search publication
  - media upload → background scan → rights/moderation approval → public product media
  - compliance evidence submission → platform verification
  - recall → canonical suppression across search/offers → resolution → explicit restore
  - direct shipment → label → vendor handover → idempotent carrier delivery
  - customer delivery quote → one checkout total with per-vendor delivery snapshots
  - versioned supplier fee resolution → adjusted payable → settlement using payable rather than invoice gross
  - chargeback open → evidence → provider loss → explicit platform liability allocation without silent supplier penalty

## PostgreSQL migrations prepared

- `0001_core.sql` — normalized marketplace system of record
- `0002_runtime_hardening.sql` — runtime/security/event hardening
- `0003_identity_private_offers_notifications.sql` — verification tokens, private-price provenance and notifications
- `0004_launch_plan_configuration.sql` — Free Listing, Founding/Early Bird and draft Standard plan configuration
- `0005_catalog_workflows.sql` — source products, CSV imports and Product Matching Centre persistence
- `0006_transactional_inventory.sql` — database-side atomic reservation/consume/release/expiry and stock freshness fields
- `0007_settlement_controls.sql` — settlement maker/checker fields, payout guards and unique procurement batching
- `0008_rls_platform_scope.sql` — explicit application RLS policy distinction between vendor scope and authorized platform scope
- `0009_media_compliance_jobs.sql` — media scan/review metadata, compliance-document moderation/expiry, product notices and dead-letter-capable outbox state
- `0010_shipping_provider_events.sql` — normalized shipment lifecycle, provider/tracking identities, vendor/location scope and idempotent carrier events
- `0011_public_ids_fairness_governance.sql` — stable public/domain IDs over internal UUID keys plus merchant fairness appeals, anomaly governance and RLS
- `0012_identity_vendor_trust_persistence.sql` — durable sessions/verification IDs, vendor application history/provisioning, notification content/RLS, return timeline/RLS and audit actor provenance
- `0013_workers_search_freshness.sql` — durable outbox worker leases, scheduled-job leases, search projection state and category-aware inventory freshness persistence
- `0014_delivery_fees_disputes.sql` — versioned delivery rules, fulfilment delivery snapshots, extended fee rules/snapshots, procurement fee/dispute fields and platform-governed payment dispute/evidence/provider-event persistence
- `0015_cms_seo_storytelling.sql` — versioned CMS pages/translations/revisions, navigation, redirects, merchant stories with vendor approval, canonical-product collections and public/vendor/platform RLS
- `0016_analytics_reporting.sql` — privacy-minimised analytics events, market/vendor daily rollups, search-demand aggregates, retention controls and platform/vendor RLS separation
- `0017_notification_delivery.sql` — external delivery state/leases, immutable template revisions, recipient preferences, masked delivery-attempt history and RLS
- `0018_security_operational_events.sql` — append-only privacy-minimised security telemetry, 90-day retention support, platform-only RLS and update prohibition
- `0019_verified_reviews.sql` — verified order/advice review provenance, incentive disclosure, vendor responses/reports, append-only review events, moderation state and customer/vendor/platform RLS
- `0020_return_guarantee_recall.sql` through `0031_viva_payments.sql` — return/recall, commerce, personalization, PostgreSQL account/commerce runtime and Viva payment persistence.
- `0032_vendor_rescue_paid_reservation_hardening.sql` — rescue traceability plus paid-reservation protection inside checkout reservation logic.
- `0033_media_upload_pipeline.sql` — durable private upload intents, scan leases/retries and storage-verification state.
- `0034_aade_mydata_erp_bridge.sql` — durable AADE ERP mapping version, MARK/UID/QR/cancellation state and non-blind transmission attempts.
- `0035_search_email_providers.sql` — durable Resend provider-event dedupe and privacy-minimised destination suppression state for external notification delivery.
- `0036_boxnow_shipping_bridge.sql` — BOX NOW origin mappings, durable shipment creation/reconciliation attempts and provider shipment metadata.
- `0020_return_guarantee_recall.sql` — richer return/guarantee state, fulfilled/refunded line evidence, RMA/custody/evidence, replacement/repair records, recall-affected customer operations and post-settlement return-recovery fields/RLS
- `0021_order_tracking_substitutions_sla.sql` — consolidated order timeline, cancellations, customer-approved substitutions and fulfilment SLA cases with scoped RLS
- `0022_trading_hours_delivery_coverage.sql` — vendor-location calendars, opening intervals/exceptions, fulfilment service zones, overlap guards and vendor/platform RLS
- `0023_multi_location_capacity.sql` — primary/secondary vendor-location controls, explicit vendor-location RLS and per-location/mode fulfilment-capacity rules
- `0024_category_governance_attributes.sql` — category commerce modes, governed attributes and progressive-checkout policy persistence
- `0025_promotions_price_history.sql` — platform public price history, promotions, coupons, redemption/reversal accounting and line-level discount snapshots
- `0026_customer_personalization_privacy.sql` — saved products/shops, bounded recently-viewed history, personalization preferences, privacy-request workflow and consumer closure/anonymization fields/RLS
- `0027_saved_product_alerts_recommendations.sql` — customer-owned saved-product alert preferences, append-only alert history and scoped privacy/RLS persistence
- `0028_saved_search_notification_center.sql` — customer-owned saved searches/new-match history, privacy-erasure controls and notification archive/read-centre persistence/RLS

`db/migrations/checksums.json` makes already-registered migration edits fail `npm run db:verify` rather than silently rewriting history.

## Environment limitation

This execution container does not currently provide a PostgreSQL server/`psql`, and package-registry DNS access is unavailable. Therefore the SQL has not been executed against a live PostgreSQL instance here, and the production Next.js dependency tree could not be freshly installed to run a real `next build`. The repository/transaction contracts are unit-tested with SQL executors, the production-web TypeScript sources pass dependency-free syntax transpilation, and the dependency-free runtime continues to exercise the complete domain workflow. A Node 24 CI `next build` plus live-database integration/concurrency run remain required before production-readiness claims.

## Next implementation priorities

1. Run the configured fresh PostgreSQL/PostGIS migration + cross-instance customer/Vendor/Admin commerce/governance suite in CI/deployment and retain its artifacts.
2. Execute live PostgreSQL evidence for atomic Vendor rescue and validate Viva demo/live payment/refund/webhook behavior with approved credentials.
3. Validate the prepared private S3-compatible signed-upload + ClamAV scan/promote pipeline against the selected staging bucket/scanner and add CDN delivery for approved public media.
4. Deploy the PostgreSQL and media workers with operational alert routing; validate S3 CORS/private-bucket controls and private ClamAV health/signature updates.
5. Add real courier/provider adapters and production geocoding/radius tooling on top of the implemented fulfilment service-zone engine, while retaining separate customer delivery pricing and provider-confirmed delivery semantics.
6. Validate the prepared AADE myDATA ERP transport with test credentials and accountant-approved mapping; implement Digital Goods Movement only against the approved operational flow, then connect Google Calendar/Meet and approved messaging channels.
7. Harden month-end finance with supplier credit notes, platform fee tax-document mapping, settlement reconciliation reports and chargeback recovery reporting.
8. Extend CMS/SEO with production photography/media and richer category/local landing blocks, using aggregate search-demand intelligence without coupling editorial decisions to fairness rotation.
9. Validate the prepared Meilisearch + Resend adapters against staging services and retain sender-domain/webhook/index-rebuild evidence; then add approved SMS/push transports without weakening recipient preferences.
10. Run live PostgreSQL fairness/concurrency/analytics/security integration tests, then complete the human WCAG audit, authenticated penetration review, backup/restore drill, external observability and launch-gate evidence.

## Production blockers intentionally not faked

The software architecture uses **Buy Local Sparta as consumer-facing seller and local merchants as suppliers/fulfilment/advice partners**. Production payment capture, customer tax documents, supplier B2B invoices/self-billing, title/risk transfer, payout treatment, VAT/myDATA and provider underwriting remain gated on Greek lawyer, accountant and selected PSP/ERP confirmation. No production credentials or approvals are assumed.


## Build 0.24 proof

- Customers can save a normalized search/filter context; the current canonical matches become the baseline, so enabling an alert never generates historical false positives.
- Reconciliation emits only genuinely new canonical-product matches, is driven after relevant search/catalog/pricing/inventory events and has a scheduled repair pass. Disabling/re-enabling alerts re-baselines current state.
- Search correctness was hardened so a non-empty query with no lexical/identity match remains a true zero-result search; availability, pickup and advice boosts can no longer fabricate a match.
- The customer notification centre groups operational messages (`orders`, `delivery`, `advice`, `saved`, `returns`, `safety`, `account`, `other`), supports group/unread filtering, mark-all-read and archive without erasing the notification record.
- Canonical-product recommendations now include localized customer-facing explanations and default brand/category diversity caps. Recommendation ranking still receives no hidden supplier economics or Fair Vendor state; the local partner is assigned afterward by the ordinary fairness engine.
- Privacy export includes saved searches and their emitted new-match events; deletion/account closure remove them as non-essential personalization.
- PostgreSQL migration `0028_saved_search_notification_center.sql` and the engagement/notification/privacy adapters persist the same customer-owned state with RLS and controlled privacy erasure.
- Build proof: 209 core tests, 28 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the complete HTTP critical-path smoke workflow including zero-result saved search → later product publication → new-match alert → notification read/archive.

## Build 0.23 proof

- Saved canonical products can opt into explicit back-in-stock and public platform price-drop alerts with integer-cent thresholds and transition baselining.
- Event-driven and scheduled reconciliation use canonical public availability plus Buy Local Sparta retail price only; supplier purchase price never enters the alert workflow.
- Customer recommendations consume saved/recent canonical category/brand signals plus public availability/advice metadata and disappear immediately when the customer opts out.
- Recommendation ranking never receives vendor IDs or Fair Vendor exposure state; the displayed local partner is assigned afterward through the ordinary sticky Fair Vendor Exposure path.
- Privacy export includes alert preferences/events, while deletion/account closure clear saved-product alert preferences with the rest of non-essential personalization.
- PostgreSQL migration `0027_saved_product_alerts_recommendations.sql` plus `PostgresEngagementRepository` persist the customer-owned alert state/history under own-user/platform RLS.
- Build proof: 204 core tests, 27 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the complete HTTP critical-path smoke workflow including price-drop alert delivery and recommendation opt-out.

## Build 0.22 proof

- Customer saved-product and saved-shop actions are customer-scoped, idempotent and exposed in the account UI.
- Recently viewed is created only from meaningful product-detail access, is bounded/expiring, can be cleared, and stops recording immediately when the customer opts out.
- Privacy export contains the customer's own account/personalization/commerce/advice/return/review/notification data without password/session secrets.
- Deletion requests immediately erase non-essential personalization and external-message preferences while recording explicit retained categories/reasons for operational follow-up.
- Self-service consumer closure pseudonymizes the account identity and revokes active sessions; vendor/staff roles are intentionally blocked from consumer self-closure.
- Admin privacy operations use dedicated RBAC and audited submitted → processing → completed/partially-completed states.
- PostgreSQL migration `0026_customer_personalization_privacy.sql` plus `PostgresCustomerPrivacyRepository` persist the same controls under customer/platform RLS.
- Build proof: 200 core tests, 26 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the complete HTTP critical-path smoke workflow.

## Build 0.21 proof

- Platform base-price history and announced price-reduction promotions are executable through Admin and customer storefront flows.
- Promotions cannot be backdated, overlap for one canonical product, or be invalidated by lowering the unfinished campaign's base price beneath/equal to its promotional price.
- Public product/search projections show the current platform price and governed prior-price disclosure without exposing supplier purchase prices.
- `LOCAL10` smoke flow proves coupon quote/allocation, checkout snapshot, compatibility confirmation, pre-capture cancellation and redemption reversal.
- Vendor-attributed analytics records customer-paid merchandise after line-level coupon allocation rather than gross pre-discount merchandise.
- PostgreSQL migration `0025_promotions_price_history.sql` plus `PostgresPromotionsRepository` persist price history, promotions, coupon rules/redemptions/reversals with one-way subject hashes and serializable redemption caps.
- Build proof: 193 core tests, 25 immutable migrations, 4 UI syntax checks, 6 structural accessibility checks and the complete HTTP critical-path smoke workflow.

## Build 0.20 proof

- 185/185 core automated tests pass.
- 30,000-selection Fair Vendor Exposure statistical test remains green.
- 24/24 immutable PostgreSQL migrations verify.
- 4 generated development interfaces pass JavaScript syntax verification.
- 6 rendered interfaces pass structural accessibility regression checks.
- Full HTTP smoke workflow proves category schemas/facets, Admin governance, compatibility confirmation and the existing end-to-end marketplace workflows.
- Live PostgreSQL/PostGIS runtime cutover remains a production infrastructure gate; repository/RLS contracts are implemented but not falsely represented as live-database-tested in this environment.
