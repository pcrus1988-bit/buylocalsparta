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
