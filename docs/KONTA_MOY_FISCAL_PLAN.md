# KONTA MOY FISCAL — independent invoicing and fiscal-service plan

**Document date:** 2026-10-10  
**Status:** Approved product direction / implementation roadmap; **not** evidence of deployment, certification or legal authorization.  
**Product entry:** `/timologio`  
**Dedicated operations:** `/timologio-admin`  

## Product boundary

KONTA MOY FISCAL is intended to be an **independently usable and separately licensable fiscal product**, with optional seamless integration into the KONTA MOY marketplace. It is **not** merely a relabeling of the marketplace Admin Tax Control Center. An external business must be able to use FISCAL without having a KONTA MOY storefront, vendor agreement or marketplace order.

Parallel product tracks, sharing one governed core rather than four duplicated tax engines:

| Track | Intended scope | Key acceptance questions |
| --- | --- | --- |
| B2C | Retail receipts, returns/credits and consumer document delivery | Which lawful Greek fiscal issuance route applies per sale/channel? |
| B2B | Invoices, counterparty profiles, payment/credit notes and reconciliation | Which myDATA classifications, tax rules and issuer identities apply? |
| B2G | Public-sector invoice exchange and document status tracking | Which national/European B2G network, formats, identifiers and authorized intermediary are required? |
| POS | In-person transactions, terminal/payment evidence, refunds and receipt handoff | How are relevant POS–fiscal integration and provider certification obligations met? |

Do not assume that AADE myDATA ERP transmission, a POS adapter or a rendered PDF by itself constitutes lawful issuance for every channel. Any software/service certification, provider status, third-party licensing or government registration must be verified with Greek counsel, an accountant and the appropriate authorities/providers **before production claims or activation**.

## Existing KONTA MOY assets to reuse

The repository already contains meaningful foundations:

- `packages/aade-mydata/`: AADE ERP transport, XML, classification preflight, reporting and reconciliation primitives.
- `/admin/tax` and `/admin/finance/mydata`: marketplace tax configuration, approved accounting-policy workflow, VAT profiles, series, fiscal preparation, transmission/reconciliation and document delivery.
- `apps/web/src/lib/admin-tax-policy-runtime.ts`, `apps/web/src/lib/admin-fiscal-preparation.ts`, `apps/web/src/lib/admin-fiscal-reconciliation-runtime.ts`: existing bounded marketplace-side fiscal orchestration.
- PostgreSQL persistence/migrations, vendor/organization identity, tenant-scoping principles, signed sessions, CSRF, audit and provider-safe retry practices.
- Marketplace checkout/order/payment/returns signals for **optional** marketplace-to-FISCAL integration.

See `docs/admin-tax-control-center.md`, `docs/MYDATA_ERP_RUNBOOK.md`, `docs/DECISIONS.md` and `docs/LEGAL_TECH_GATE.md`.

**Verified repository gap as of this document:** the inspected `main` source tree did not yet contain `/timologio` or `/timologio-admin` route trees. Existing fiscal and tax integrations do **not** prove this standalone product has been built or deployed.

## Access and tenancy

- `/timologio`: independent business login, organization onboarding, issuer tax identity, document creation/management, reconciliation, contacts, imports, API keys, subscription/billing and staff roles.
- `/timologio-admin`: dedicated FISCAL operations, tenant lifecycle, support (audited), compliance/configuration, provider health, usage and billing; scoped permissions must not expose marketplace Admin customer/vendor data.
- Preserve the existing KONTA MOY **super Admin credentials** as a separately authorized platform-level access path. Reuse identity primitives but do **not** copy root privileges to ordinary FISCAL operators or tenants.
- Enforce tenant identity server-side on **every** query/action, with PostgreSQL RLS or equivalently restrictive verified row-policy scopes; use explicit audit records for cross-tenant support access.
- Separate legal issuer identity, series, fiscal environment, credentials and signing/provider configuration per tenant. Do not allow a marketplace seller identity or AADE secret to leak between tenants.
- Keep FISCAL independently functional if KONTA MOY marketplace checkout is unavailable.

## Shared fiscal engine and document lifecycle

Build around a reusable `fiscal-core` domain with versioned schemas and auditable state transitions:

1. Capture issuer/counterparty, currency, line-level taxable values, VAT and source event.
2. Validate a version-pinned accountant-approved policy and channel-specific requirements.
3. Reserve an idempotency key and tenant-bound document/series reference; prohibit duplicate issuance.
4. Route through the **approved** e-invoicing / ERP / FIM / retail / B2G provider for that tenant and document type.
5. Preserve request hash, provider attempt, received identifiers, acknowledgments and immutable status trail.
6. For uncertain network outcomes, **reconcile first, never blindly reissue**.
7. Handle cancellation, return, credit/debit notes and payment reconciliation as explicit linked records, without rewriting the original.
8. Deliver only legally issued/accepted documents through permissioned channels with retriable, deduplicated delivery events.

Tax policy, provider eligibility, document types, numbering and transmission schemas must be versioned; production write paths fail closed without required approvals.

## Marketplace integration

Marketplace integration should be an explicit, opt-in connector, not a hard dependency:

`marketplace order/payment/return -> signed, idempotent event/outbox -> FISCAL tenant-bound intake -> fiscal workflow -> result reference/status -> marketplace order/customer document view`

This bridge must map seller/issuer identity correctly and avoid issuing the same transaction through both the legacy marketplace fiscal workflow and FISCAL. During migration, feature flags and reconciled routing ownership decide the authoritative issuance path. The marketplace remains responsible for checkout, order management and customer permissions; FISCAL becomes responsible for its own fiscal ledger and provider actions.

## Proposed implementation order (parallel product tracks)

- [ ] **Boundary & inventory:** identify reusable code and extract shared domain contracts; record all existing tax issuer/series assumptions.
- [ ] **Tenancy & identity:** standalone organization accounts, FISCAL role matrix, super Admin delegation, audited support and tenant isolation tests.
- [ ] **Core fiscal state:** tenant-scoped documents, lines, series, policy revisions, provider attempts, reconciliation and immutable audit.
- [ ] **Four vertical adapters:** B2C, B2B, B2G and POS workstreams progress in parallel behind the same core contract; each carries an independent activation gate.
- [ ] **`/timologio` UI:** responsive user-facing document flows, customer/supplier directory, reports and billing.
- [ ] **`/timologio-admin` UI:** separate operator dashboard with health, tenants, provider status, support and usage, preserving KONTA MOY super Admin capability.
- [ ] **Marketplace connector:** outbox/event bridge, migration flags, no-double-issuance proof, order/return reconciliation and customer document links.
- [ ] **Commercial licensing:** external tenant onboarding, entitlements, metering, subscriptions, cancellation, retention and export.
- [ ] **Production verification:** accountant/legal sign-offs, provider credentials and certification decisions, security/tenant-isolation tests, test-to-live issuance scenarios, support runbooks and rollback plan.

## Release and compliance gates

Before describing a track as production-ready, retain evidence for: legally permitted issuer/provider/channel; fiscal policy sign-off; receipt/invoice correctness; tax/AADE/B2G interoperability; applicable POS interface/certification; sandbox and real-provider acknowledgment/reconciliation; tenant isolation; duplicate prevention; immutable numbering/status; refund/credit workflows; data protection, deletion/retention, support access and incident handling.

Never store API keys, customer tax data, contact lists or raw production documents in this Markdown file or commit them to the repository.

## Documentation and verification discipline

This is a **requirements and architecture plan**, not a completion report. Mark each checkbox complete only after code, migrations, automated tests, deployed routes and retained provider/compliance evidence are reviewed. Any mismatch between live operational status and code in `main` must be noted explicitly rather than silently assumed.
