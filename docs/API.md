# BOX NOW shipping transport — Build 0.41.0

- `POST /api/checkout` — shipping mode accepts a server-validated BOX NOW locker/contact snapshot when the provider is enabled.
- `POST /api/vendor/shipping/create` — Vendor-scoped delivery creation/reconciliation using the fulfilment ID as stable BOX NOW order number.
- `GET /api/vendor/shipping/label?shipmentId=…` — authenticated Vendor PDF label retrieval.
- `POST /api/vendor/shipping/handover` — Vendor physical handover transition; carrier delivery remains provider-controlled.
- `POST /api/admin/shipping/origin` — Admin-only mapping from BLS Vendor location to BOX NOW origin/warehouse ID.
- `POST /api/webhooks/boxnow` — raw-body HMAC-verified, provider-event-idempotent BOX NOW tracking endpoint with stale-event protection.

## Production search + notification transport — Build 0.40.0

- `GET /api/search/suggest?q=...` — server-side Meilisearch autocomplete over canonical public products only; returns no hidden supplier offers.
- Production `/shop` non-empty queries use the external canonical search projection and then apply Fair Vendor Exposure only to returned products.
- `POST /api/webhooks/resend` — raw-body Svix/Resend signature verification, provider-event dedupe, bounce/complaint suppression and delivery-failure reconciliation.
- `GET /api/health/ready` — reports Meilisearch as critical only when `BLS_SEARCH_ENABLED=true`; email transport is reported separately so provider degradation is observable without pretending database/payment readiness failed.

Worker/ops commands:

- `npm run search:configure` — create/configure the Meilisearch index and wait for provider tasks.
- `npm run worker:search` — reconcile canonical PostgreSQL state into the external index.
- `npm run worker:notifications` — lease and deliver queued email notifications through Resend.

# Buy Local Sparta API / Production-Web Boundaries

## AADE myDATA ERP transport — Build 0.39.0

- `POST /api/admin/tax/transmit` — platform-finance + CSRF protected transmission of a tax document that is already marked `ready` with the exact approved mapping version and accountant-generated myDATA XML.
- `/admin/tax` — Admin transport/document status workspace.
- `npm run mydata:check` — read-only AADE connectivity/credential check using RequestTransmittedDocs.

Network uncertainty does not trigger an automatic SendInvoices retry; the attempt moves to `manual_review` until reconciled. Credentials/configuration do not enable tax issuance by themselves.

## PostgreSQL Admin/governance operations — Build 0.36.0

With `DATABASE_URL` configured, platform staff authentication/session state and production Admin governance use `PostgresAdminAuthService`, `PostgresAdminOperationsService` and `PostgresAdminGovernanceService`. Admin mutation routes continue to require the platform session, CSRF token and canonical Core permission before invoking the platform-scoped database service.

Durable areas include vendor/KYB transitions, Product Matching/canonical approval, trust/compliance decisions, procurement/payable and maker-checker settlements, fairness appeals, orders/returns governance, review moderation, privacy processing, category policies, CMS publication, recalls, marketplace analytics, maintenance, audit/operational projections and Viva payment/refund reconciliation. Live money movement remains deployment-gated on approved Viva credentials/underwriting; approval state is never treated as completed money movement.

The live PostgreSQL CI smoke is configured to prove cross-instance Admin session restoration/revocation, category policy, CMS publication, recall suppression/restore, finance maker-checker separation and audit visibility.



## Expanded production Next.js Admin governance (Build 0.31.0)

Build 0.31 extends the same separate Admin session/RBAC/CSRF boundary with these production-web mutation surfaces:

- `POST /api/admin/orders/action` — platform cancellation action subject to Core pre-handover/payment/stock invariants.
- `POST /api/admin/returns/action` — platform return/RMA/receipt/inspection/remedy progression using ReturnService.
- `POST /api/admin/reviews/action` — publish/hide/restore verified-review moderation under `reviews.manage`.
- `POST /api/admin/reviews/report` — resolve or reject vendor review reports without automatic hiding.
- `POST /api/admin/privacy/action` — start/complete/partial-retention processing of the shared customer privacy-request queue.
- `POST /api/admin/categories` — upsert governed category commerce policy under platform catalog permission.
- `POST /api/admin/content` and `POST /api/admin/content/action` — create and publish/archive/restore CMS pages through the Core content lifecycle.
- `POST /api/admin/recalls` and `POST /api/admin/recalls/action` — open a product recall, identify affected customers and resolve/optionally restore only after blocking notices are closed.
- `POST /api/admin/maintenance/run` — execute due preview scheduler contracts for compliance expiry, CMS publication, search reconciliation, analytics retention and operational synchronization.

Public-commerce safety is now cross-layer enforced: the production web centralizes canonical admission in `canonicalIsPubliclyAllowed`. Inactive, compliance-held or recalled products are excluded from catalog/product detail and account saved-search availability before Fair Vendor Exposure assignment, and `/api/checkout` rejects them before order creation.

## Production Next.js Admin Command Centre (Build 0.30.0)

Production-web adds a separate platform-staff session and permission-gated Admin surface. Admin identities are not vendor/customer principals. Login is rate-limited using the trusted opaque browser visitor identity; the session cookie is HttpOnly + SameSite=Strict and all mutations below require the session CSRF token plus the corresponding Core permission.

- `POST /api/admin/login` — authenticate a platform-role principal; development-only demo staff accounts are never seeded in production.
- `POST /api/admin/logout` — CSRF-protected session revocation.
- `POST /api/admin/vendors/:id/transition` — governed vendor application/KYB transition through the Core onboarding state machine.
- `POST /api/admin/catalog/action` — approve/reject a submitted source-product match or approve the resulting hidden supplier offer.
- `POST /api/admin/catalog/canonical` — create a canonical product from an unmatched submitted source record using platform catalog permission.
- `POST /api/admin/trust/media` — platform rights/moderation decisions. In PostgreSQL production mode malware scan state is owned by the automated media worker and cannot be manually marked clean.
- `POST /api/admin/trust/compliance` — verify/reject submitted compliance evidence.
- `POST /api/admin/finance/procurement` — approve an eligible procurement to payable.
- `POST /api/admin/finance/settlement` — create/submit/approve/pay settlement batches. Core maker/checker separation prevents the batch maker from approving the same settlement.
- `POST /api/admin/fairness/appeal` — start/reject/resolve merchant fairness appeals with reasoned audit state.

The executable Admin preview shares the Vendor catalog/trust/finance service bundle so decisions are immediately visible to the merchant workspace. It fails closed in real production unless the explicit ephemeral-preview override is enabled; multi-instance production requires PostgreSQL-backed staff identity, audit and governance persistence.

## Production Next.js expanded Vendor operations (Build 0.29.0)

The authenticated Vendor adapter now adds catalog source-product creation/submission, CSV preview/confirmed import, media upload, compliance submission, advice messages/appointment actions, supplier invoice submission and assigned return operational actions. All mutation routes require the Vendor session CSRF token and re-authorize ownership server-side.

Vendor-facing routes intentionally expose **submission and operational execution only**. They do not expose platform catalog match/offer approval, malware-scan results, rights/moderation approval, compliance verification, payable approval, settlement maker/checker approval or payout marking. Analytics is generated through the Core vendor-scoped aggregate report and does not expose competitor or customer-level events.

Production Vendor media uses private S3-compatible presigned PUT upload intents when `BLS_MEDIA_PIPELINE_ENABLED=true`; completion HEAD-verifies storage metadata and a separate ClamAV worker owns malware scan state. Preview mode retains the deterministic in-memory media adapter.

## Production Next.js vendor/order adapter (Build 0.28.0)

Production-web adds `POST /api/vendor/login`, `POST /api/vendor/logout`, `GET /api/vendor/session`, `PUT /api/vendor/inventory` and `POST /api/vendor/fulfilments/action`. Vendor login uses the trusted opaque browser identity for abuse limiting; session cookies are HttpOnly and all mutations require CSRF. Inventory and fulfilment IDs are re-authorized against `principal.vendorId` server-side. Merchant actions cannot self-confirm carrier shipping delivery.

Customer production-web also adds authenticated `/account/orders/[id]` plus `POST /api/account/orders/:id/cancel`. Cancellation checks account ownership + CSRF and then delegates to the Core cancellation invariant, which refuses cancellation after ready-for-handover/shipping/delivery and reverses eligible reservations/payment authorization or captured value as appropriate.

The vendor adapter is executable preview state only and fails closed in production unless the explicit ephemeral preview override is enabled. Durable production requires the PostgreSQL identity/vendor/commerce persistence cutover.

## Production Next.js customer-account adapter (Build 0.27.0)

The production-web workspace now exposes a small account adapter over the existing Core contracts: `POST /api/account/login`, `POST /api/account/logout`, `GET /api/account/session`, saved-product/save-search mutations, grouped notification read-all, personalization preferences, recent-view recording and privacy-export request creation. Account mutations use the session-specific CSRF token returned by the authenticated session projection. Authenticated `/api/checkout` attaches `customerId`; guest checkout remains supported.

Build 0.36 updates this boundary: with `DATABASE_URL`, customer identity/session/account state, public catalog/cart/checkout/orders, Vendor operations and Admin/governance all use shared PostgreSQL services. Development without a database retains deterministic adapters; remaining production gates are external/provider-backed or deliberately atomic workflows.


The dependency-free HTTP runtime exists to exercise real domain logic before production framework/provider installation. It is not the final public API contract.


## Vendor PostgreSQL operations — Build 0.35.0

With `DATABASE_URL` configured, Vendor login/session plus the production Vendor workspace use `PostgresVendorAuthService` and `PostgresVendorOperationsService`. Every mutation is still protected by the Vendor HttpOnly session + CSRF layer and executes under the authenticated vendor RLS scope.

- `POST /api/vendor/login` / `POST /api/vendor/logout` / `GET /api/vendor/session` — shared PostgreSQL-backed Vendor session lifecycle and cross-instance rate limiting.
- Vendor dashboard inventory/fulfilment APIs — own approved offers and own fulfilments only; stock cannot be lowered below active reservations; carrier shipping delivery remains provider-confirmed.
- Vendor catalog APIs — durable product draft/submission and confirmed CSV-row creation. Product Matching/canonical approval stays platform-only.
- Vendor trust/compliance APIs — compliance metadata persists pending platform review. Production media uses private signed upload intents and remains non-public until automated malware scan plus rights/moderation approval.
- Vendor advice/finance/analytics/returns APIs — vendor-scoped PostgreSQL projections and only the operational mutations assigned to that merchant. Payable approval, settlement approval/payout and platform return decisions remain Admin controls.

PostgreSQL fulfilment rejection is intentionally not offered yet: rescue routing must atomically release/reassign inventory and move the customer order to the replacement supplier before a rejection can be safely persisted. The development runtime continues to exercise that complete invariant until its DB transaction is cut over.


## Customer PostgreSQL commerce — Build 0.34.0

When `DATABASE_URL` is configured, public catalog/product/vendor reads, authenticated cart persistence and `/api/checkout` use `PostgresCustomerCommerceService`. Checkout uses the trusted `x-bls-visitor` identity, SERIALIZABLE transactions, persistent Fair Vendor state and database row-locked stock reservations. Customer order history/detail/cancellation reads the same persisted order graph.

- `GET /api/account/cart` — returns the authenticated customer's durable cart when the PostgreSQL commerce backend is active; guest callers receive no server cart.
- `PUT /api/account/cart` — authenticated + CSRF-protected full cart synchronization. Server resolves canonical IDs/prices; client titles/prices are never authoritative.
- `POST /api/checkout` — database-backed when configured. In production it returns `503` unless Viva Smart Checkout is configured. The route commits the internal order/reservations first, then creates/reuses the durable Viva payment order and returns its hosted redirect. Checkout keys remain payload/visitor-bound and cross-instance safe.
- `GET /account/orders/:id` / `POST /api/account/orders/:id/cancel` — customer-owned persisted order view and pre-handover cancellation.

The durable worker expires eligible stock reservations and cancels abandoned `pending_payment` orders whose reservation window has ended. Paid/confirmed order reservations are explicitly excluded from generic expiry. Pending-payment fulfilments remain excluded from merchant-capacity load until payment confirmation.


### Viva payment-provider routes — Build 0.37

- `GET /api/payments/viva/webhook` — Viva webhook verification-key handshake.
- `POST /api/payments/viva/webhook` — parse event, retrieve authoritative Viva transaction data and reconcile payment/reversal state.
- `/checkout/success?t=...&s=...` — server-side provider verification; clears the browser cart only after confirmed capture.
- `/checkout/failure?t=...&s=...` — advisory failure return; may still reconcile a later successful transaction and otherwise preserves the cart.

Provider events handled are 1796 (payment created), 1798 (failed but non-final) and 1797 (reversal). Internal reconciliation validates order code, transaction UUID, EUR currency and order amount. External payment-order/refund attempts with uncertain outcomes are never automatically replayed; they enter manual reconciliation.

## Customer PostgreSQL state — Build 0.33.0

With `DATABASE_URL` configured, the production Next.js customer layer uses the shared PostgreSQL runtime for login/session restoration and customer-owned account state. Sessions are opaque signed browser tokens with only token/CSRF hashes persisted; restoration checks the database CSRF proof and logout revokes the shared session. Login throttles use hashed keys in `auth_rate_limit_windows`.

The database-backed customer state includes saved products/alert preferences, recent views, personalization preferences, saved searches, grouped notification state and privacy requests. `scripts/db-integration-smoke.ts` is the live CI proof for two independent runtimes seeing the same state and revocation. Customer commerce/orders remain outside this cutover. Production self-registration/email delivery is not activated until a real transactional email path is connected.

## Production PostgreSQL runtime — Build 0.32.0

The production database boundary is now executable rather than documentation-only. `@buy-local-sparta/postgres-runtime` owns the `pg.Pool` and unified `PostgresPersistenceBundle`. This does **not** mean all production-web request services have already been switched from preview state to PostgreSQL; that application-service injection is the next cutover step.

- `GET /api/health/ready` — production Next.js readiness. Returns `503` when the database is missing/unreachable, required extensions are unavailable or applied migration version differs from the repository's latest immutable migration.
- `npm run db:migrate` — applies immutable migrations under the existing advisory-lock/checksum contract.
- `npm run db:ready` — checks PostgreSQL/extension/schema readiness through the production runtime.
- `npm run db:smoke` — performs a live transaction/scoping/integration smoke against `DATABASE_URL`.
- `npm run check:postgres` — migrate → readiness → live DB smoke.
- `npm run worker:postgres` — starts the durable PostgreSQL scheduled-job process for implemented database-native maintenance jobs.

Production requires PostgreSQL 18 and the repository's `postgis`, `pgcrypto` and `citext` extensions. `BLS_ALLOW_DATABASELESS_PREVIEW=true` may be used only for an explicitly database-less production-style preview; it is not the production launch configuration.

## Public

- `GET /api/reviews?canonicalVariantId=<id>` — published verified reviews + aggregate for one canonical product; customer identity is omitted.
- `GET /api/reviews?vendorId=<id>` — published verified reviews + aggregate for one local supplier.
- `GET /api/health/live` — process liveness only; returns build metadata
- `GET /api/health/ready` — critical dependency readiness; returns 503 when a critical check is unhealthy
- `GET /api/health` — compatibility readiness endpoint with the same 200/503 semantics
- `GET /api/catalog` — `q`, `category`, `availability`, `advice=1`, `minPrice`, `maxPrice`, `sort=price_asc|price_desc`, plus category-aware `attr.<attributeCode>=<value>` filters. When a category is selected, the response includes its governed attribute schema/facets and commerce mode.
- `GET /api/search/autocomplete?q=`
- `GET /api/products/:canonicalVariantId`
- `GET /api/vendors`
- `GET /api/vendors/:vendorId`
- `GET /api/plans` — only active/approved plan definitions
- `GET /api/promotions` — currently scheduled/active public price-reduction campaigns and current platform price presentation; supplier costs are never returned
- `POST /api/cart/coupon` — apply/version-resolve a coupon to the authenticated/visitor cart; returns deterministic eligible-line allocation
- `DELETE /api/cart/coupon` — clear the cart coupon

### Category governance — Build 0.20

- `GET /api/admin/category-governance` — platform `catalog.read`; returns governed category policies, schemas and available attribute definitions.
- `PUT /api/admin/category-governance/:categoryCode` — platform `catalog.write` + CSRF + mandatory reason; updates commerce mode, compatibility/regulatory/advice/counteroffer flags, allowed fulfilment modes and governed attribute bindings. Every change writes an audit event.
- `GET /api/products/:canonicalVariantId` exposes `attributeSchema`, `commercePolicy` and a current `checkoutDecision` so the UI can explain category requirements before checkout.

## Identity
- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Customer commerce and account
- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:itemId`
- `DELETE /api/cart/items/:itemId`
- `POST /api/checkout` — revalidates delivery, stock and category commerce policy. Compatibility-sensitive lines require their canonical IDs in `compatibilityConfirmedVariantIds`; regulated/directory/vehicle gates cannot be bypassed by the cart UI.
- `GET /api/account/orders`
- `GET /api/account/advice`
- `GET /api/account/notifications?group=<orders|delivery|advice|saved|returns|safety|account|other>&unread=1` — grouped customer notification centre; archived notifications are omitted by default.
- `GET /api/account/notification-preferences`
- `PUT /api/account/notification-preferences` — `email|sms|push`, wildcard or event-specific preference; CSRF required
- `GET /api/account/pickups` — customer-scoped ready/collected pickup credentials; ready credentials expose the short collection code
- `GET /api/account/shipments` — customer-scoped direct-shipping records and tracking states
- `POST /api/account/notifications/:id/read`
- `POST /api/account/notifications/read-all` — CSRF protected; optional `group` marks only that centre group read.
- `POST /api/account/notifications/:id/archive` — CSRF protected; archives the customer-owned notification without deleting its operational record.
- `POST /api/account/private-offers/:offerId/add-to-cart`
- `POST /api/returns` — request a withdrawal/defect/non-conformity/delivery/safety return for an owned fulfilled line; optional requested remedy.
- `GET /api/account/returns` — customer-scoped return/guarantee cases plus current technical policy configuration.
- `POST /api/returns/:returnId/evidence` — attach bounded evidence metadata/reference to an owned case.
- `POST /api/returns/:returnId/dispatch` — move an authorized return into carrier custody with optional tracking.
- `GET /api/account/recalls` — affected-product recall cases for the authenticated customer.
- `POST /api/account/recalls/:recallCaseId/acknowledge` — record customer acknowledgement.
- `POST /api/account/recalls/:recallCaseId/remedy` — select `refund|replacement|repair|price_reduction`; creates/returns the governed safety-recall return case.

### Verified reviews — Build 0.15

- `GET /api/account/reviews` — authenticated customer's own review records/status.
- `POST /api/account/reviews/order` — create one verified-purchase review for an owned fulfilled order line; CSRF + rate limit.
- `POST /api/account/reviews/advice` — create one verified-advice review from exactly one two-sided conversation or completed appointment; CSRF + rate limit.

Reviews accept rating, optional body and incentive disclosure. Non-`none` incentives require public disclosure text. Duplicate reviews for the same verified source are rejected.

## Advice
- `POST /api/advice/conversations`
- `POST /api/advice/conversations/:conversationId/messages`
- `POST /api/advice/appointments`
- `POST /api/ask-local`

## Merchant onboarding
- `POST /api/merchant/applications`
- `GET /api/merchant/application`
- `POST /api/merchant/applications/:id/submit`

## Vendor scoped
- `GET /api/vendor/dashboard`
- `GET /api/vendor/orders`
- `GET /api/vendor/advice`
- `GET /api/vendor/money`
- `GET /api/vendor/notifications` — in-app vendor inbox only
- `GET /api/vendor/notification-preferences`
- `PUT /api/vendor/notification-preferences` — vendor-owner scoped preference change; CSRF required
- `GET /api/vendor/pickups` — assigned click-and-collect credentials
- `POST /api/vendor/orders/:orderId/fulfilments/:fulfilmentId/ready-pickup` — transition an accepted pickup fulfilment to ready and issue/reuse the secure credential
- `POST /api/vendor/pickups/:pickupId/verify` — verify customer short code or signed QR token; completes handover on success
- `POST /api/vendor/procurements/:procurementId/invoice` — submit/match vendor supplier invoice reference and gross amount
- `POST /api/vendor/media/intents` — authenticated + CSRF-protected private presigned-upload intent.
- `POST /api/vendor/media/complete` — authenticated + CSRF-protected storage verification/finalization; creates pending scan asset.
- `GET /api/vendor/media`
- `POST /api/vendor/media/upload-intent` — vendor-scoped one-time upload intent; product relationship, kind, filename, alt text and rights owner are validated
- `POST /api/vendor/media/upload` — dependency-free development upload finalization; production uses signed object-storage upload
- `GET|POST /api/vendor/compliance-documents` — submit and inspect product safety/compliance evidence
- `GET /api/vendor/shipments`
- `POST /api/vendor/orders/:orderId/fulfilments/:fulfilmentId/shipment` — create a direct-shipping shipment for an accepted shipping fulfilment
- `POST /api/vendor/shipments/:shipmentId/label` — provider label/tracking generation
- `POST /api/vendor/shipments/:shipmentId/handover` — confirm physical carrier handover; vendor cannot self-confirm final shipping delivery
- `POST /api/vendor/notifications/:id/read`
- `POST /api/vendor/inventory/:offerId`
- `POST /api/vendor/orders/:orderId/fulfilments/:fulfilmentId/accept|reject|deliver`
- `POST /api/vendor/counteroffers/:requestId/offer`
- `GET /api/vendor/returns` — supplier-scoped operational return/remedy queue; does not grant consumer-remedy decision authority.
- `POST /api/vendor/returns/:returnId/receive` — acknowledge physical receipt/custody of the assigned return.
- `POST /api/vendor/returns/:returnId/replacement/accept|ready|ship|deliver|reject` — operate the platform-approved replacement chain.
- `POST /api/vendor/returns/:returnId/repair/start|await_part|ready|return_to_customer|fail` — operate the platform-approved repair chain and custody transitions.

### Vendor verified reviews — Build 0.15

- `GET /api/vendor/reviews` — vendor-scoped verified reviews, own aggregate, responses and reports; customer IDs are omitted.
- `POST /api/vendor/reviews/:id/response` — publish/update the assigned vendor's response.
- `POST /api/vendor/reviews/:id/report` — open a reasoned moderation report for the assigned vendor's review; does not hide content.
- `POST /api/vendor/appointments/:id/complete` — mark an assigned appointment completed after it starts, enabling verified-advice review eligibility.

## Security and request controls — Build 0.14

- Every response receives a stable `x-request-id` plus anti-framing, MIME, referrer, permissions, COOP/CORP and CSP headers. HSTS is enabled when the configured public origin is HTTPS.
- Login is limited independently by client-address hash and normalized identity hash; registration, email verification, advice and Ask Local have separate abuse budgets.
- A rejected limit returns HTTP `429`, `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and a JSON `too_many_requests` response.
- JSON request bodies are capped at 1 MB and require `application/json` when a body is present.
- Security telemetry stores only sanitized metadata and one-way correlation hashes; raw client IP/email/token/cookie/request-body values are excluded.

## Platform admin

### Promotions and platform pricing — Build 0.21

- `GET /api/admin/promotions` — platform `promotions.read`; returns campaigns, platform price history, coupons and effective redemption/reversal counts.
- `POST /api/admin/promotions` — platform `promotions.write` + CSRF; create a non-retroactive, non-overlapping fixed-price campaign. A just-submitted timestamp within one minute is normalized to “start now”; genuinely backdated campaigns are rejected.
- `POST /api/admin/promotions/:id/cancel` — reasoned/audited cancellation; historic time already spent active remains part of prior-price history.
- `POST /api/admin/products/:id/platform-price` — reasoned append-only base-price change; rejected when it would make an unfinished public reduction invalid.
- `POST /api/admin/coupons` — create a versioned fixed/percentage coupon with eligibility, validity and redemption caps.

Coupons never modify Fair Vendor Exposure. Checkout stores the coupon source and per-line discount allocation; a pre-capture order cancellation reverses the redemption, while a completed/refunded purchase keeps the usage consumed.

- `GET /api/admin/health` — privileged dependency report; remains inspectable even if public readiness is unhealthy
- `GET /api/admin/security` — requires `security.read`; 24-hour privacy-minimised security summary/events and retention metadata
- `GET /api/admin/dashboard`
- `GET /api/admin/vendor-applications`
- `POST /api/admin/vendor-applications/:id/transition`
- `GET /api/admin/fairness`
- `GET /api/admin/orders`
- `GET /api/admin/returns` — complete return/guarantee queue plus configurable technical policy.
- `GET /api/admin/recalls` — affected-customer recall cases.
- `POST /api/admin/returns/:id/approve` — platform return review; may require inspection.
- `POST /api/admin/returns/:id/authorize` — issue RMA, destination, return-cost payer, instructions and optional carrier/tracking.
- `POST /api/admin/returns/:id/inspect` — record sellable/blocked disposition and findings after receipt.
- `POST /api/admin/returns/:id/remedy` — approve `refund|replacement|repair|price_reduction`; repair/replacement chains are created here.
- `POST /api/admin/returns/:id/price-reduction` — execute an already-approved monetary price-reduction remedy.
- `POST /api/admin/returns/:id/refund` — execute an already-approved refund; retains a backward-compatible development fast path from received → inspected → refund.
- `GET /api/admin/outbox`
- `GET /api/admin/audit`
- `GET /api/admin/settlements` — finance view of procurements and settlement batches
- `POST /api/admin/procurements/:id/approve-payable` — approve a matched supplier invoice for payout
- `POST /api/admin/settlements` — create a draft batch from payable procurements
- `POST /api/admin/settlements/:id/submit` — maker submits reconciled batch
- `POST /api/admin/settlements/:id/approve` — checker approval; same user as maker is rejected
- `POST /api/admin/settlements/:id/pay` — record external bank/PSP payout reference and settle included procurements
- `GET /api/admin/media` / `POST /api/admin/media/:id/review` — rights/moderation gate after clean scan
- `GET /api/admin/compliance-documents` / `POST /api/admin/compliance-documents/:id/review`
- `GET /api/admin/product-notices`
- `POST /api/admin/products/:canonicalVariantId/notices` — safety notice, recall or compliance hold
- `POST /api/admin/product-notices/:id/resolve`
- `POST /api/admin/products/:canonicalVariantId/restore` — fails while a blocking notice is unresolved
- `POST /api/admin/jobs/run` — development worker + maintenance execution
- `POST /api/admin/outbox/:eventId/replay` — explicit retry after operational review
- `POST /api/admin/courier-events` — normalized/idempotent carrier status event ingestion in the development adapter

All protected mutations use server-side role/vendor checks and CSRF validation where session authority is required. Financial/order idempotency is enforced in the underlying domain services rather than by UI controls.


## Returns, guarantees and affected recalls — Build 0.16

The platform owns consumer-remedy decisions because the implemented product architecture makes Buy Local Sparta the customer-facing seller. Vendors receive only the operational data needed to receive, replace or repair their assigned line. Return evidence and physical custody are append-oriented. RMA authorization is explicit; customer dispatch requires an authorization first.

A blocking canonical `recall` additionally fans out to fulfilled, non-refunded order-line quantities and creates customer-specific affected cases. Selecting a remedy creates a linked `safety_recall` return. Completing refund/replacement/repair resolves the affected case; resolving the product notice itself remains a separate compliance action.

A previously paid supplier settlement never becomes a prerequisite for the customer refund. If the original procurement is already settled, the finance domain creates a post-settlement supplier receivable/recovery event for later B2B reconciliation. Exact supplier credit-note/VAT treatment remains an accountant/legal integration gate.


## Verified review moderation — Build 0.15

- `GET /api/admin/reviews` — platform review/report/event queue for authorized trust/support roles.
- `POST /api/admin/reviews/:id/moderate` — set `published|hidden|rejected` with an explicit reason; writes audit/review history.
- `POST /api/admin/review-reports/:id/review` — move a vendor report through `under_review|resolved|rejected`; terminal states require a resolution.

Review moderation is a trust function only. It does not change Fair Vendor Exposure deficits, capacity weights or organic identical-product assignment.

## Fairness transparency and appeals — Build 0.7

- `GET /api/vendor/fairness` — vendor-scoped target/actual exposure snapshots, existing appeals and open anomalies for products the merchant actually supplies.
- `POST /api/vendor/fairness/appeals` — submit a reasoned product-level or vendor-level appeal; cross-vendor product appeals are rejected server-side.
- `GET /api/admin/fairness` — rotation snapshots/events plus appeals and exposure anomalies.
- `POST /api/admin/fairness-appeals/:id/review` — move an appeal to review/resolved/rejected with reasoned resolution.
- `POST /api/admin/fairness-anomalies/:id/acknowledge` / `resolve` — governed operational handling; these actions do not secretly change ranking.
- Fairness permissions are explicit: vendor owners may appeal, vendor catalog staff have read-only fairness visibility, and only authorized platform operations/catalog roles can manage appeals/anomalies. Finance/logistics/content roles do not gain fairness-control authority merely because they are platform users.

## Vendor catalog onboarding — Build 0.7

- `GET /api/vendor/products` — vendor-scoped source submissions plus published hidden supplier offers.
- `POST /api/vendor/products` — create a vendor source-product draft. Requires `catalog.write` + CSRF.
- `PATCH /api/vendor/products/:submissionId` — edit a vendor-owned source record before approval. Identity/category edits invalidate prior match suggestions.
- `POST /api/vendor/products/:submissionId/submit` — run deterministic/fuzzy canonical matching and move the source to `linked` or `needs_review`.
- `POST /api/vendor/products/import/preview` — parse and validate CSV without mutation.
- `POST /api/vendor/products/import/commit` — commit only a clean preview and only with `confirm: true`; optional `submit: true` immediately runs matching.
- `GET /api/vendor/inventory/:offerId/history` — vendor-scoped balance, ATS and append-only inventory movements.

CSV launch columns include `vendor_sku`, `category_code`, `title`, `brand`, `model`, `mpn`, `gtin`, `condition`, `supplier_price_minor`, `supplier_tax_rate_bps`, `stock_on_hand`, `safety_stock`, `fulfilment_modes`, `advice_available`, and `attributes` (`key=value|key=value`). Required fields are category, title, supplier price and stock.

## Product Matching Centre — Build 0.7

- `GET /api/admin/product-matching` — source submissions, candidate canonical matches, evidence/confidence, status and workflow history.
- `POST /api/admin/product-matching/:candidateId/approve` — reason-coded human approval of an uncertain match.
- `POST /api/admin/product-matching/:candidateId/reject` — preserve the source as separate/needs-review.
- `POST /api/admin/vendor-products/:submissionId/create-canonical` — create a new platform-controlled canonical product with a platform retail price.
- `POST /api/admin/vendor-products/:submissionId/approve` — approve the supplier offer and publish it into inventory, search, fairness, cart and commerce under the canonical product.
- `POST /api/admin/vendor-products/:submissionId/reject` — reason-coded offer rejection.

Approved source products never create a second public listing when they link to an existing canonical variant. The supplier offer remains a hidden commerce record and joins the fair-assignment pool.


## Persistence and migration commands — Build 0.7

- `npm run db:verify` — verifies ordered SQL migration filenames and SHA-256 immutability against `db/migrations/checksums.json`.
- `npm run db:migrate` — when `DATABASE_URL` and `pg` are available, acquires a PostgreSQL advisory lock, verifies the applied migration ledger, and applies each pending migration in its own transaction.
- Build 0.7 adds stable public-ID/UUID bridging and repository adapters for fairness, commerce/order hierarchy, advice, finance/ledger and shipping in addition to catalog/inventory. The complete HTTP demo still uses the dependency-free in-memory adapter until a live PostgreSQL integration environment is available.

## Secure pickup rules — Build 0.7

The pickup service stores a nonce and HMAC-derived proof material rather than a reusable plaintext secret. A ready pickup produces a six-digit customer code and a signed QR token. Vendor scope is checked server-side, invalid attempts are counted and can lock the credential, expiry is enforced, successful collection is idempotent, and the fulfilment is completed only after verification.

## Supplier settlement controls — Build 0.7

A fulfilled line accrues procurement. The vendor supplies an invoice reference/amount, platform finance approves the matched procurement as payable, a maker creates/submits a batch, and a different checker approves it. Payment is closed only after an external payout reference is recorded. One procurement cannot be included in two settlement batches.


## Media, compliance and recall controls — Build 0.7

Media has four independent gates: upload finalization, malware scan, rights review and content moderation. Product media is public only when all required gates are satisfied; a vendor cannot publish its own media merely by uploading it. Compliance evidence has its own pending/verified/rejected/expired state. A `recall` or `compliance_hold` suppresses the canonical product across all supplier offers and removes it from public search until every blocking notice is resolved and an authorized platform user explicitly restores the product.

The development object store is intentionally in-memory. Production must replace it with S3-compatible signed uploads, content validation, malware scanning, image re-encoding/derivatives, private/public bucket separation and CDN delivery.

## Background jobs, search projection and stock freshness — Build 0.9

The worker claims only event types for which a handler is registered, under a worker-specific lease, and can run multiple subscribers for one event. Failures are retried with backoff and eventually become `dead_lettered`; operators may explicitly replay an event after investigation. Scheduled jobs now cover reservation expiry, compliance-document expiry, category-aware stock freshness and periodic search reconciliation. `GET /api/admin/outbox` also exposes scheduled-job state, stock-freshness state and search-projection summaries for the development operations UI. PostgreSQL adapters persist worker leases, scheduled-job leases and search projection state; production still requires deployment of the worker process and external search/provider infrastructure.

## Direct shipping — Build 0.7

Shipping fulfilment is distinct from pickup and merchant local delivery. The assigned vendor may create one active shipment, obtain a provider label/tracking number and confirm physical handover. Final in-transit/delivered state comes from idempotent provider events, not a vendor "delivered" button. A delivered carrier event completes the related fulfilment and triggers supplier procurement accrual exactly once. The current `DevCourierProvider` is a contract test/development adapter, not a production courier integration.



## CMS, SEO and merchant storytelling — Build 0.11

Public/indexable:
- `GET /api/content/home?locale=el|en` — published homepage content plus canonical/hreflang/Open Graph/robots metadata.
- `GET /api/content/page?slug=...&locale=el|en` — published modular CMS page.
- `GET /api/content/navigation?key=primary|footer|merchant&locale=...` — versioned navigation projection.
- `GET /api/content/stories?locale=...` — published vendor-approved merchant stories with Article structured data.
- `GET /api/content/collections?locale=...` — published canonical-product collections resolved through current sellability/fairness assignment.
- `GET /api/content/redirect?path=...` — active internal redirect lookup.
- `GET /sitemap.xml` / `GET /robots.txt` — index-control outputs.
- `GET /el`, `/en`, localized CMS paths, `/el/stories/:slug`, `/el/collections/:slug`, `/el/products/:id`, `/el/shops/:id` — indexable development HTML routes with canonical metadata. Sitemap entries therefore resolve to real public documents.

Vendor-owner:
- `GET /api/vendor/stories` — merchant-scoped editorial stories.
- `POST /api/vendor/stories/:id/approve` — explicit merchant approval required before platform publication.

Platform content/SEO:
- `GET /api/admin/content` — pages/revision summaries, stories, collections, menus, redirects and sitemap projection.
- `POST /api/admin/content/pages`, `PUT /api/admin/content/pages/:id`, `POST /api/admin/content/pages/:id/publish|archive` — modular page lifecycle.
- `POST /api/admin/content/navigation` — versioned safe navigation menu.
- `POST /api/admin/content/redirects` — audited redirect creation with loop protection.
- `POST /api/admin/content/stories`, `POST /api/admin/content/stories/:id/publish` — editorial creation followed by vendor approval gate.
- `POST /api/admin/content/collections`, `POST /api/admin/content/collections/:id/publish` — canonical-product merchandising collections.

Content permissions are separate from finance/fairness controls. Vendor owners can approve their own story but cannot publish it; `content_seo`/authorized platform users manage editorial publication. Paid participation does not confer hidden organic product or merchant-story ranking boosts.

## Delivery pricing and commercial finance — Build 0.10

- `GET /api/delivery/quote` — quote customer delivery for a market/vendor/mode/postcode/subtotal without mutating an order.
- `GET /api/cart?fulfilmentMode=pickup|local_delivery|shipping` — updates the persisted cart fulfilment choice and returns merchandise subtotal, delivery quotes, aggregate delivery charge and one total.
- `GET /api/admin/commercial-rules` — authorized finance view of active delivery and B2B fee rules.
- `POST /api/admin/delivery-rules` — versioned delivery-pricing rule creation; finance-write + CSRF required.
- `POST /api/admin/fee-rules` — versioned B2B fee-rule creation; finance-write + CSRF required. Rules may resolve by vendor contract, campaign credit, plan, category or market default.
- `POST /api/admin/procurements/:id/commercials` — resolve fee snapshots and approved shipping reimbursement against a matched supplier procurement before payable approval.

Customer retail price, delivery charge, supplier invoice amount, platform service fee and vendor payable are distinct fields. The API never derives vendor money by subtracting a generic commission from customer gross.

## Payment disputes / chargebacks — Build 0.10

- `GET /api/admin/disputes` — finance/operations dispute list.
- `POST /api/admin/disputes/open` — create an idempotent provider dispute and freeze related unsettled supplier payables pending review.
- `POST /api/admin/disputes/:id/evidence` — append evidence to the case.
- `POST /api/admin/disputes/:id/submit` — submit an evidence-ready case.
- `POST /api/admin/disputes/:id/resolve` — record an idempotent provider `won`/`lost` outcome.
- `POST /api/admin/disputes/:id/allocate` — after a loss, explicitly allocate liability to platform or vendor with a mandatory reason. No supplier deduction occurs merely because a chargeback exists.

## Analytics and search-demand intelligence — Build 0.12

Customer/search attribution:
- `GET /api/catalog?...` — when a query or meaningful filter is used, returns `searchEventId` alongside canonical results. Search text is sanitized before analytics storage.
- `POST /api/analytics/search-click` — records a result interaction only when it can be attributed to the same visitor/customer context as the originating search. Cross-visitor attribution is rejected. Analytics failure is non-blocking in the storefront UI.

Vendor-own reporting:
- `GET /api/vendor/analytics?from=...&to=...` — requires `analytics.vendor.read` and vendor scope. Returns only that vendor's aggregate qualified impressions, product views, cart adds, attributed orders/units/retail sales, advice starts, appointments and Ask Local outcomes. Raw events, customer identifiers and competitor metrics are never returned.
- `GET /api/vendor/dashboard` — includes the same 30-day vendor aggregate only for roles with `analytics.vendor.read`. Catalog-only and fulfilment-only staff do not automatically receive sales analytics.

Platform market intelligence:
- `GET /api/admin/analytics?from=...&to=...` — requires `analytics.market.read`. The window defaults to 30 days and is capped at 366 days. Returns search success/zero-result counts, unique-search CTR, product discovery/cart activity, authorised order count, GMV/AOV, advice/appointment/Ask Local metrics, top searches, zero-result searches and category demand.

Privacy and fairness rules:
- Visitor context is stored as a one-way SHA-256 analytics hash, not the raw visitor cookie.
- Common email addresses and Greek phone-number patterns are redacted from search terms before reporting/persistence; normal GTIN/EAN product identifiers remain searchable.
- PostgreSQL raw `analytics_events`, market rollups and search-term aggregates are platform-only under RLS. `analytics_vendor_daily` exposes only the current vendor's aggregate row or authorized platform access.
- Raw-event retention is explicit; the development scheduler includes `analytics-retention`, while the PostgreSQL adapter deletes rows after `retention_until`.
- Analytics is observational. It does not change Fair Vendor Exposure deficits, capacity weights, eligibility or organic ranking.


## Notification delivery — Build 0.13

- `GET /api/admin/notifications` — external queue/failure counts, recent delivery records, masked attempts, template revisions and development-provider health.
- `POST /api/admin/notification-templates` — create an immutable template revision for `email|sms|push`; requires notification-management permission and CSRF.
- `POST /api/admin/notifications/:id/retry` — explicitly requeue a failed external delivery; requires notification-management permission and CSRF.

In-app notifications are created synchronously. External channels are queued and delivered by a worker. Email is the default external channel for non-marketing optional service/transactional templates; SMS and push are opt-in. Required transactional templates remain deliverable when a user disables optional email. Marketing remains opt-in. Development providers implement the same interface as production providers but do not imply that any real email/SMS/push account is connected.


## Consolidated order operations — Build 0.17

- `GET /api/account/orders/:orderId/tracking` — customer-owned consolidated progress, fulfilment groups, delays, tracking/pickup context, pending substitutions and customer-visible timeline.
- `POST /api/account/orders/:orderId/cancel` — cancel only before physical handover; releases/reverses stock and cancels/refunds payment as required.
- `POST /api/account/substitutions/:id/decision` — customer approves or rejects a reserved vendor substitution.
- `POST /api/vendor/orders/:orderId/lines/:lineId/substitution` — assigned vendor proposes a same-location alternative with reserved stock and reason.
- `GET /api/admin/order-operations` — platform operational history for cancellations, substitutions, SLA cases and timeline.
- `POST /api/admin/fulfilment-sla/:id/resolve` — reasoned operator resolution of a fulfilment SLA case.

Higher-priced substitutions are intentionally rejected by this flow; changing the customer payable requires a separate payment/consent path rather than a silent vendor edit.


## Trading hours, pickup/advice windows and fulfilment coverage — Build 0.18

Public/customer:
- `GET /api/vendors/:vendorId/availability` — current open/closed state, governed schedule when configured, next pickup windows and non-price fulfilment zones.
- `GET /api/products/:variantId/advice-windows?postcode=23100&durationMinutes=30` — fair/sticky local adviser assignment plus bookable windows inside the assigned shop's calendar.
- `GET /api/catalog?...&open=1` — optional open-now filter after canonical relevance and fair local assignment.
- `GET /api/delivery/quote` now rejects a vendor/mode/postcode combination that is outside that merchant location's fulfilment coverage before applying a delivery-price rule.
- Cart responses expose `deliveryIssues` / `checkoutBlocked` when the selected fulfilment mode cannot serve one or more assigned merchant lines; checkout independently revalidates serviceability.

Vendor owner:
- `GET /api/vendor/operations-config` — own location schedule, current open state, pickup windows, local-delivery prefixes and shipping state.
- `PUT /api/vendor/operations-config` — update all seven weekday schedules plus dated exceptions and fulfilment coverage; requires `vendor.manage`, vendor scope and CSRF, and writes an audit event.

Platform operations:
- `GET /api/admin/local-operations` — configured merchant locations, current opening state and service zones for authorized fulfilment operations.

Delivery coverage is an eligibility/serviceability concern, not a price rule and not a Fair Vendor ranking boost. A merchant outside the requested delivery context is ineligible for that context; eligible merchants are still rotated by the fairness engine rather than by price.


## Multi-location and capacity operations — Build 0.19

Vendor owner:
- `POST /api/vendor/locations` — add an owned storefront/fulfilment point; requires `vendor.manage` and CSRF. The first location remains the default primary unless a governed primary change is made.
- `GET /api/vendor/operations-config` — now returns `locations[]`, with each location's schedule/open state, service zones, active capacity rules and current open fulfilment count.
- `PUT /api/vendor/operations-config` — accepts `locationId`, seven-day schedule, dated `exceptions`, `localDeliveryPrefixes`, optional `localDeliveryRadiusKm` + coordinates, `shippingEnabled` and `maxOpenFulfilments` so one owned location is updated at a time.

Public/vendor profile:
- `GET /api/vendors/:vendorId` includes the merchant's active `locations[]`; canonical-product assignment remains one merchant opportunity even when several locations offer the same variant.

Platform operations:
- `GET /api/admin/local-operations` returns one row per location including primary flag, service zones, capacity rules and current open fulfilments.

Capacity is an explicit eligibility gate. It does not increase Fair Vendor target share and it is not derived from price, paid plan or conversion performance.


## Customer personalization and privacy — Build 0.22

Customer-scoped personalization:
- `GET /api/account/saved-products`
- `POST /api/account/saved-products/:canonicalVariantId` — CSRF protected.
- `DELETE /api/account/saved-products/:canonicalVariantId` — CSRF protected.
- `GET /api/account/saved-vendors`
- `POST /api/account/saved-vendors/:vendorId` — CSRF protected.
- `DELETE /api/account/saved-vendors/:vendorId` — CSRF protected.
- `GET /api/account/recently-viewed`
- `DELETE /api/account/recently-viewed` — immediately clears history.
- `GET /api/account/personalization-preferences`
- `PUT /api/account/personalization-preferences` — independent `recommendationsEnabled` / `recentlyViewedEnabled`; disabling recent history clears it and stops future recording.

Saved-product engagement — Build 0.23:
- `GET /api/account/saved-product-alerts` — own saved-product alert preferences plus emitted transition history, enriched only with public platform price/availability.
- `PUT /api/account/saved-products/:canonicalVariantId/alerts` — CSRF protected; product must already be saved. Supports `backInStockEnabled`, `priceDropEnabled` and integer-cent `minimumPriceDropMinor`. The update re-baselines current public availability/price.
- `GET /api/account/recommendations?limit=6&postcode=23100&locale=el|en` — returns canonical-product recommendations only when recommendations are enabled. Results include localized explanation text and use brand/category diversity caps; each displayed local partner is still assigned separately through Fair Vendor Exposure.

Alert events observe only Buy Local Sparta's public platform retail price and public canonical availability. Hidden supplier purchase prices, vendor conversion and paid-plan data are never used. Un-saving a product removes its alert preference; privacy deletion/account closure clear all saved-product alert preferences.

Saved-search demand alerts — Build 0.24:
- `GET /api/account/saved-searches` — customer-owned saved searches plus current-result/new-match state.
- `POST /api/account/saved-searches` — CSRF protected; saves query/filter context and baselines current canonical matches.
- `PUT /api/account/saved-searches/:id` — CSRF protected; enable/disable alerts or update supported preference fields. Re-enabling re-baselines current matches.
- `DELETE /api/account/saved-searches/:id` — CSRF protected; removes the customer-owned saved search.

Saved-search matching uses canonical search results only. A later supplier offer for an already-known canonical product does not create a new-product alert merely because the hidden fulfiller changes. The search engine also requires lexical/identity relevance for non-empty queries before availability/advice boosts are considered, so zero-result demand remains truthful.

Privacy/account rights:
- `GET /api/account/privacy` — own privacy-request state, personalization counts and reasoned retention snapshot.
- `POST /api/account/privacy/export` — CSRF + abuse limit; returns a structured customer-owned JSON export and records a completed export request.
- `POST /api/account/privacy/deletion` — CSRF + abuse limit; opens a deletion request and immediately erases non-essential personalization/optional external-message preferences.
- `POST /api/account/privacy/close` — CSRF + explicit `confirmation=CLOSE`; consumer-only self-service closure, session revocation and account pseudonymization. Business/staff identities require governed offboarding.

Platform privacy operations:
- `GET /api/admin/privacy-requests` — requires `privacy.read`.
- `POST /api/admin/privacy-requests/:id/processing` — requires `privacy.manage` + CSRF.
- `POST /api/admin/privacy-requests/:id/complete` — requires `privacy.manage` + CSRF; records retention/outcome and uses partially-completed state when records remain for documented reasons.

The development retention snapshot is deliberately descriptive, not a final legal retention schedule. Exact periods and deletion exceptions remain subject to Greek legal/accounting/privacy review before launch.
