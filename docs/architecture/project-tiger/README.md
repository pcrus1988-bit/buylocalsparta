# Project TIGER — KONTA MOY Universal Engines
Version: 0.1 (architecture proposal; not an activation certificate)  
Initiated: 2026-10-22  
Repository: `pcrus1988-bit/buylocalsparta`

## Mission
Make KONTA MOY a universal Greek discovery, booking, purchasing and service-fulfilment platform by composing governed reusable engines rather than duplicating transactional logic for each vertical.

**Contract:** build every generic capability once; retain specialized category policy and branded experiences; protect existing product commerce and tenant isolation.

## What was actually inspected for this proposal
- `packages/core/src/{catalog,commerce,inventory,jobs,finance,auth,vendor}` provides existing domain seams. Stock `StockReservation` and payment/order types already exist.
- `apps/web/src` contains the marketplace experience; `db/migrations` contains PostgreSQL evolution.
- `fiscal/service` is a separately deployable FISCAL entrypoint with a distinct fiscal database requirement; its sources are currently re-exported from the web application.
- `docs/ARCHITECTURE.md` defines modular-monolith, immutable-migration, tenant/RLS, outbox, idempotency and money invariants.
- `docs/FISCAL_API_V1.md` describes a test-only draft API, **not** proof of legal issuance.
- `docs/architecture/vendor-operating-model.md` preserves managed Sparta semantics during expansion.
This is a **repository inspection, not a successful production, security, finance or regulatory acceptance test**. Documentation may lag deployed code.

## Target architecture
`Visitor intent -> Universal discovery -> Offering resolver -> Policy/eligibility -> State-machine orchestrator -> Capability adapters -> authoritative domain stores -> audited outcome`.

TIGER is initially a **logical engine registry** inside a modular monolith, not a blanket microservices migration. Separate runtime/security boundaries are kept when justified (notably FISCAL).

### Engine registry — proposed owners and authoritative stores
| ID | Engine | Logical owner | Source of truth / boundary | Initial disposition |
|---|---|---|---|---|
| E01 | Identity & Accounts | identity | auth/session/roles and consent | reuse + extend across apps |
| E02 | Provider & Business | providers | verified business, locations, staff | reuse vendor; add service-provider facets |
| E03 | Universal Catalogue | catalogue | canonical identity, offering references, approved provider offers | extend; do not collapse product variants |
| E04 | Search & Intent | discovery | search projections and versioned intent rules; **never** authoritative stock | extend |
| E05 | Geography & Eligibility | eligibility | location rules, scope and category restrictions | extend |
| E06 | Inventory & Availability | availability | stock balances, resource calendars and capacity reservations | reuse stock, add time/resource domain |
| E07 | Booking & Scheduling | booking | resource slot holds and confirmed reservations | new governed capability |
| E08 | Pricing & Quotations | pricing | money snapshots, quotes, rate rules and validity | extend |
| E09 | Order & Contract | commitments | consumer orders, accepted quotes, contracts and commitments | extend, respect seller-of-record |
| E10 | Payments & Settlement | payments | PSP-verified transaction + reconciled ledger and payout records | extend, no simulated capture |
| E11 | FISCAL | fiscal | separate fiscal issuer/document lifecycle and compliant channel evidence | integrate behind trust boundary |
| E12 | Fulfilment & Dispatch | fulfilment | delivery jobs, pickup/shipment/service-completion proofs | extend |
| E13 | Communication | messaging | consent-aware message intents, delivery attempts and suppression | consolidate |
| E14 | Aftercare | aftercare | returns, cancellations, claims, disputes and adjustments | extend |
| E15 | Workflow Orchestrator | orchestration | durable workflow states, step events and compensation log | new shared coordination layer |
| E16 | Integration Gateway | integrations | vetted connector credentials, mappings, verified callbacks | consolidate |
| E17 | Trust & Reputation | trust | verification, eligible reviews and abuse evidence | extend |
| E18 | Subscriptions & Entitlements | entitlements | contracted plan rights and commissions | extend |
| E19 | Governance & Compliance | governance | policies, permissions, retention, audit and regulated-category gates | enforce across engines |
| E20 | Analytics & Intelligence | analytics | privacy-governed observational aggregates | extend; never shortcut operational truth |

**Registry record minimum:** `engine_id`, semantic `contract_version`, accountable code owner (to assign), interface location, data ownership, supported operations, emitted/consumed events, required roles/entitlements, tenant scope, dependent engines, failure semantics, evidence URL, feature flag, `maturity` (`proposed | implemented_unverified | verified_staging | verified_production`). All initial maturity flags must be assessed, not assumed from files.

## Universal Offering v0 — a new *index and policy facade*, not a replacement
Existing `canonical product -> variants -> vendor offers` survives intact. Physical offerings **reference** those existing identities and existing checkout. Services and rentals add separate source records and policy schemas. The offering resolver produces the required journey; it is not itself stock, booking, payment or tax authority.

Suggested fields:
- `id`, `schema_version`, `offering_type`, `provider_id`, `market_id`, optional `location_ids`, `publication_status`
- typed `source_ref`: `canonical_variant`, `service_definition`, `rental_asset`, `reservation_inventory`, `digital_licence`
- `pricing_model`, `currency`, `fulfilment_modes`, capability declarations and policy version
- policy links: eligibility, cancellation, booking, deposit, tax/issuer assessment, trust requirements
- versioned discovery summary; immutable commercial snapshots when a commitment occurs

Avoid independent booleans such as `requires_fiscal: true` that falsely imply fiscal law can be determined solely from offer type. Persist a **policy decision** with issuer, place/time of supply, customer/transaction facts, legal channel and evidence where required. No live capability is enabled just because a declaration exists.

## Engine interaction contract (proposed)
An engine command receives:
`actor_context {user_id, business_id?, role, market_id, location_id?, purpose}`;
`command_id` and `idempotency_key`; `correlation_id`; `offering_id`; `offering_version`; and validated typed inputs.

Responses have one of `accepted | rejected | pending_verification`, a stable authoritative reference if accepted, and an explicit versioned failure code. Use integer EUR cents or existing Money type, never float amounts.

Event envelope: `event_id`, `event_type`, `event_version`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `occurred_at`, `tenant_scope`, `correlation_id`, `causation_id`, minimal redacted payload. Emit via transactional outbox. Consumers dedupe by event ID and command key; delivery is at least once, not exactly once.

**Hard invariants**
1. No cross-tenant reads or writes; RLS and service authorization both apply, including apps and workers.
2. Only Availability can attest to stock/capacity; only Booking can confirm a slot; only PSP verification can attest to payment; only FISCAL can attest to issued document status.
3. Search/AI/UI may recommend/prepare actions but cannot manufacture success states or bypass hard eligibility.
4. Availability holds are atomic against the resource and expire safely; overlapping active confirmed booking and held allocations cannot exceed capacity.
5. Commands are idempotent; unknown PSP/provider results are reconciled before retry; no blind duplicate captures, fiscal issuance or merchant payouts.
6. A booking and a product stock reservation are different aggregates. Never reuse quantity-based stock semantics as time-range capacity without dedicated constraints.
7. External events are signed/authenticated, replay protected and traceable. Personal/health data is purpose-scoped and minimized.
8. Payment settlement parties, contractual seller, supplier and fiscal issuer are **independently resolved**.
9. Preserve live product checkout, vendor fairness, fulfillment, consent and subscription behavior through parallel routes and flags.
10. Schema changes require backup/restore readiness, additive migrations, reversible rollout strategy, health/latency and data-integrity acceptance.

## First composed workflows
**A. Book hair appointment (no prepayment)**: verified provider/service -> coverage/eligibility -> Availability atomic time hold -> Booking confirm -> notification. FISCAL only on legally relevant event.

**B. Prepaid appointment**: available slot -> time hold with TTL -> PSP payment intent and authoritative verification -> Booking confirm (or compensate/reconcile on failure) -> appropriate fiscal lifecycle -> communications. Regulatory and capture/hold ordering is vertical-specific.

**C. Quote-based plumber**: location eligibility -> enquiry -> immutable quote version and expiry -> customer acceptance -> service order -> resource booking -> completion attestation -> PSP/ledger as applicable -> fiscal workflow.

**D. Buy shoes**: existing catalogue/fairness -> existing inventory reservation -> existing checkout/payment -> existing fulfillment and fiscal policy. TIGER must not change this path by default.

## Delivery sequence and testable exit gates
### TIGER-0 — inventory and safety baseline
- Catalog owner, source code, actual database, existing endpoints, events, environment, production evidence and version for each engine.
- Read-only production performance and schema checks; prove **restorable backup** before any DDL.
- Add feature flags and a CI contract-test plan; existing storefront performance and RLS regression tests green.
- **Exit:** documented registry with named accountable owners, confidence and evidence; no assumed production claims.

### TIGER-1 — Offering resolver (shadow/read-only)
- Implement `Offering v0` reference model and schema validation; map canonical variants to offering IDs without mutating the product model.
- Use a projector/backfill with dry-run, counts, diffs and rollback. No dual-write or checkout routing in v0.
- **Exit:** stable deterministic resolution, legacy product parity, privacy tests, no unapproved public exposure.

### TIGER-2 — Resource Availability + Booking
- Staff/resource schedules, IANA timezone, Greek DST handling, holiday/exceptions, buffer periods, cancellation windows, atomic holds with DB overlap/capacity constraints, expiration and audit.
- Provider-only writes; read public slots safely with PII minimization; Google/other calendars are advisory adapters, not booking authority.
- **Exit:** concurrency tests confirm no double-booking; safe retry/cancel/reschedule/expiry and stale-revision handling; synthetic E2E on staging.

### TIGER-3 — Quotes + service commitments
- Versioned quotes, expiry, acceptance signature/evidence, deposits, cancellable appointments, fulfilment attestation, dispute paths.
- **Exit:** end-to-end plumbing quote flow in staging without simulated payment or fiscal success.

### TIGER-4 — Authorized payment + FISCAL coupling
- Document per-business PSP eligibility/settlement authority, verified events, legal issuer and compliant document channel.
- **Exit:** staging-to-production activation per provider/vertical only with evidence for payment, refund, idempotency, reconciliation, fiscal document and credit document.

### TIGER-5 — Universal discovery/orchestration
- Route typed intent into authoritative capabilities. Personalize with permitted events/consent; provide explanations and fallbacks.
- **Exit:** accuracy, latency, regression and privacy review; AI cannot force transaction outcomes.

## Ownership decisions pending
- Assign technical DRI and security reviewer for every registry entry.
- Decide single shared account identity vs tenant-scoped SSO for each current app.
- Approve legal seller-of-record and fiscal issuer maps by vertical and checkout route.
- Set per-engine SLO, isolation and data-retention policy; then prioritize booking pilot categories.

## Change-control rule
No new KONTA MOY vertical may introduce a second booking, payment, fiscal, identity or notification implementation without a recorded architecture exception. Do not make new engines mandatory for existing marketplace flows until explicit parity and safe rollout gates pass.
