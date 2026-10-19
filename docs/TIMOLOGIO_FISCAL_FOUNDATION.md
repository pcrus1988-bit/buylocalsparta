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

## Milestone 14 — full standalone HTTP acceptance against disposable PostgreSQL (2026-10-10)

To verify the independent FISCAL application beyond TypeScript checks and direct SQL, `scripts/fiscal-http-e2e.mjs` now boots the **built production-mode FISCAL Next.js service** on localhost in GitHub Actions, using synthetic test merchant records in disposable PostgreSQL 17. It is integrated into `Fiscal Foundation CI` after the standalone production build.

- **Hard fail-closed scope:** the test script only runs when `CI=true`, `FISCAL_STANDALONE_MODE=true`, and `FISCAL_DATABASE_URL` points to localhost database `/fiscal_ci`. It cannot run against customer staging or production databases. The spawned standalone service explicitly clears `DATABASE_URL` and `POSTGRES_URL` to prohibit marketplace database access.
- It seeds two independent approved **synthetic** test companies and users directly into the disposable database. It exercises the actual `POST /timologio/api/auth` login with scrypt test passwords, validates session and CSRF cookies, denies public registration, and rejects unauthenticated, wrong-origin or wrong-CSRF requests.
- It calls the real authenticated `POST /timologio/api/console/preview`, persists an unverified synthetic business counterparty with `POST /timologio/api/console/counterparties`, and checks that cross-tenant counterparty creation is forbidden.
- It creates a B2B itemized test draft through `POST /timologio/api/console/drafts`, verifies idempotent replay, rejects mismatched calculation totals, cross-tenant draft writes and attempts to associate a counterparty from another tenant.
- It visits the actual SSR draft detail page, verifies stored line-item and counterparty presentation and the legally non-issuable preflight warning, and requires a cross-tenant request to return 404. The SQL readback checks one draft row, one line, one corresponding audit event, and **zero issued documents**.
- Finally it logs out and asserts that the revoked session can no longer use the API. Test entities are synthetic and the entire GitHub Actions PostgreSQL instance is disposable.
- **This is not a live staging integration test.** The protected Vercel project still requires a distinct, approved EU database, secret configuration and live staging tenant verification. Neither the two existing non-FISCAL Supabase projects nor the marketplace database may be reused. Creating a new billable Supabase project requires selection of the organization and explicit cost confirmation.

`FISCAL_REGISTRATION_ENABLED`, live marketplace synchronization and fiscal issuance remain disabled. No main merge.

## Dedicated Supabase EU project created and secured (2026-10-10)

**Actual deployed DB state, verified with the Supabase connector:** a NEW Supabase project `KONTA MOY FISCAL` (`kcpwxplxqtqdsfwlfsaa`) was created under **SP BUSINESS LAB**, region `eu-central-1` (Frankfurt), PostgreSQL 17.11. The recurring additional project fee of **$10/month** was explicitly accepted in the Supabase cost-confirmation workflow. Neither existing Supabase project nor the marketplace database was modified.

- Existing migrations `0001` through `0011` were applied atomically from the verified FISCAL draft branch, preserving source-file SHA-256 checksums in `fiscal_schema_migrations` and recording a Supabase management migration.
- Follow-up migration `0012_secure_trigger_function_paths.sql` pins `search_path=pg_catalog, public` on five SECURITY INVOKER trigger functions and revokes PUBLIC/anon/authenticated function execution.
- Verified **12 custom checksummed migrations; 18 FISCAL tables; RLS enabled on all 18; zero tables readable/writable by anon/authenticated; zero FISCAL functions executable by those roles; no merchant accounts, tax approvals or issued documents**. The 24 certification controls and three official research source pointers exist, but are **not** certifications or reviewed tax mappings.
- The Supabase security advisor's original five mutable-search-path warnings have been cleared. The remaining informational `rls_enabled_no_policy` notice is **intentional deny-all** for 18 server-only tables; do not add public Data API access or broad RLS policies to silence it.
- Supabase management migrations: `fiscal_foundation_to_0011`, `fiscal_secure_trigger_functions_0012`. Both succeeded. Always use the repo's `fiscal-migrate.mjs` checksum checks for subsequent deployments.

**Still NOT connected:** The independent Vercel `konta-moy-fiscal` project currently has no `FISCAL_DATABASE_URL` environment variable. The connector did not supply or expose a PostgreSQL password or verified pooler connection URL. Do not guess credentials, put secrets in GitHub or chat, reuse `DATABASE_URL`/`POSTGRES_URL`, or enable production/public registration. Use the Supabase project's official **Connect** panel to obtain a TLS-enabled session/transaction-pooler URI appropriate for Vercel, and store it as an encrypted server-side `FISCAL_DATABASE_URL` in the *protected staging/Preview environment only* via Vercel project settings; never prefix it with `NEXT_PUBLIC_`. See https://supabase.com/docs/guides/database/connecting-to-postgres . Redeploy only after the encrypted connection is configured, verify `/timologio/api/health`, and test with synthetic authenticated accounts before any wider launch.

FISCAL retains separate session/authentication, B2C/POS/B2B/B2G laboratory draft flows, permanently blocked legal issuance, and disabled marketplace draft synchronization. PR #1431 remains draft and KONTA MOY production remains unchanged.

## Persistent Preview connection investigation (2026-10-11)

The independent FISCAL Vercel Preview deployment `dpl_9sbu4gMQkqK67JdNSkHSz5GmKwSR` is READY, but the real `/timologio/api/health` endpoint still returns HTTP 503 `database_unreachable`. Vercel runtime logs reported only the **safe** `dns_resolution` category. The Frankfurt Supabase project remains the only authorized persistent FISCAL database. Its schema was already installed and verified; no schema or business data changes are required to diagnose DNS.

The sensitive `FISCAL_DATABASE_URL` is present only in protected Preview; do not copy or log it. Supabase documents two distinct endpoints:
- Shared Supavisor transaction pooler: Supabase **Connect → Transaction pooler** and the host copied exactly from the project, typically ending `.pooler.supabase.com`, username `postgres.<project-ref>`, port `6543`. Appropriate for IPv4 serverless runtime.
- Dedicated pooler on `db.<project-ref>.supabase.co:6543`: not interchangeable with the IPv4 shared Supavisor host; IPv6 support or a paid IPv4 add-on may be needed, depending on project configuration. Do not guess or reconstruct the host from the reference alone.

`apps/web/src/lib/fiscal-connection-diagnostics.ts` now categorizes these endpoint forms **without returning credentials, usernames or concrete hostnames**. The standalone health route includes this safe allowlisted profile in server-only logs upon a connection failure. Tests validate that no secret material can enter the classifier output. Continue to keep `FISCAL_ISSUANCE_ENABLED=false`, public registration closed and marketplace sync disabled.

The Vercel project's independent function region was requested as Frankfurt (`fra1`) to align with the EU database; check actual region in the *new deployment's runtime logs* before treating it as verified. Do not modify the marketplace application's Vercel project.

## Milestone 15 — bounded, non-posting accounting journal sandbox (11 October 2026)

- Adds a pure EUR-minor-unit balanced double-entry journal preview engine at `apps/web/src/lib/fiscal-sandbox-journal.ts`. Entries use an explicitly synthetic account vocabulary, 2–40 entries, positive bounded safe integers and exact BigInt balancing.
- Refuses unknown metadata, legal invoice/tax fields, out-of-range amounts, absent counterpart entries, mismatched debits/credits and invalid account codes. Output is always `non_fiscal_test_journal_preview` with posting, official bookkeeping, legal tax classification and fiscal issuance disabled.
- Adds `POST /timologio/api/console/journal-preview` with merchant-session requirement, same-origin validation, CSRF and 8 KiB JSON cap. In-memory only: no DB write, audit posting, AADE, POS settlement or marketplace connection.
- Merchant page `/timologio/journal` includes an editable Greek double-entry test journal, balance display and disclaimers. The dedicated service exports only its own merchant routes; the workspace dashboard links to the new workbench.
- Unit and production-mode HTTP acceptance test additions validate balanced and multi-entry cases, rejected unbalanced transactions, strict input, authentication and CSRF. Dedicated CI checks the engine and standalone route tree.

**Not implemented:** persistent accounting ledger, chart-of-accounts governance, year/period closing, accounting standards certification, VAT law, stock decrement/valuation, document numbering, myDATA mapping, live POS payments or financial statements. No database migration and no FISCAL production activation are part of this milestone.

## Milestone 16 — saved non-fiscal accounting sandbox (11 October 2026)

- Introduces two isolated PostgreSQL tables via `0013_sandbox_journal_snapshots.sql`: `fiscal_sandbox_journals` and `fiscal_sandbox_journal_lines`. Both are RLS-protected, not exposed to anon/authenticated Data API clients, and use only synthetic account codes and bounded EUR-cent values.
- Each journal has an immutable `saved_test` status, per-organization external ID, SHA-256 payload digest and a composite organization foreign key for its lines. Deferred constraint triggers require exact entry count and equal debit/credit totals at transaction commit, even if an application bug attempts to save incomplete lines.
- `POST /timologio/api/console/journal` enforces merchant session, origin, CSRF, 8 KiB JSON cap, server-side recalculation and approved owner/accountant authorization inside the write transaction. A retry with the same external ID and digest is idempotent. Conflicting payloads fail with 409. One audit record accompanies the original write.
- `/timologio/journal` provides a business picker and up to 20 recent immutable test snapshots with per-line details. Owners/accountants of approved companies may save; other authorized members can read, but cannot modify.
- Database smoke and independent Next.js HTTP tests cover tenant isolation, forged company IDs, duplicate retries, invalid/unbalanced writes, immutable lines, audit deduplication and the permanent issuance-off boundary.
- Standalone health explicitly requires migration 0013, preventing a partially migrated service from reporting readiness.

**Not legally operational:** No posted accounting ledger, tax classification, bank settlement, official chart of accounts, balances, cashflow statements, POS fiscal integration, invoices, AADE, certified retention or public onboarding. The new migration is for the separate FISCAL database only; it must be tested and applied there before the new preview is operational.

## Milestone 17 — operator-only KYB application case workbench (11 October 2026)

- From `/timologio-admin`, authorized FISCAL administrators can open `/timologio-admin/accounts/:id` inside the independently deployed service. The private, dynamically rendered case contains the organization name, AFM, status, created/reviewed timestamps, up to 25 member identities, 30 selected case audit events and counts of non-fiscal test drafts grouped by lane.
- `POST /timologio-admin/api/accounts` supports **only** `start_review`, `record_follow_up` and `reject`. It requires a valid FISCAL operator session, CSRF, exact same-origin request, strict `application/json`, a 2,500-byte body cap, validated UUID, bounded plain-text notes and rejects all extra fields. Approval, suspension, certification and issuance actions are not implemented.
- `start_review` transitions `pending_review → under_review`. Internal follow-up notes require an `under_review` case, record an immutable `onboarding.internal_follow_up_recorded` audit event and **do not** send any email or message. `reject` requires an `under_review` case and ≥20-character reason, transitions to `rejected` and appends `onboarding.rejected` in the same transaction. Invalid/concurrent status changes return 409; the database row is locked before each transition.
- Case notes are explicitly `operator_only`; the merchant dashboard does not display their contents. An operator must follow up through a separate authorized channel until a verified merchant messaging process exists.
- Node contract tests reject malformed actions, unauthorized approval, oversized notes, invalid UUIDs and unknown fields. Disposable-PostgreSQL HTTP acceptance tests cover operator login, merchant denial, CSRF and origin rejection, application detail view, note persistence, rejection, conflict/replay denial, and immutable case audit sequence. Standalone route isolation requires the new private case page to remain dynamically rendered.
- This milestone deliberately does **not** provision real merchants, verify Greek corporate ownership/AFM, issue tax documents, activate the marketplace connector or claim AADE certification. Public FISCAL registration and issuance remain disabled.


## Milestone 18 — invitation-only merchant onboarding (11 October 2026)

**Release gate:** new migration `fiscal/migrations/0014_controlled_merchant_invitations.sql` must be applied solely to the isolated FISCAL database. `FISCAL_INVITATIONS_ENABLED` defaults OFF. Public `FISCAL_REGISTRATION_ENABLED` remains OFF, and legal issuance is always OFF.

- At `/timologio-admin/invitations`, a currently authenticated Fiscal operator can create a per-email, per-AFM one-time invitation, inspect the last 30 invitations, and revoke an unused invitation. Mutations use the existing independent admin session, CSRF and same-origin checks.
- Links expire after **48 hours**. Only SHA-256 token hashes are stored in RLS-protected PostgreSQL; unique partial indexes forbid duplicate pending invitations for the same email/AFM. Identity fields and token hashes cannot change. A pending invitation can transition **exactly once** to redeemed or revoked, without hard deletion. Events are append-only and actor-attributed.
- The invitation link is revealed exactly once to the operator. Automatic sending is intentionally NOT implemented. The operator must manually deliver it via a separately verified, trusted channel. The secret is transmitted as an HTTPS **fragment**, not as a request path, query parameter, Referer or CDN access log entry; the recipient form removes the fragment from the address bar immediately.
- `/timologio/invite` lets the holder set a new password. The server ignores any customer-provided legal name, AFM or email; it uses only the values bound to the one-time token. After validating the token, the transaction atomically creates a restricted merchant login, a `pending_review` organization, an owner membership, an immutable redemption audit event, and consumes the token.
- The response explicitly reports `emailVerified:false`, `identityVerified:false` and `issuanceEnabled:false`. Neither link possession nor operator-entered AFM is sufficient to establish legal representation or KYB. Existing restrictions deny non-approved companies invoice draft creation or fiscal issuance.
- Unauthorized admin creation, forged actions and payload fields, unauthenticated public registration, cross-origin redemption, stolen/replayed/expired/revoked tokens, abnormal password length and forged organization identity are rejected. Tests run with ephemeral PostgreSQL and independent Next.js HTTP servers.

**Before using for a real company:** complete the privacy notice and business-onboarding documentation, verify the invitation recipient via a trusted channel, verify representative/AFM ownership and business registration independently, and implement approved email confirmation and operator MFA. Do not turn on automated marketplace sync, legal document issuance, AADE submission or POS processing.

## Milestone 19 — authenticated email ownership proof (11 October 2026)

- Isolated FISCAL migration `0015_email_ownership_proof.sql` adds `fiscal_users.email_verified_at` and a private 20-minute `fiscal_email_verification_challenges` table. Tokens are random 256-bit values stored **only as SHA-256 hashes**; the table has RLS ON, no Data API grants, one pending challenge per user, immutable ownership/expiry/identity and irreversible consumed/revoked states.
- `FISCAL_EMAIL_VERIFICATION_ENABLED` is **OFF by default**. Enabling outbound proof mail requires a dedicated **verified sender** (`FISCAL_VERIFICATION_FROM`) and scoped `RESEND_API_KEY` in the independent FISCAL Vercel production project, plus HTTPS `FISCAL_SERVICE_BASE_URL`. None should be stored in Git. Provider failures fail closed and revoke pending tokens; no raw token or credentials are logged. No mail provider is used in the ephemeral CI runner.
- Authenticated merchants can request at most **three** email challenges per hour, to the email already bound to their server-side FISCAL account; they **cannot** choose an arbitrary target email. A newer request revokes any previously pending challenge.
- Proof URL is delivered **by email only** with the token in the URL **fragment**, and is immediately stripped from the browser location. The user must have their own FISCAL merchant session and valid CSRF; unauthenticated users may log in in another tab and return to the original proof page without sending the secret through a redirect URL. The API compares challenge owner with the authenticated user, enforces expiry and one-time consumption, and appends an immutable `email.ownership_proved` audit event.
- Merchant dashboard shows verified/unverified state and (when configured) a link-request control; the operator KYB case displays verified/unverified email ownership separately from identity/legal status. Completing proof **never** changes organization status, approves legal representation or activates invoice issuance.
- Standalone PostgreSQL/HTTP tests cover user-scoped redemption, replay, foreign merchant denial, CSRF/Origin rejection, missing sender fail-closed, the independent merchant login and an unchanged `pending_review` organization. Production rollout requires dedicated database migration, CI pass, verified outbound sender and a real controlled email deliverability check.

**Privacy boundary:** proving mailbox access is not a substitute for verifying an AFM, GEMI entry, legal representative, beneficial owners, legal agreements or AADE/myDATA provider qualification. No automatic KYB approval or fiscal posting is provided.

## Milestone 20 — seven-part operator KYB evidence inventory (11 October 2026)

- New **isolated FISCAL** migration `0016_operator_kyb_evidence.sql` stores append-only, tenant-keyed `fiscal_kyb_evidence_events`. RLS is ON, anon/authenticated SQL privileges are revoked, a trigger denies UPDATE/DELETE, and the records reference an existing organization with an immutable actor/source/timestamp.
- Strict checks: business registration (ΓΕΜΗ), VAT/AFM evidence, registered business address, legal representation, beneficial ownership, signing authority and service agreement. Operator outcomes are **requested**, **evidence_recorded** or **discrepancy**. These are internal tracking observations, NOT confirmation of legal validity or registry synchronization.
- Each recorded source uses a fixed enumeration (public ΓΕΜΗ/ΑΑΔΕ observation, merchant declaration, internal contract, offline observation) with a 5–160 character **reference identifier only**, not uploaded documents, URLs, passports, identity cards or free-text personal descriptions. Future encrypted evidence storage will be a separate governed service with retention and access policy.
- `POST /timologio-admin/api/kyb-evidence` requires a valid Fiscal operator or federated super-admin session, strict same-origin and CSRF, JSON/byte limits and an **under_review** organization locked during the transaction. A bounded write produces an immutable evidence event and matching operator audit event atomically. There is a 30-actions/hour per-case volume ceiling and no customer message.
- `/timologio-admin/accounts/:id` displays the latest status of each of seven checks, historical references, discrepancy count and an operator-only form. It never elevates an organization beyond **under_review**, grants a session, enables financial APIs, sends documents, or marks any company approved. An all-recorded checklist is explicitly still **not** a legal-approval decision.
- Tests include contract rejection of forged approval, arbitrary source URLs and extraneous fields, database RLS, immutability, invalid reference/FK and unchanged pending status, plus real HTTP merchant rejection, origin and CSRF checks, administrator case rendering, audit cardinality and rejection-state blocking.
- **Release gate:** apply migration 0016 to the dedicated FISCAL database, validate the migration checksum and CI, and only then deploy the isolated FISCAL service. No marketplace DB migration or fiscal-issuance activation.

The next governed phase must separately establish merchant-submitted evidence collection, storage access, document retention, verified email sending, operator MFA and an appropriate legal KYB approval process. This milestone alone must not be used to onboard a real merchant for legal issuance.

## Milestone 21 — independent FISCAL operator MFA (11 October 2026)

- `/timologio-admin/mfa` supports per-operator enrollment of a 6-digit time-based TOTP authenticator (RFC 6238, SHA-1 / 30-second steps) and a 15-minute session-bound step-up. The original marketplace super-admin SSO remains valid; MFA does **not** replace, weaken or silently bypass the signed one-time handoff.
- Migration `0017_operator_mfa_stepup.sql` adds `fiscal_operator_mfa_factors` and `fiscal_operator_mfa_sessions` in the **dedicated FISCAL database**. Both are RLS-enabled and denied to `anon` and `authenticated`. Factor identity is scoped to `(actor_kind, actor_ref)`, including a distinct identity namespace for federated marketplace super-admins versus native FISCAL operators.
- Authenticator seeds (20 cryptographically random bytes) are encrypted at rest using **AES-256-GCM** with a **32-byte hex key** from `FISCAL_OPERATOR_MFA_ENCRYPTION_KEY`, 96-bit random IV, and authenticated associated data binding the key to the operator identity. Never store this key in Git, client code, public Vercel environments or log messages. Never rotate it without controlled re-enrollment/re-encryption.
- A pending enrollment lasts **10 minutes**; the authenticator secret/URI is returned once to the authenticated operator via a no-store response. Activating requires a matching 6-digit TOTP and creates a short-lived independent MFA cookie. All successful TOTP counters persist under a row lock; the same 30-second counter cannot be reused (including across concurrent requests).
- Step-up sessions use 256-bit random tokens stored as SHA-256 hashes, are limited to **15 minutes**, and are bound to the specific current primary SSO/native session (not just to a browser or account). A new step-up revokes the previous scoped token; explicit exit revokes the current token. A revoked or expired primary session cannot authorize a step-up.
- Operator code attempts are limited by the existing `fiscal_auth_limits` table (5 attempts per rolling 15-minute window). Origin, session/CSRF, strict JSON shapes and byte limits are required. The MFA seed, full TOTP values and cookie token never go into immutable audit logs.
- When `FISCAL_OPERATOR_MFA_ENFORCED=true`, private `/timologio-admin/accounts/:id` and invitation-list reads and all sensitive admin mutations (application reviews, evidence inventory, invitations) require a fresh MFA step-up. The existing Control Centre and the MFA setup page remain reachable through original SSO for enrollment. **FISCAL_OPERATOR_MFA_SETUP_ENABLED** and **FISCAL_OPERATOR_MFA_ENFORCED** default **false** in absence of explicit configuration, keeping current production access compatible.
- CI covers RFC test vector, encryption/decryption/actor isolation, TOTP replay, detached SQL session expiry/tenant checks and real HTTP enrollment, denied pre-MFA mutations, valid step-up, code reuse refusal and normal admin review after verification.
- **Rollout order:** first migrate 0017 in isolated FISCAL PostgreSQL; pass independent/marketplace CI; deploy with both MFA flags OFF; provision a strong environment encryption key only to isolated FISCAL production; enable `FISCAL_OPERATOR_MFA_SETUP_ENABLED=true` and test a real operator enrollment; establish an independently verified lost-device recovery/rotation procedure; only then consider `FISCAL_OPERATOR_MFA_ENFORCED=true`. Do not enable enforcement merely because code built.
- This does **not** enable legal invoice issuance, merchant approval, merchant identity verification, automatic email sends, marketplace fiscal posting or PCI/POS processing. Recovery codes and a governed device-recovery flow remain outstanding.


## Milestone 23 — bounded credit/refund allocation preview (12 October 2026)

This change adds a **pure calculation-only** partial/full credit allocation model in
\`apps/web/src/lib/fiscal-sandbox-credit-allocation.ts\`. It applies uniformly to
B2C, POS, B2B and B2G **non-fiscal test drafts**. It is deliberately not an
API, a customer-facing credit-note button, an accounting posting, a tax-reversal
engine, an AADE operation, a payment refund, or an immutable fiscal document.

- Takes one tenant-authorized original draft snapshot (UUID, test lane, EUR,
  declared original gross total and 1–30 contiguous lines with positive integer gross cents).
  Rejects truncated or modified line sets whose sum differs from the original total.
- Consumes **complete** tenant-scoped prior test credit allocations (maximum 100)
  and one proposed adjustment (1–30 distinct original-line references).
- Enforces stable external references, no reuse of historical references,
  strictly bounded positive integer amounts and individual line ceilings.
  A draft cannot be over-credited even when total remaining value elsewhere
  would cover an excessive proposed adjustment.
- Reconciles every source line with BigInt arithmetic and emits immutable
  plain-value results (original, previously allocated, newly proposed and
  remaining EUR cents) in stable line order. The aggregate residual must equal
  the sum of line residuals; fully allocated lines may reach zero, never negative.
- Rejects arbitrary fiscal, approval, tax, issuer and posting attributes.
  All outputs explicitly set \`legalCreditNoteIssued=false\`,
  \`taxReversalDetermined=false\`, \`refundExecuted=false\`,
  \`officialAccounting=false\` and \`fiscalIssuanceEnabled=false\`.
- A dedicated Node regression suite checks every lane, partial and full
  allocations, over-credit, forged lines, duplicate references, incomplete
  source indices, oversized history, invalid amounts and extra legal fields.
  It is included in Fiscal Foundation CI.

**Deliberate release boundary:** The module cannot assert that any historical
allocations actually exist or are complete; its caller must establish
organization-specific authorization, immutable source version, complete
adjustment history, idempotent transaction persistence and concurrent locking.
Until those are implemented and audited, **do not expose it as a live mutation
API**. A real credit note must also determine lawful tax reversal, reference the
issued original document, meet applicable numbering/retention rules, and use
the approved AADE/provider delivery path before activation.

Production status (18 October 2026): merged via PR #1478 at `b36ff468`
and verified READY on the standalone FISCAL deployment; no database migration,
environment change, marketplace order hook or fiscal issuance activation.

## Milestone 24 — merchant credit simulation laboratory (18 October 2026)

Authenticated merchants have a new separate `/timologio/credit-lab` workspace
linked from their dashboard. It demonstrates the Milestone 23 bounded gross-cent
allocation engine with entirely **synthetic**, editable EUR line amounts.

- All computations happen in the browser using pure in-memory functions;
  there is **no server API, stored document, database write, printing, emailing,
  accounting posting, official credit note or AADE communication**.
- Four explicit non-fiscal lanes: B2C, POS, B2B, B2G. The demo accepts 1–12
  rows, original gross amounts, aggregate hypothetical previous credits,
  and a new hypothetical credit in Greek decimal comma or decimal point format.
  All numeric parsing uses BigInt minor-unit arithmetic, not currency floats.
- The user sees original, previously credited, proposed and residual totals
  and residual amount per sample line. Every output explicitly remains
  `fiscalIssuanceEnabled:false`, `legalCreditNoteIssued:false` and
  `refundExecuted:false`. When a row exceeds available value, the preview
  refuses to calculate.
- The *aggregate hypothetical previous credit* is **not** a complete real-world
  credit history, and the synthetic UUID is **not** a real invoice reference.
  Never connect the calculator directly to real balances or represent its
  output as a lawful tax credit, VAT reversal or payable refund.
- Test coverage includes Greek/English decimal separators, forbidden grouping,
  non-integers, under/overflows, positive credit requirement, row and total
  ceilings, original-value immutability, all four lanes and no issuance state.
- Private page authentication and the independently compiled standalone route
  are enforced by the existing Fiscal Foundation CI and route-isolation test.

**Future production credit notes remain blocked** on certified tax calculations,
issued-original document linkage, full immutable tenant-scoped credit history,
concurrency-safe idempotency, AADE/provider transmission rules, accounting
review and separate business/operator release approvals.

## Milestone 25 — merchant onboarding and readiness dashboard (18 October 2026)

The existing authenticated `/timologio/dashboard` now displays explicit,
privacy-scoped readiness summaries for each organization already returned by
`fiscalMerchantAccounts(actor)`, combined only with the actor's own
`fiscalEmailStatus(actor)` and the feature-flag state.

- Email control: verified / pending / service-not-enabled. Email possession is
  never equated with legal identity, company ownership or KYB approval.
- Organization review: maps the existing `pending_review`, `under_review`,
  `approved`, `rejected` and `suspended` states to plain Greek explanations.
  Unknown statuses fail closed.
- **Non-fiscal** test draft and saved journal eligibility is shown only for
  an `approved` organization with `owner` or `accountant` membership,
  matching existing server-side authorization checks. No UI state grants API
  permissions. A `viewer` or unapproved account never gets a write-ready label.
- The browser-only credit lab remains available to any authenticated merchant,
  including those without a registered company, because it does not access
  tenant documents or persist simulations.
- Legal issuance is always unavailable regardless of user role, email proof,
  KYB state, organization approval or account activity.
- No extra database query, endpoint, migration, account approval, invitation,
  email sending, provider credential, tax calculation or marketplace sync.
  Existing authentication, GDPR boundaries and audit records are unchanged.
- A pure fail-closed state helper and Node regression suite cover every role
  and status, unknown statuses, unavailable email verification, immutability,
  test permission parity and non-activation of real fiscal issuance. The test
  runs under Fiscal Foundation CI.

Release gate: merge only after Fiscal Foundation CI, Production CI and browser
acceptance pass on the final head SHA, and verify the isolated FISCAL Vercel
production build, standalone routing and `issuanceEnabled=false`. This is
merchant UX and readiness transparency, **not** certification, real merchant
onboarding completion, statutory invoice issuance or live AADE connection.

## Milestone 26 — internal operational release gates (18 October 2026)

An authenticated FISCAL administrator can open
`/timologio-admin/release-readiness` from the independent Control Centre.
The page is **read-only** and is a *technical readiness diagnostic*, not a
production activation wizard or a statutory certification decision.

- Checks independent service mode, dedicated DB connectivity, core migration
  marker and schema presence, operator MFA 0017, pending recovery 0018, alert
  outbox 0019, receipt events 0020, reconciliation 0021, and internal
  regulatory-control catalogue presence.
- Checks only the true/false states of known feature flags for unsafe
  combinations. It never prints database URLs, provider secrets, signer keys,
  personally identifying merchant records, email addresses or account details.
- Conflicting flags (premature issuance, public registration, marketplace draft
  sync, recovery without prerequisite MFA, provider delivery without receipt
  schema) generate explicit unsafe-configuration warnings.
- A successful internal base health check **never** grants issuance:
  `legalIssuanceEnabled=false`, `releaseAuthorized=false` and
  `externalRegulatoryApprovalConfirmed=false` are unconditional.
  Provider certification, lawful tax reversal, operator independence, customer
  identity, evidence integrity, actual recipient delivery, AADE permissions,
  B2G approvals and terminal certification remain external, independently
  governed processes.
- A single SELECT probes known schema migration names and physical tables.
  Failure is reported only as not verified, never exposing raw SQL or PostgreSQL
  errors. The operator's existing FISCAL authentication is required before the
  probe. Route isolation and no-prerender checks protect the standalone route.
- Dedicated Node tests cover fail-closed behavior, complete synthetic schemas,
  unsafe flags, missing database, missing migrations, immutable diagnostic
  output and the permanent external-certification boundary.
- No migration, write API, env change, enrollment, activation, tax document
  generation, refund, AADE submission or marketplace job was added.

At the time this feature was authored, live FISCAL had migrations through
0017; later migrations 0018–0021 intentionally remained pending. Do not
apply them, enable recovery/security delivery, or announce issuance readiness
based solely on this diagnostic.

## Milestone 27 — membership-scoped merchant KYB status (18 October 2026)

The standalone, authenticated route `/timologio/onboarding?organizationId=<uuid>`
lets each assigned **owner** or **accountant** see a clear, privacy-minimized
summary of the seven internal KYB evidence-checklist categories maintained by
authorized Fiscal operators. A dashboard link is shown only for those roles.

- Authenticated merchant and organization membership/role are checked by the
  existing dashboard and again **inside the database SELECT**. An outsider,
  tenant from another organization, revoked member or `viewer` never sees a
  company's checklist. The route does not support arbitrary organization IDs.
- The query returns only the latest `check_type` and `outcome` for each
  organization/check. No evidence IDs, source URLs or references, beneficial
  owner personal details, documents, reviewer identities, notes, emails or
  attachments are selected. It never queries evidence for a rejected/suspended
  account from this UI.
- Labels distinguish *not recorded*, *requested*, *evidence recorded*,
  *discrepancy* and unknown states requiring review. Entries marked as
  recorded are **not** evidence verification or KYB approvals. Older evidence
  may not override a newer discrepancy. No raw reviewer notes are disclosed.
- If the DB is unavailable or permission disappears, the route shows a
  generic failure message rather than a guessed default success result.
- There are no upload forms, data mutations, notification sends, merchant
  status transitions or actual legal-approval decisions. The UI **always**
  says legal issuance/myDATA/AADE submissions remain disabled.
- Node tests cover latest-event handling, redaction, unknown state failures,
  no legal approval even with all seven evidence steps recorded, immutable
  summaries and exact check count. A disposable PostgreSQL CI smoke test
  executes the **same SQL as production** for owner, accountant, viewer and
  cross-tenant identities; it rolls back all synthetic fixtures.
- No migrations, credentials, environment flags, live fiscal document creation,
  public onboarding or company approval actions are part of M27.

Any real merchant evidence collection, secured document upload/retention,
external registry verification, operator KYB decision, or official activation
requires separate scoped workflows, policies, legal review and explicit release
gates. This phase provides **visibility only**.

## Milestone 28 — prioritized internal KYB review queue (18 October 2026)

Authorized FISCAL administrators have a read-only review overview at
`/timologio-admin/kyb-queue`, linked from the Control Centre.

- A single bounded SQL query selects the **oldest 40 open** business cases
  (`pending_review` / `under_review`) and each check's **latest** recorded
  outcome. It does not retrieve VAT numbers, employee contacts, references,
  source materials, personal beneficial-owner records or audit notes.
- Cases are ranked for triage: discrepancies/unknown states first, then
  incomplete evidence, cases without any checklist entries, finally cases
  with seven recorded references *still requiring external review*.
- Both the pure summarizer and the UI state that seven recorded entries
  **do not mean legal KYB approval, genuine identity verification, or the
  right to issue tax documents**.
- Each case links to its existing authenticated operator file, where the
  established review and MFA rules remain authoritative. No background
  approvals, messages, risk scores, bulk actions, document uploads or
  taxpayer transmission are introduced.
- Route available only to existing authenticated FISCAL administrators;
  if mandatory operator MFA is enabled, the same existing step-up
  enforcement applies as on the case review page.
- CI runs pure queue regression tests plus the **exact production SELECT**
  against synthetic cases in a rolled-back, disposable `fiscal_ci`
  PostgreSQL database to confirm no evidence references leak and that
  latest discrepancies take priority.
- **No migration, new data source, credentials, production activation
  toggle, refund, AADE connector or fiscal issuance state changes**.

A future merchant document-submission path is deliberately **not** part of
M28. It requires a separately approved encrypted storage, malware scanning,
retention/deletion policy, file-type/size controls, legally scoped consent,
operator access audit, tenant isolation, and production readiness gate.

## Milestone 29 — local-only KYB preparation and safe upload security contract (18 October 2026)

The existing, tenant-protected merchant onboarding view now includes an
interactive, mobile-responsive, seven-step **evidence preparation checklist**.
Each step explains example source material and a specific privacy caution.
Only organization owners and accountants who pass the M27 membership and
review-state gate can see the checklist.

- Checks live **only** in React component memory; refreshing or navigating
  away discards them. No local storage, session storage, indexed database,
  document collection, personal free text, telemetry, fetch, API write,
  uploads or communications occur.
- Each check is distinct from the existing operator KYB evidence state.
  Checking all seven never changes an organization status, approves identity,
  confirms document validity, signs a contract or enables issuance.
- A pure, unit-tested *future attachment metadata policy* defines strict
  allowlist candidates (PDF/PNG/JPEG, maximum 5 MiB), conservative ASCII
  filenames, SHA-256 metadata, no dot-dot/double-extension paths, and
  mandatory subsequent magic-byte validation and malware scanning. These
  are **metadata only**, not sufficient to accept, persist or process bytes.
- A separately tested storage-readiness contract tracks private-bucket,
  tenant isolation, at-rest encryption, malware quarantine, access auditing,
  retention/deletion, legal basis, incident drills and operator MFA.
  Even with every technical input true, its immutable result is always
  `acceptingUploads=false`, `goLiveApprovalConfirmed=false`,
  `automaticKybApproval=false`, `issuanceEnabled=false`.
- No upload endpoint, blob storage, storage credentials, migrations,
  background processors, account transition, browser file reader, legal
  issuance or myDATA/AADE transmission was introduced. Shipping this module
  **does not** constitute an operational merchant evidence intake.
- Dedicated CI verifies the local-only behavior and privacy limits in
  addition to existing M27 membership isolation, KYB queue and standalone
  Next.js build checks.

To create a future *real* merchant document submission process, the owner
must explicitly approve a lawful purpose/minimization/retention plan, and
the team must separately provision a private EU-resident object store,
per-object encryption, malware quarantine and out-of-band scan verification,
short-lived single-use tenant-scoped authorization, immutable operator access
audits, deletion/expiry, verified account recovery and a safe rollout.
None of these external conditions are presumed complete.


## Milestone 30 — paginated, bounded, private KYB operator queue (18 October 2026)

The existing operator-only /timologio-admin/kyb-queue is no longer limited to
the first 40 open cases. Cases are now traversed in **stable oldest-first
keyset pages of 40** (a 41st sentinel only determines whether a next page
exists). Both `pending_review` and `under_review` remain in scope.

- A read-only, parameterized query uses the exact PostgreSQL creation timestamp
  (UTC to microsecond precision) plus UUID to avoid offset drift and losing
  same-second cases. There is no unbounded case query or all-record download.
- The operator's pre-existing authentication and step-up MFA remain required
  **before** reading the cursor, and on every page request. Invalid cursors
  fail closed (404), rather than becoming arbitrary SQL or a fallback page.
- A cursor carries only an organization UUID and timestamp. Evidence IDs,
  VAT, beneficial-owner identifiers, URLs, source references, reviewer data,
  notes and attachments are never queried for the queue. The server
  calculates the next cursor from the **40th** case, excluding the extra
  sentinel case from rendered data.
- Urgent discrepancies are still prioritized *within each page*; cases are
  fetched in immutable key order rather than falsely claiming a global risk
  ranking. The operator can always return to the first page. Closed or
  newly opened cases may alter later pages, but cursor movement never goes
  backwards or duplicates the boundary case.
- No account status transition, bulk approval, email, upload, document
  processing, migration, new credential, taxation, myDATA transmission
  or legal fiscal issuance is performed.
- CI has cursor validation, injection rejection, 40/41 boundary tests and
  executes the **same production SQL** against 45 temporary organizations
  in a rolled-back disposable PostgreSQL database; it checks redaction,
  case isolation, non-approval flags and page disjointness.

M30 is a workflow capacity and accessibility improvement, not a certification
or production authorization for tax documents. Issuance remains disabled.


## Milestone 31 — sensitive KYB evidence intake security foundation (19 October 2026)

An authenticated operator-only, read-only view at
`/timologio-admin/kyb-intake-readiness` now documents the **nine independent
security and privacy prerequisites** for a future merchant evidence service.

- The view uses the existing FISCAL administrator authentication and enforces
  operator MFA step-up when configured, exactly as the existing KYB queue does.
- It reports **zero independently verified external prerequisites** because
  no external audit/approval feed has been provisioned. An operator, database
  record or environment flag cannot mark these independently completed.
- Controls: EU-resident private object storage, organization segregation,
  per-object encryption/keys, content-type sniffing and malware quarantine,
  immutable operator access audits, retention/deletion, legal basis and data
  minimization, incident response, and verified operator MFA/recovery.
- A suspicious non-false `FISCAL_KYB_UPLOADS_ENABLED` request is surfaced as
  an unsafe configuration attempt, but does not activate any capability.
- A pure, strictly bounded *candidate policy evaluator* accepts only exact
  server-derived organization scope, membership role, organization status,
  one of the existing seven KYB categories and conservative M29 metadata.
  Cross-tenant, viewer, suspended/rejected, unknown-category and malformed
  file candidates are rejected. Even a valid candidate gets **no upload grant**,
  document write, evidence approval or statutory issuance.
- Dedicated Node tests enforce immutable negative authorization, zero approval
  for any flag combination, cross-tenant rejection and an authenticated,
  MFA-gated route. CI also retains the existing disposal-only PostgreSQL tests.
- No real evidence is requested or processed; no file chooser, bytes, presigned
  URL, multipart endpoint, private storage credential, migration, sensitive
  record, message or external data transfer was introduced.
- The independent Fiscal app and separate B2C/POS/B2B/B2G certification gates
  remain intact. Legal invoicing and AADE/myDATA transmission remain **OFF**.

M31 is deliberately a **security-readiness and authorization-policy
foundation**, not the actual storage service. To enable genuine collection,
the organization must approve the lawful purpose and retention schedule,
independently verify all controls, provision a dedicated private EU-resident
store and scanning/quarantine pipeline, implement short-lived server-signed
single-use grants, audit access and deletion, and pass an explicit separate
release gate. None of those are claimed complete by M31.

## Milestone 32 — offline encrypted KYB quarantine core (19 October 2026)

M32 adds **in-memory cryptographic and state-planning primitives**, NOT a
production evidence vault. The independent FISCAL operator readiness page now
shows these as internal technical progress while all nine external gates
remain explicitly unverified.

- AES-256-GCM with fresh unpredictable 96-bit nonce, authenticated AAD
  coupling the exact FISCAL organization UUID, evidence UUID, one of seven KYB
  categories, MIME type, length and SHA-256. Replaying a cipher envelope in
  another organization, for another document or under another check type
  fails verification.
- Strict M29 input metadata, filename/extension/MIME agreement, <=5 MiB,
  byte-length and SHA-256 matching, and minimal PDF/PNG/JPEG file signatures.
  This does not detect malicious scripts, malformed file internals or harmful
  polyglots. Independent deep decoding and malware scanning remain mandatory.
- The encryption key is an **explicit external 32-byte parameter**. No
  production KMS integration, provider account, bucket, storage credentials,
  browser-side key exposure or secret material is provisioned by M32.
- The envelope contains **no original filename** or plaintext content.
  Ciphertext, IV and authentication tag remain internal-only values.
  Integrity verification decrypts temporarily in server memory, checks both
  GCM authenticity and checksum, zeroes the temporary plaintext buffer, and
  returns only a redacted boolean security result — never document bytes.
- Every sealed object is permanently `scanStatus=unscanned` and
  `releaseAuthorized=false` at this stage. No scan trust or operator approval
  is inferred from encryption success or superficial file signatures.
- A guarded state-transition planner recognizes quarantine, independent
  scan rejection, clean hold and verified deletion stages. It reports
  prerequisites only; `mayExecute=false`, `mayRelease=false`,
  `mayIssue=false` for **every** transition.
- CI includes synthetic PDF/PNG/JPEG test vectors and negative tests for
  wrong keys, modified ciphertext/tags/nonces/digests, tenant/evidence replay,
  spoofed file types, oversize files, release-flag manipulation, extra fields,
  unsafe lifecycle transitions and missing public upload/storage adapters.

**Production limitation:** No actual KYB document can be submitted,
uploaded, encrypted, stored, retrieved, scanned, signed, deleted or legally
approved through these primitives. No public API, object store, KMS keys,
backend persistence, migrations, read grants, signed URLs or fiscal
issuance paths are added. The module has no live invocation from a request
handler. All encrypted test inputs are disposable synthetic bytes.

Future M33 requires independently approved legal basis and retention
schedule, real private EU-resident object store and KMS with correct
least-privilege IAM, isolated scanner/quarantine, verified delete semantics,
central immutability-controlled audit, safe tenant-scoped grants and separate
manual rollout authorization. These must be tested before any real upload.


## Milestone 33 — signed quarantine scan attestations and audit-chain verification (19 October 2026)

M33 extends the **offline** encrypted evidence vault foundations with
provider-neutral verification contracts. It does not configure or claim any
real production object store, key vault, document upload endpoint, quarantine
scanner, WORM audit service, deletion mechanism, production permissions, legal
KYB approval or tax-document issuance.

- Every future quarantine object receives a random 160-bit suffix and is
  scoped to an immutable `kyb-quarantine/v1/<organization-uuid>/<evidence-uuid>/...`
  internal object key, never a public or presigned URL and never an original
  document filename. The planner always returns
  `signedUrlIssued=false`, `canStoreProduction=false`.
- The independent-scanner contract verifies **Ed25519 signatures** using an
  explicitly supplied public key. The scan attestation is bound to exact
  organization ID, evidence ID, KYB check type, canonical SHA-256 digest of
  the **encrypted envelope**, scanner identity/version, verdict and timestamp.
  Stale/future timestamps, malformed/unknown fields, wrong trust roots,
  altered signatures, cross-tenant replay and modified verdicts fail closed.
  A cryptographically authentic `clean` result **does not** release evidence
  or authorize business approval.
- The object digest uses a fixed-order canonical field list, preventing
  object-property insertion order from changing the result across producers.
  The digest is not the plaintext-document hash displayed to users.
- An offline SHA-256 audit-event hash-chain verifier supports synthetic
  quarantine planning, encrypted writes, signed scans and delete-intent /
  deletion-observation planning. It checks sequence, previous hash, scope,
  evidence digest and timestamps, and rejects alteration or reordering.
  **It is not tamper-proof** without a trusted independent write-once external
  audit anchor and operator identity proof. The result states
  `independentlyAnchored=false` and `objectDeletedConfirmed=false`.
- All production gates are immutable `false`: verified EU residency,
  separate KMS, private object ACLs, provisioned scanner key, quarantine
  enforcement, independently anchored audit, proven deletion, privacy/legal
  basis, reviewed operator MFA, real bytes/uploads/writes, signed read links
  and fiscal permission. No environment override changes this verdict.
- The dedicated CI regression suite signs synthetic reports with a throwaway
  Ed25519 key pair and exercises authenticity, three verdict states,
  tenant/document binding, encrypted object digest isolation, replay,
  scan freshness and forged fields, plus hash-chain tamper detection.
- The existing authenticated `/timologio-admin/kyb-intake-readiness`
  dashboard describes actual code readiness and explicitly disclaims real
  scanner/storage/audit connections. The independent FISCAL service and all
  existing M31/M32 fail-closed tests remain in place.

The next genuine production milestone requires provisioned **private EU
object storage**, auditable KMS keys, a sandbox-tested encryption context and
object ACL, a production-grade malware scanning/quarantine service with
independently managed signing keys, WORM audit/event retention, documented
deletion and disaster recovery, GDPR/legal review, deployment roll-forward /
rollback gates and staged threat-modelled end-to-end tests. Real identity
documents must not be collected before these safeguards are independently
verified and explicitly approved.


## Milestone 34 — live, read-only FISCAL Storage readiness inspection (19 October 2026)

For the first time the protected FISCAL KYB readiness dashboard performs
**real-time, strictly read-only inventory** of Storage infrastructure through
the existing *separate* FISCAL PostgreSQL connection. The probe runs only
after administrator authentication and the already-configured MFA step-up.

Discovery before implementation confirmed that the standalone FISCAL Supabase
project (`kcpwxplxqtqdsfwlfsaa`) is healthy in `eu-central-1`; its live
database has 17 recorded migrations through `0017_operator_mfa_stepup.sql`,
and **zero FISCAL Storage buckets/objects** as of 19 October 2026.
Do not confuse the actual EU region with proof of dedicated KMS or legal
GDPR approvals. Earlier repository migrations 0018–0021 are **not** applied
in live FISCAL and remain independently gated.

- Expected future quarantine bucket ID: `fiscal-kyb-quarantine`. No bucket
  is automatically created by this release. Do not create one by SQL
  manipulations of `storage.buckets`; use the documented Storage API or
  approved Dashboard workflow after architecture/privacy signoff.
- Reads only Storage catalog existence, `storage.objects` RLS enablement,
  *one exact* bucket's `public`, `file_size_limit` and MIME allowlist,
  aggregate policy count and aggregate object count for that exact bucket.
  It does **not** enumerate objects, select object names or metadata,
  inspect merchant identities, read upload bytes, return URL/credentials,
  expose SQL/DB errors, or query the marketplace database.
- The proposed future bucket defaults to a strict `application/octet-stream`
  ciphertext-only MIME allowlist and 12 MiB hard per-object cap; real
  unencrypted PDFs/images must **never** be accepted there.
- Any public bucket, wrong allowlist/limit, missing RLS, any object policy
  (even an apparently unrelated one) or any existing object produces
  `unsafe_configuration`. This intentionally sacrifices some availability
  for a fail-closed readiness gate. An absent bucket is
  `not_provisioned`, and DB or catalog errors are `unavailable`.
- Even when every inventory flag is true, the only possible result is
  `configured_unverified` with `storageExternallyVerified=false`,
  `managedKmsVerified=false`, `independentScannerVerified=false`,
  `immutableAuditVerified=false`, `lawfulRetentionVerified=false`,
  `acceptingUploads=false`, `acceptingBytes=false`,
  `canReadDocuments=false`, `legalIssuanceEnabled=false`.
  Raw configuration cannot independently certify these controls.
- A pure regression suite covers all unsafe/missing status paths, and a
  separate **exact SQL acceptance** creates a synthetic Storage schema and
  private quarantine bucket **only inside a rollback transaction in the
  disposable `fiscal_ci` PostgreSQL database**. It tests absent bucket,
  valid private configuration, public exposure, permissive object policy
  and unexpected stored object. No test touches the real Storage service.

Next genuine enablement stages: approved data-protection assessment and
retention policy, independent EU residency/service contract verification,
controlled empty private bucket provisioned via Storage API/Dashboard,
separate managed KMS with policy isolation, malware quarantine, immutable
operator audit and deletion/incident drills, and staged end-to-end testing
against non-sensitive synthetic bytes. A bucket alone cannot unlock intake.


## Milestone 35 — real empty EU-private quarantine bucket + synthetic end-to-end rehearsal (19 October 2026)

M35 is the first verified **real provisioned storage resource**, but it is
**not a working KYB document intake**. The separately hosted FISCAL Supabase
project `kcpwxplxqtqdsfwlfsaa` (`eu-central-1`) was inspected immediately
before provisioning. The project had zero Storage buckets, zero objects, zero
`storage.objects` RLS policies and RLS was enabled for that table.

Following the current official Supabase "Creating Buckets" documentation, an
**atomic, locked SQL creation** added exactly one empty bucket through
`storage.buckets` after checking those safety preconditions. The operation
aborted on any existing bucket/policy/object or disabled object RLS. The
transaction committed only if exact private and limit values matched.
Its read-back verified:

- bucket ID and name `fiscal-kyb-quarantine`;
- `public=false`;
- `file_size_limit=12582912` (12 MiB);
- `allowed_mime_types=['application/octet-stream']` for **encrypted-only**
  objects; no raw PDF/JPEG/PNG is allowlisted;
- **zero stored objects**. No RLS policies were created and no application
  service-role credentials were introduced.

This is deliberate only-once provisioning of an **empty bucket**, not
merchant-data processing. Existing documentation recommended a managed API
or Dashboard; the platform's official current guidance also explicitly
supports SQL for bucket creation. Creation was narrowly transaction-scoped,
preflight guarded and verified; it must not be generalized into direct
Storage object mutations or arbitrary SQL-based object lifecycle handling.
For all future object operations prefer supported, approved Storage APIs.

M35 also adds a **bounded, operator-only in-memory cryptographic rehearsal**.
It accepts **zero arguments** and generates fresh synthetic PDF bytes, random
organization/evidence UUIDs, throwaway AES-256-GCM key and throwaway Ed25519
signing key. It exercises eight deterministic invariant categories:

1. unpredictable tenant/evidence-scoped quarantine key planning;
2. AES-256-GCM sealing and integrity verification;
3. synthetic cross-organization access denial;
4. ciphertext tamper rejection;
5. correctly signed scanner statement verification, without document release;
6. forged scanner-result rejection;
7. tenant/evidence-bound SHA-256 audit-event hash-chain consistency;
8. synthetic object deletion inside an ephemeral **in-memory Map**.

All bytes, key material, object keys and signatures remain server-local;
results contain only a bounded check count and immutable negative
authorization flags. Key and plaintext buffers are cleared after the
rehearsal. The signed scan report is a **synthetic** example, not evidence
that any real scanner has run. An `audit.delete_observed` event in a
synthetic in-memory run is **not** proof of live deletion; the result always
reports `realDeletionVerified=false`.

The administrator-only route
`/timologio-admin/kyb-intake-readiness` reuses existing login and
configured operator MFA step-up, showing both the separate real read-only
Storage configuration and a synthetic rehearsal result. A passing test
does **not** change readiness gates.

**Still disabled:** merchant document intake, browser file uploads, object
write/read/download permissions, user grants, storage SDK connections,
background scanning, independent KMS and key rotation, WORM audit anchoring,
retention and verified deletion on real storage, production approvals,
provider accreditation, AADE/myDATA transmission, and legal fiscal issuance.
No real identity document was submitted, read or stored in this milestone.

The next work is to implement a strictly isolated, credential-separated
provider-side synthetic object lifecycle with explicit private network,
KMS/scanner/storage roles and destructive-test controls after security/privacy
review. Production merchant uploads cannot be enabled by a bucket or CI test.


## Milestone 36 — live Supabase Storage role/RLS separation audit (19 October 2026)

M36 adds a real **read-only production role and Storage access audit** to
the protected FISCAL KYB readiness page, plus an adversarial disposable
PostgreSQL authorization drill. It is a concrete security-hardening
milestone, **not a new merchant file upload or KMS/scanner integration**.

Live Supabase inventory on 19 October independently confirmed:

- `fiscal-kyb-quarantine` exists, is private, empty, capped at 12 MiB
  and restricted to `application/octet-stream`;
- RLS on `storage.objects` is enabled; zero Storage object policies;
- `anon` and `authenticated` roles have ordinary SQL table grants
  but `rolbypassrls=false`. **GRANT is not RLS authorization**: without
  any Storage object policies, default RLS blocks their object operations;
- the built-in `service_role` has `rolbypassrls=true`; a broad
  service-role key can bypass Storage RLS, and should **never** be introduced
  as a convenience credential into an unapproved merchant-facing app;
- inspected standalone FISCAL Vercel production environment variable
  *names* (without retrieving values) and found no dedicated KYB Storage
  credential or managed KMS configuration.

The live M36 check reads only `pg_roles`, RLS metadata, aggregate
`pg_policies` count, one exact bucket privacy flag and aggregate
bucket object count, through the already isolated FISCAL database.
It never impersonates roles against live data and never enumerates
object names, merchant identifiers or key material.

The fail-closed evaluator detects missing/duplicated roles, RLS bypass,
added Storage object policies, public quarantine bucket, unexpected
objects, and unavailable database/catalog. An intact default-RLS
configuration yields `effective_public_denial`, **not** certification
or approval. Every result keeps `productionIntakeEnabled=false`,
`mayWrite=false`, `mayRead=false` and `mayIssue=false`.

The CI-only integration drill, guarded to `CI=true` and a
**localhost** `/fiscal_ci` database, creates disposable roles,
a synthetic object row and an RLS-enabled synthetic table with
deliberately permissive SQL table grants. It performs real
`SET LOCAL ROLE` checks, verifies that both unprivileged roles see
**zero rows** and cannot insert, then rolls back the entire fixture.
It never changes hosted Supabase data or the real Storage schema.

**Remaining blockers for controlled real Storage writes:** independent
least-privilege service identity with no broad `service_role` exposure,
separate managed KMS + key rotation, validated private Storage API
permissions, malware scanner/isolated signing identity, immutable
audit, retention/deletion drills, GDPR assessment, and explicit
manually authorized synthetic-only execution. Supabase Storage is
real and private; encrypted write/delete tests against that live
bucket have **not** been run. Tax-document issuance remains disabled.

Refer to current <https://supabase.com/docs/guides/storage/security/access-control>
and <https://supabase.com/docs/guides/storage/schema/custom-roles>.


## Milestone 37 — isolated ciphertext-only Supabase Storage HTTP contract (19 October 2026)

M37 implements a **real provider-specific HTTP protocol client** for future
strictly authorized synthetic evidence Storage tests. The client is **not
connected to any live route, button, worker, CI-network or cron**. Neither
the Vercel FISCAL production environment nor the standalone service has a
configured narrowly scoped Storage probe JWT and independent KMS grant.
Live object write/read/delete has **not** been performed.

A live inspection of the separate EU FISCAL Storage catalog before this
implementation again found the `fiscal-kyb-quarantine` bucket private,
limited to 12 MiB octet-stream objects, with 0 objects, 0 Storage RLS
policies. The standalone Vercel environment **key names only** were
inspected; no scoped Storage token or project publishable key was configured
and no secret values were retrieved.

The M37 contract does the following, **once separately approved and
supplied a limited-purpose credential in an isolated server-side job**:

- Accepts no merchant data, filenames, uploaded bytes, object IDs or arbitrary
  destination URLs. It always generates its own 64 random plaintext bytes and
  one-time AES-256-GCM key/nonce, writing **ciphertext only** (<=512 B) with
  a fixed `KMFS37` synthetic marker and bounded opaque object path under
  `__synthetic_m37__/<uuid>/<random>.bin`.
- Hard-pins the target to the FISCAL Supabase project URL and exact quarantine
  bucket; rejects any other host, HTTP or modified paths. Uses the supported
  Storage API, never SQL inserts/deletes against `storage.objects`.
- Requires publishable/anon project-key semantics and a distinct JWT **claiming**
  `role=fiscal_kyb_probe` and
  `purpose=fiscal_kyb_synthetic_probe_v1` with short expiration. Refuses
  `service_role`, ordinary merchant JWTs, expired/surprisingly long-lived
  credentials, and accidental `sb_secret_` keys. Local JWT parsing is only
  defense in depth; the **remote Storage service must verify its signature**
  and actual role/permissions. The app cannot issue these credentials.
- POSTs octet-stream bytes without upsert, GETs authenticated bytes with
  strict response-size bounds, compares SHA256 in constant time, DELETEs
  exactly the generated object through the Storage API, and confirms GET
  responds 404. Explicitly disallows HTTP redirects. On any failure after
  upload attempt, best-effort cleanup is performed; the result indicates
  `cleanupUncertain` if deletion remains unverified. No object/secret/key
  or ciphertext is returned to the caller.
- Returns only immutable booleans for the synthetic test; all KMS,
  merchant document, upload/read and tax issuance flags remain false.
  Buffers with ephemeral local keys and plaintext are zeroed in `finally`.
- Tests all HTTP calls against a **memory-backed fake transport**, including
  encrypted PUT/GET/DELETE/404 roundtrip, malicious/mis-scoped tokens, wrong
  hosts/keys, corrupted ciphertext, unexpected redirects, failed uploads,
  failed deletions and cleanup-uncertainty reporting. The CI suite **must not
  contact real Supabase Storage**. Typecheck and standalone builds are gated.
- The authenticated operator MFA-protected readiness page identifies code
  availability and missing credentials/KMS independently of M31-M36 live
  security and storage checks. The dashboard does not run the HTTP probe.

A private, empty bucket with no object policies is **incompatible with
performing the real Storage API write probe today**. Enabling probe
operations requires a separately reviewed and provisioned custom, short-lived
JWT role with narrowly scoped RLS policies and role membership, avoiding
service-role credential exposure. The M34/M36 strict zero-policy probes
will need careful updates to validate only such narrowly scoped policies
before any actual authorization is granted.

**Still unverified:** independent managed KMS, externally operated malware
scanner, immutable audit retention, Storage API deletion and role/tenant
acceptance against the real service, legal basis and privacy approvals,
certifications and production merchant document intake. Legal tax issuance
and AADE/myDATA transmissions remain locked.


## Milestone 38 — production-provisioned DORMANT synthetic Storage identity (19 October 2026)

For the first time the real, independently hosted FISCAL Supabase project
`kcpwxplxqtqdsfwlfsaa` in `eu-central-1` now has a dedicated
`fiscal_kyb_probe` PostgreSQL role, applied through the Supabase
Migration API as `m38_fiscal_kyb_probe_dormant_role`. The exact,
guarded and reentrant SQL is versioned under
`fiscal/security/m38_dormant_storage_probe_role.sql`, deliberately
**outside** the standalone `fiscal/migrations` auto-run directory:
the production project's prior standalone fiscal schema sequence is
separately governed and must not be silently fast-forwarded.

**Verified live after commit:** role exists with `NOLOGIN`,
`NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`,
`NOCREATEROLE`, `NOREPLICATION`; it is not assigned to
`authenticator`, `anon` or `authenticated` and has zero inherited
memberships. The required `fiscal-kyb-quarantine` bucket is private,
12 MiB, `application/octet-stream` only, with zero objects,
zero Storage RLS policies, and active object-level RLS. The migration
**does not grant or modify Storage permissions, does not mint a JWT,
does not create RLS policies, and does not issue a service_role key**.

A real dedicated role can exist without being a usable service identity:
this one is deliberately **dormant**, incapable of being assumed by
the API authenticator today. Claiming that a scoped production Storage
connection is now operational would be inaccurate. No real synthetic
Storage API write/read/delete test has been performed.

The operator-only FISCAL KYB security readiness screen now performs an
additional **read-only SQL inspection** of the live role's privilege and
membership metadata, distinguishing `dormant_verified`,
`missing`, `unsafe`, and `unavailable`. It reports role presence,
login/bypass risk, inherited administrative roles and API delegation,
while keeping all Storage and tax issuance authorization flags false.
A wrongly delegated/privileged role changes the displayed status to
`unsafe`.

The CI suite runs unit cases for every privilege escalation and the
**exact same applied SQL** in a localhost-only, rollback-only synthetic
PostgreSQL environment. It verifies idempotent role creation, no
authenticator grants or Storage object policy, real role-switch denial
of object SELECT, and a rejection when an unexpected authenticator
grant occurs. A passing rehearsal is not an audit certification.

**No live merchant KYB**, actual identity-document intake, public
uploads, independent KMS, malware scanning, verified immutable audit,
legal approvals, myDATA submission or tax issuance. M39 prerequisites:
independently managed JWT issuer/pinned verifier; an explicit reviewed
authenticator membership and narrowly scoped `storage.objects` RLS
rule limited to `__synthetic_m37__/`; real Storage acceptance plus
synthetic-object cleanup verification; independent managed KMS and
scanner, retention/deletion and privacy legal review. Any future
policies require updating M34/M36 strict zero-policy protections
*before* deployment and must not create broad merchant access.

Reference: Supabase Custom Storage Roles
https://supabase.com/docs/guides/storage/schema/custom-roles
and Storage Access Control
https://supabase.com/docs/guides/storage/security/access-control.
