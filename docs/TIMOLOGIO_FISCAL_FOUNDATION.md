# KONTA MOY FISCAL — independent-service foundation (9 October 2026)

## Product boundary

- Public portal: /timologio
- Independent merchant authentication: /timologio/login
- Controlled merchant onboarding: /timologio/register
- Authenticated merchant workspace: /timologio/dashboard
- Dedicated provider operations: /timologio-admin
- Dedicated operations login: /timologio-admin/login
- Business application review transition: /timologio-admin/api/accounts
- No marketplace-only account is required to register for FISCAL.
- Existing marketplace \`super_admin\` credentials grant *audited supervisory access* via the existing platform session. Other platform Admin roles have **no** implicit access.
- Fiscal-specific staff are independent users with the \`fiscal_admin\` role; role provisioning must only occur through secured operator processes, never public registration.

## Database / isolation

The service requires an independently provisioned PostgreSQL database through \`FISCAL_DATABASE_URL\`; no marketplace fallback is allowed. Never configure \`FISCAL_DATABASE_URL\` to point to the marketplace database, even with another database user. Run \`node scripts/fiscal-migrate.mjs\` against the dedicated database after backups and access control review. Migrations are isolated in \`fiscal/migrations\` and not part of the marketplace migration chain.

The initial PostgreSQL schema covers businesses, merchant identities and membership, revocable sessions, auth-rate limiting, non-fiscal document intakes, and append-only audit evidence.

Database connection isolation is NOT runtime/deployment isolation. Separate Vercel project (or other independent deployment), isolated secrets/network access, standby/recovery drills, RLS/least-privilege database roles, independent monitoring, and ISO 27001 evidence remain required before onboarding real fiscal production traffic.

## Activation switches

- \`FISCAL_DATABASE_URL\` (required for runtime beyond public landing).
- \`FISCAL_REGISTRATION_ENABLED=true\` (disabled by default; do not enable before anti-abuse controls, privacy and merchant-verification process are approved).
- FISCAL fiscal issuance is deliberately unimplemented and fails closed. No B2C receipt, B2B invoice, B2G invoice, or POS fiscal action is claimed legally issued.

## Existing assets intentionally reused

- Existing marketplace session authorization for \`super_admin\` only.
- Existing UI/Next.js infrastructure and responsive design practices.
- Existing AADE myDATA adapter, tax policy, digital movement and reconciliation modules are architectural inputs to the future provider engine — not directly enabled against merchant business accounts.
- No cross-database query, shared authentication token, borrowed AADE credential or marketplace tax-document status is silently reused.

## Parallel certification tracks

B2C, POS/All-in-One, B2B and B2G are developed against one Fiscal core, but retain distinct approval/test gates. A later standalone API service will provide tenant-scoped draft intake and certified issuance only after the lawful regulatory scope, signing/authentication, document archive, fiscal series, recovery and official interfaces are proven.

Marketplace connector contract (not yet live): authenticated OAuth/client credentials, issuer-to-merchant authorization, explicit seller-of-record for each order, idempotent external ID, signed event/webhook acknowledgement, tenant scope, independent reconciliation. The marketplace must never connect directly to the Fiscal database.

## Security backlog (before general availability)

1. Independent deployment, dedicated cloud resources, least-privilege DB roles, row-level security, backups and monitored recoverability.
2. Double-verified identity onboarding, email verification, abuse prevention/CAPTCHA, operator MFA and role approval/revocation.
3. Fiscal policy/catalogue for all eligible document types; approved software certification and certification evidence.
4. Provider-grade immutable fiscal store, hash chains, cryptographic authenticity, official retrieval/verification API, retention and EU data residency.
5. Independent integrations for POS, B2G/Peppol/Greek CIUS, myDATA provider APIs and the optional marketplace connector.
6. Full integration, penetration, performance, resilience and fiscal certification test suites.

## Smoke validation

- Without FISCAL_DATABASE_URL, registration/login return service-unavailable and no marketplace DB is touched.
- An existing active KONTA MOY super_admin can access /timologio-admin using the existing session; a platform finance/research user cannot.
- A regular fiscal merchant can access only /timologio/dashboard and its own member-linked organizations.
- Fiscal operators have a separate credential system.
- Review action requires same-origin, CSRF, a permitted operator role, an atomic pending_review transition and an append-only audit row.
- Every fiscal issuance path must remain impossible until lawful certification gates and real provider backend exist.


## Milestone 3 — four-track internal certification workboard

At `/timologio-admin/compliance`, the dedicated FISCAL Admin can view the 24 seeded engineering requirements grouped by core, B2C, POS, B2B and B2G. The data belongs exclusively to the FISCAL database and is initially read-only. All authority-approval indicators are explicitly false, cannot be marked approved by the current schema and never influence document issuance.

This is a technical planning register, not a substitute for formal AADE, All-in-One or Peppol approvals.


## Milestone 4 — independent seller identity pairing

See `docs/TIMOLOGIO_MARKETPLACE_PAIRING.md` for the vendor/Fiscal-owner dual-consent protocol, ten-minute one-time pairing codes, HMAC-signed server-to-server confirmation, verified AFM enforcement, revocable links and draft-connector link-state checks. No marketplace order worker has been connected to the FISCAL engine. The full certified provider, KYB and production authorization tracks remain pending.


## Fiscal database RLS and Data API isolation

`0006_fiscal_private_tables.sql` enables RLS for every existing public-schema Fiscal table and revokes direct Data API grants from `PUBLIC`, `anon` and `authenticated` roles where present. No browser-side Fiscal table policies are provided; the product interfaces use the authenticated server services. The dedicated CI smoke test verifies the RLS bit for all matching tables. New migrations must enforce the same policy.

Running the Fiscal application under a least-privilege database role, rather than a general database owner, remains a release gate. Review Supabase exposed schemas and default privileges before deployment. Do not route client-side Supabase JS directly to the Fiscal database.

## Milestone 7 — authenticated merchant draft inbox (staging only)

At `/timologio/drafts`, an authenticated FISCAL merchant can review the non-fiscal drafts belonging to their own organization membership. The standalone app exports the same page, and the merchant dashboard links to it.

- Tenant authorization is enforced in each read query by joining `fiscal_memberships` on both the user and selected organization, plus the active-user check. A manipulated `organizationId` cannot reveal another tenant's records.
- Every query is limited to 26 rows, rendering 25 at a time, with a stable `created_at,id` cursor; no all-documents scan is loaded into the page.
- Merchant filters cover B2C, POS, B2B, B2G and draft origin. Amounts and times are localized for Greece; absent amounts are not treated as zero.
- No print, send, change-status, delete, export, issue or transmit actions are available.
- PostgreSQL smoke tests verify cross-tenant denial and disjoint cursor pages. Standalone route-isolation checks require the new protected page.
- **These records remain exclusively non-fiscal test drafts; no certified issuance, regulatory approval or production launch is implied.**

## Milestone 8 — merchant console draft lifecycle (staging only)

The merchant-facing `/timologio/drafts` now supports **creating test drafts in a browser**, reviewing them in the scoped inbox, and opening `/timologio/drafts/:id?organizationId=...` to inspect sanitized fields. The standalone `fiscal/service` exposes the same private routes.

- The new `POST /timologio/api/console/drafts` rejects cross-origin calls, enforces session-based CSRF, caps JSON requests at 4 KiB, rejects unknown fields, and returns only the test draft ID and status.
- The dedicated Fiscal PostgreSQL transaction checks an **approved** organization and active owner or accountant membership under share locks before writing. Pending, rejected, suspended and unowned organizations cannot create console drafts. Viewer membership remains read-only.
- `externalId` is generated client-side for idempotent retries. The database constraint prevents duplicate console entries. Conflicting payload reuse returns HTTP 409. New inserts append actor-attributed audit events.
- The server supplies the legal issuer's VAT number from the authorized organization; the browser cannot specify another issuer. Input normalization uses the existing strict draft contract.
- The UI labels the test amount as **non-fiscal**. No itemized taxes, lawful invoice numbering, AADE/myDATA transmission, signed receipts, printing as an invoice, POS settlement, B2G submission or marketplace-order linkage has been enabled.
- Each draft-detail query rechecks tenant membership in SQL and returns only whitelisted fields. Unknown or unauthorized IDs are shown as not found.
- Fiscal CI covers the additional standalone routes, approved-only owner/accountant authorization, viewer rejection, idempotent drafts and cross-tenant detail isolation.

**Release state:** independent production database, verified merchant KYB, email verification/MFA, certified provider functionality and security approvals are outstanding; this milestone is for protected staging only.

## Milestone 9 — independent non-fiscal multi-line calculation preview (2026-10-10)

This milestone adds a deterministic **engineering simulator**, not a legal tax engine, inside the existing `/timologio/drafts` merchant console.

- `apps/web/src/lib/fiscal-preview-calculator.ts` contains pure, deterministic, BigInt-based arithmetic for 1–30 lines with EUR minor-unit prices, fixed three-decimal quantities, user-specified VAT basis points and percentage discounts.
- Calculation order is: quantity × VAT-exclusive unit price (round half-up to cents), minus rounded line discount, plus rounded line tax; line results are summed without a second invoice-level recomputation. All inputs are strict bounded integers after parsing and reject extra fields. Maximum total: €10 billion in minor units.
- It does **not** infer a lawful VAT rate from product category, KAD, domestic/international supply, exemptions, geography, recipient or public procurement rules. No rate here represents regulatory approval.
- The authenticated, CSRF-checked `POST /timologio/api/console/preview` exposes calculations; accepts ≤16 KiB, never stores requests, never contacts the marketplace or AADE, and always returns `issuanceEnabled:false` and `legalTaxClassification:false`.
- A responsive client workbench supports up to 10 editable example lines, shows server-computed net/tax/discount/gross, and may **copy gross only** to the draft intake form. It does not persist calculation lines, imply legal VAT coding, sign invoices or populate myDATA fields.
- The separate `fiscal/service` route tree explicitly exports this endpoint. Dedicated CI runs the calculator unit tests (rounding, discounts, abuse controls, all four lanes, forbidden metadata and size caps), typechecks the complete app, verifies route isolation and builds the independent service.
- This remains a staging-only **calculation preview**, not a customer billing, POS, B2G, Peppol, tax-engine or official invoicing feature.

Production requires an independently reviewed tax-rule/versioning catalogue with dated legal evidence, counterparty identification, document semantics, corrections/credit notes, legal rounding specifications, certifications and external integration test evidence.
