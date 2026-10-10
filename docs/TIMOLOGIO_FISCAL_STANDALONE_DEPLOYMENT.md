# KONTA MOY FISCAL — independent deployment runbook

## Current infrastructure

- **Vercel project:** konta-moy-fiscal (ID: prj_fZiejKLcPjXustPBw04NdlqKyP2H)
- **Vercel team:** sp-business-lab (team_5dwRGt0Xm0oad1COAbN0J3rF)
- **Code/deployment root:** fiscal/service
- **Region:** fra1 (Frankfurt)
- **Protection:** Vercel SSO applies to all targets. Not a public launch.
- **Source:** feature branch feat/timologio-fiscal-foundation-20261009 / PR #1431.
- **Database:** No independent Fiscal production database is provisioned.
- **Custom DNS:** Not configured.
- **Legal invoice issuance:** Not implemented or activated.

### Why a separate entrypoint

The existing marketplace Next.js deployment carries numerous catalogue, inventory, delivery, research and email cron jobs. Pointing a second Vercel project at apps/web or the repository root would risk inheriting those jobs.

Instead, fiscal/service is a separate Next.js application with a **strictly narrower route tree** and its own Vercel config **without any scheduled jobs**. It imports the existing Fiscal pages, UI and business logic from apps/web/src to avoid duplicating code. Runtime routing, root layout and metadata are Fiscal-only.

This is independent at the route and deployment boundary, but source-code compilation is still monorepo-coupled. The complete provider-grade goal is to extract pure shared fiscal modules into a reusable internal package and give FISCAL its own incident recovery/build release life cycle.

## Required Vercel environment

| Variable | Project | Purpose |
|---|---|---|
| FISCAL_STANDALONE_MODE=true | Fiscal | Fail build without service isolation |
| FISCAL_REGISTRATION_ENABLED=false | Fiscal | Keep registration closed |
| FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED=false | Fiscal / connector | No live sync |
| FISCAL_MARKETPLACE_BASE_URL=https://kontamou.site/ | Fiscal | Trusted marketplace for SSO and vendor linking |
| FISCAL_DATABASE_URL | Fiscal only | Separate EU-region PostgreSQL; not yet provisioned |
| FISCAL_SUPERADMIN_SSO_SECRET | BOTH, secret | Independent 48+ character random HMAC key; never expose client-side |
| FISCAL_SERVICE_BASE_URL | BOTH | Strict HTTPS origin for Fiscal service; choose verified permanent domain before SSO |
| FISCAL_MARKETPLACE_LINK_SECRET | BOTH, secret | Separate 32+ char HMAC key for marketplace pairing |
| FISCAL_MARKETPLACE_TEST_API_KEY | Marketplace only | Optional draft-only connector test credential |
| FISCAL_MARKETPLACE_ISSUER_VAT | Marketplace only | Legally verified seller-of-record AFM |
| FISCAL_MARKETPLACE_DRAFT_SYNC_ENABLED=true | Marketplace only, later | Enable only after separately approved tests |

Do not copy marketplace DATABASE_URL, POSTGRES_URL, BLS_AUTH_SECRET, vendor credentials, service-role keys or AADE ERP credentials to the Fiscal project.

### Database provisioning

A dedicated EU-region PostgreSQL/Supabase project is a separate decision and may incur charges. Do not repurpose unrelated existing Supabase projects. Once an organization and costs are approved, provision the database and least-privilege roles; set FISCAL_DATABASE_URL in the Fiscal project only.

Migrate with \`FISCAL_DATABASE_URL=postgres://... node scripts/fiscal-migrate.mjs\` from the repository root in a controlled environment. Do NOT run marketplace db:migrate here. Run \`node scripts/fiscal-db-smoke.mjs\` in CI against a throwaway isolated database only.

The SQL in fiscal/migrations manages merchants, organizations, sessions, test API credentials, draft records, append-only audit, marketplace pairing, internal compliance controls and independent one-time super-admin SSO. RLS and revoked browser grants are required. Actual runtime DB credentials must be least-privilege and isolated from marketplace production.

### Super-admin SSO without shared database

1. Marketplace super_admin signs in normally at KONTA MOY.
2. Authenticated super admin visits \`/admin/fiscal-access\`. Server validates existing session and constructs a signed, audience-bound, 60-second, one-time assertion.
3. Browser POSTS assertion using a normal form to \`/timologio-admin/sso/callback\` at the configured Fiscal HTTPS origin. CSP permits the external form destination only on this admin access page; referrer policy is no-referrer.
4. The Fiscal service verifies HMAC, audience, issuer, issue/expiry, browser Origin, one-use nonce and code format.
5. Fiscal inserts ticket and a new, revocable, HttpOnly, Secure, SameSite-Strict two-hour session into its *own* database. Replaying the assertion fails through unique jti_hash.
6. Fiscal supervises only the independently authorized administration UI. Merchant tenant role claims are not inherited from marketplace permissions.
7. Fiscal sign out revokes its local session; the marketplace account remains signed in.

An active Fiscal super-admin session remains valid during a marketplace outage until its own expiry, assuming FISCAL is operational. *New* SSO still requires marketplace authentication (identity-provider dependency is separate from the application runtime).

### Dedicated route whitelist

The standalone app contains only /timologio, /timologio-admin and their declared API routes. Marketplace login, checkout, vendor impersonation, order APIs, research/email jobs and scheduler routes are **not registered**. The monorepo marketplace service retains /timologio/marketplace-link for the two-sided account pairing flow.

### Verification and remaining readiness

- Run \`node scripts/fiscal-route-isolation.mjs\`.
- CI builds \`fiscal/service\` separately, with DATABASE_URL and POSTGRES_URL cleared.
- GET /timologio/api/health reports \`database_not_provisioned\` (503) until dedicated DB exists; returns \`operational_foundation\` only when DB responds; this is **not** a fiscal-certification signal.
- Verify SSO one-time replay failure and two-hour session expiry/revocation in staging.
- Verify all other marketplace routes 404 on the isolated host.
- Review dependency advisories from npm audit before unprotecting the service.
- Add monitoring, vulnerability scans, secrets rotation, disaster recovery, audit retention, data residency, MFA/identity governance, and independent fiscal provider certification before production enrollment.

## Release hardening — 2026-10-10

- Each migration's SQL body and checksum insertion now commit in one transaction. Migration checksums continue to be verified, with an advisory lock preventing parallel application.
- The independent health API checks the Fiscal schema version and required tables; PostgreSQL connectivity alone is not operational readiness or fiscal certification.
- The standalone Vercel build runs a fail-closed environment preflight. Use `node scripts/fiscal-deployment-preflight.mjs --staging` from the repository root. A separate `--activation` mode verifies planned secrets and distinct service origins; neither mode prints secret contents.
- The read-only npm audit reports production advisories for the shared workspace, which is a conservative superset of the standalone Fiscal runtime. Initial findings: Next.js critical (report suggests 16.4.0 as patch), Sharp high and source-map-js high.
- Do not automatically alter the marketplace Next.js version without regression testing. Remediate or prove non-reachability of vulnerable packages in Fiscal before opening staging to customers.
- Production launch is blocked until dedicated EU database, verified secrets, persistent service domain, backups, KYB, independent SSO testing and regulatory approval are completed.
