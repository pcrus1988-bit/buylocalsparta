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

## Milestone 10 — persisted itemized non-fiscal test drafts (2026-10-10)

- Database migration `0009_nonfiscal_line_snapshots.sql` introduces `fiscal_document_intake_lines` for up to 30 items per document; every line holds a frozen description, milli-quantity, minor-unit price, user-supplied simulated tax/discount basis points, and server-computed amounts.
- Composite `(organization_id,draft_id)` foreign keys enforce tenant identity at database level. All lines belong to a parent test draft; standalone primary keys and arithmetic CHECK constraints prevent accidental data inconsistency. The table has RLS enabled, PUBLIC/anon/authenticated privileges revoked, and UPDATE/DELETE prohibited by append-only triggers. Existing total-only drafts remain readable.
- The test draft POST accepts optional `items` with a 16 KiB request bound. Each item is **recalculated on the server**, and its sum must match `grossMinor`; the user cannot force a different total. The transaction holds the approved-business membership lock through parent insert, all line inserts, and append-only actor audit.
- A payload SHA-256 digest includes all calculated items, ensuring repeated external IDs cannot silently attach different lines or amounts. Failed validation/line insertion rolls back the entire transaction.
- The merchant form transfers validated calculator lines, not merely the gross figure; editing the gross figure removes the pending item snapshot. The details page shows a read-only, tenant-scoped, line-item breakdown with net/discount/simulated VAT/gross, while explicitly disclaiming tax-law validity.
- Dedicated CI regression tests inspect RLS, tenant FK constraints, line immutability, arithmetic checks, and item authorization, in addition to TypeScript, schema, route and standalone build checks. The health endpoint requires migration `0009` before returning foundational readiness.

**Limitations:** These are laboratory snapshots, not a lawful invoicing ledger. They do not implement invoice numbers, tax exemptions, counterparty verification, legally determined VAT, myDATA/AADE submission, POS settlement, e-invoicing network access, immutable issuance events or certified signatures. Staging-only; production remains blocked.

## Milestone 11 — independent B2B / B2G test counterparty register (2026-10-10)

- New `0010_test_counterparties.sql` migration creates a **non-fiscal**, append-only, tenant-isolated registry of synthetic business and public-body counterparties. Natural-person profiles are deliberately excluded. Every entry is `unverified`; a nine-digit test VAT field is a format constraint, **not** an AADE/GEMI/VIES check.
- RLS, access revocations for PUBLIC/anon/authenticated, an append-only trigger, tenant/kind/VAT uniqueness, and a bounded organization-first index protect the test registry. Creation is authorized in the same database transaction as the audit event, after checking active merchant ownership/accountant membership and approved organization status.
- `/timologio/counterparties` and `POST /timologio/api/console/counterparties` are available from the standalone, SSO-protected application. The form accepts synthetic business/public-body examples only; the API enforces session, same-origin, CSRF, request bounds and a strict whitelist. Bounded reads use SQL membership joins (up to 100 entities).
- Merchant B2B and B2G test drafts can select a registered counterparty. The draft creation transaction checks the **same organization** and corresponding kind (`business` for B2B and `public_body` for B2G), locking the selected immutable row and embedding an unverified identity snapshot into the test draft digest and payload. B2C/POS reject this association. Legacy and counterparty-free drafts remain valid **test drafts** but are flagged incomplete.
- Draft details expose the frozen identity snapshot with prominent non-verification and non-fiscal warnings. This does not create a customer ledger, know-your-customer verification, live VAT validation, public procurement identifiers, B2G recipient metadata, Peppol endpoints, or a legal tax document.
- Dedicated CI asserts registration uniqueness, cross-tenant lookup denial, wrong-kind lookup denial, RLS, mutation refusal, and independent app route isolation. The health endpoint now requires migration `0010`.

**Caution:** synthetic test entities only. Do not enter real customers or personal data into protected staging. A separately planned production-grade counterparty registry will need GDPR retention/correction/deletion procedures, legal identity verification, public-sector routing identifiers, accessibility review, and a provisioned independent FISCAL database.

## Milestone 12 — deterministic read-only test-draft preflight (2026-10-10)

The sandbox detail route `/timologio/drafts/[id]` now displays a deterministic, **read-only test data-integrity review**. No write endpoint, document status transition, regulatory approval or database migration is introduced.

- Pure engine `apps/web/src/lib/fiscal-draft-preflight.ts` operates only on the specific draft already loaded by the existing membership-scoped query. It cannot inspect other organizations, access the marketplace DB or call tax APIs.
- The review replays the independent integer/BigInt calculator against frozen item snapshots, checks each saved line amount and the draft-level net/tax/discount/gross totals, and flags malformed or missing amounts, unsupported metadata and lack of reference.
- Test completeness rules flag a missing B2B/B2G counterparty, a mismatched business/public-body lane, an unexpected counterparty on B2C/POS, unapproved merchant organizations and lack of itemized data. Legacy amount-only drafts are reported as *incomplete*, not as corrupt, preserving compatibility.
- The result is one of `consistent_test_data`, `incomplete_test_data` or `conflicting_test_data`, and always includes `fiscalIssuanceAllowed:false`, `taxClassificationVerified:false`, `identityVerified:false`, `legalReviewCompleted:false`. Consistent test arithmetic is never presented as legal eligibility or a certified invoice.
- The Greek detail page shows actionable field discrepancies and keeps a prominent non-fiscal warning. The evaluator does **not** persist a score/status or change existing immutable audit trails.
- Dedicated CI runs `fiscal-draft-preflight.test.ts` including line tampering, corrupt subtotals, missing reference/counterparty/lines, wrong lane, spoofed `verified` identity, absent amounts, pending merchant and zero-valued simulations; full TypeScript, DB and standalone Next.js checks remain in place.

Outstanding independent DB provisioning, certified provider workflow, correct Greek tax law determinations, regulator approvals, actual identity checks and GDPR record lifecycle remain release blockers. No production merge or live issuance.

## Milestone 13 — official regulatory research atlas & blocked tax-rule candidates (2026-10-10)

The `/timologio-admin/compliance` page now exposes the initial evidence/reference atlas, strictly behind the existing FISCAL admin authentication. Official source references are **not** verified legal classifications or archived immutable source materials.

- `0011_regulatory_source_atlas.sql` creates `fiscal_regulatory_sources` and `fiscal_tax_rule_candidates` in the separate FISCAL database only. Both have RLS, explicit PUBLIC/anon/authenticated access revocation, immutable triggers and bounded constraints.
- Official research entry points currently seeded as **reference_only**: AADE basic VAT rates (`https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/enarxi-epiheirimatikis-drastiriotitas/basikoi-syntelestes-fpa`); AADE myDATA (`https://aade.gr/mydata`); European Commission TEDB (`https://ec.europa.eu/taxation_customs/tedb/index.html`). These links were checked as public official websites on 2026-10-10, but no immutable content snapshot, page text hash, authoritative item-level classification, expert review, or version-specific legal verification has yet been stored.
- Proposed research rules have explicit candidate codes, versions, jurisdiction (GR), lane, family, subject scope, effective-date intervals, evidence provenance and optional **proposed** VAT rate. The only allowed state is `research_only`, and `fiscal_use_authorized=false` is constrained in the schema. This is a **one-way blocked state**, not a hidden toggle.
- The admin view lists source links and any stored research-only candidates, with unverified evidence warnings. There is no create/edit/approve API, no user-supplied legal authority URL, and no linkage to live draft calculations, marketplace products, myDATA, POS or B2G transmission.
- CI checks required schema/RLS, three reference-only source pointers, allowed domains, candidate version/approval prohibition, temporal interval validation, and forbidden source mutation. The FISCAL health route requires migration 0011 before operational-foundation readiness.
- Rates in AADE guidance depend on the particular good/service and applicable legislative scope, exemptions, date and special geographic rules; the TEDB database likewise requires category/context inspection. These sources must not be translated directly into automatic legal tax classifications.

For an eventual **production** engine: archive each legally operative primary text and official technical specification by hash, record effective dates and supersession, model taxable-supply facts and exclusions, secure accountant/legal approval with segregation of duties, record decision provenance, and complete provider certification. Never enable fiscal issuance based solely on this internal atlas.
