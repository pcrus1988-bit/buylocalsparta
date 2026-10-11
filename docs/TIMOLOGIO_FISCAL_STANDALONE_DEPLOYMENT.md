# KONTA MOY FISCAL — independent deployment runbook

## Current infrastructure

- **Vercel project:** konta-moy-fiscal (ID: prj_fZiejKLcPjXustPBw04NdlqKyP2H)
- **Vercel team:** sp-business-lab (team_5dwRGt0Xm0oad1COAbN0J3rF)
- **Code/deployment root:** fiscal/service
- **Region:** fra1 (Frankfurt)
- **Protection:** Vercel SSO applies to all targets. Not a public launch.
- **Source:** FISCAL foundation PR #1431 was merged into main on 2026-10-11. Follow-on host-routing correction: PR #1463 (draft until integration checks pass).
- **Database:** Dedicated Supabase Frankfurt project `kcpwxplxqtqdsfwlfsaa` provisioned. Migrations through `0013` are present, and additive `0014` foreign-key indexes are applied. Production database connectivity from the deployed app still requires a live health check.
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

The independent EU-region Supabase project has been provisioned. `FISCAL_DATABASE_URL` is configured as a sensitive Vercel **production** variable, not a shared marketplace credential. Confirm least-privilege runtime roles, backups, connection TLS verification and direct protected-production health checks before public onboarding. Do not repurpose unrelated Supabase projects.

Migrate with \`FISCAL_DATABASE_URL=postgres://... node scripts/fiscal-migrate.mjs\` from the repository root in a controlled environment. Do NOT run marketplace db:migrate here. Run \`node scripts/fiscal-db-smoke.mjs\` in CI against a throwaway isolated database only.

The SQL in fiscal/migrations manages merchants, organizations, sessions, test API credentials, draft records, append-only audit, marketplace pairing, internal compliance controls and independent one-time super-admin SSO. RLS and revoked browser grants are required. Actual runtime DB credentials must be least-privilege and isolated from marketplace production.

### Super-admin SSO without shared database

1. Marketplace super_admin signs in normally at KONTA MOY.
2. Authenticated super admin visits \`/admin/fiscal-access\`. Server validates existing session and constructs a signed, audience-bound, 60-second, one-time assertion.
3. Browser first establishes Vercel access to the independent FISCAL host, then obtains a fresh signed ticket. A top-level GET opens /timologio-admin/sso/bridge with the ticket in the URL fragment only.
4. The standalone bridge clears the fragment, then sends a same-origin URL-encoded POST. The Fiscal service verifies HMAC, signed audience/issuer, expiry, nonce and format.
5. Fiscal inserts ticket and a new, revocable, HttpOnly, Secure, SameSite-Strict two-hour session into its *own* database. Replaying the assertion fails through unique jti_hash.
6. Fiscal supervises only the independently authorized administration UI. Merchant tenant role claims are not inherited from marketplace permissions.
7. Fiscal sign out revokes its local session; the marketplace account remains signed in.

An active Fiscal super-admin session remains valid during a marketplace outage until its own expiry, assuming FISCAL is operational. *New* SSO still requires marketplace authentication (identity-provider dependency is separate from the application runtime).

### Dedicated route whitelist

The standalone app contains only /timologio, /timologio-admin and their declared API routes. Marketplace login, checkout, vendor impersonation, order APIs, research/email jobs and scheduler routes are **not registered**. The monorepo marketplace service retains /timologio/marketplace-link for the two-sided account pairing flow.

### Verification and remaining readiness

- Run \`node scripts/fiscal-route-isolation.mjs\`.
- CI builds \`fiscal/service\` separately, with DATABASE_URL and POSTGRES_URL cleared.
- GET /timologio/api/health must be checked on each target deployment: a provisioned database or a READY build does not prove connectivity. `operational_foundation` means only that the protected foundation is reachable; this is **not** a fiscal-certification signal.
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
- Public production launch remains blocked until the independent database connection and roles, verified SSO secrets, persistent service domain, backups, KYB, independent SSO/browser tests and regulatory approval are completed.


## Milestone 17 — 2026-10-11: sandbox trial balance and FK performance

- Added a **read-only Greek trial-balance view** at `/timologio/journal` with grouped test-account debits, credits and net amounts. Input is limited to the latest 20 immutable, tenant-scoped saved test snapshots; it explicitly excludes full-history and statutory accounting claims.
- Added `fiscal-sandbox-trial-balance.ts` with strict non-fiscal account/amount validation, BigInt cents and per-snapshot balancing, plus a Node test suite in dedicated Fiscal CI.
- `0014_fk_lookup_indexes.sql` adds seven idempotent covering indexes recommended by the Supabase performance advisor. This SQL was applied to the dedicated Supabase project via a separately recorded Supabase migration. It can safely be replayed by the repository's checksummed runner with `IF NOT EXISTS`.
- Advisor verification afterwards reported **no unindexed foreign keys**. The unused-index notices on this empty database do not justify removing performance indexes.
- The new protected Vercel Preview deployment of commit `4787dfa88a61998ead5d5afd201352fe95352f3d` was **READY**. This confirms the standalone build completed, not that production authentication, issuance, browser journeys or full GitHub CI have passed.
- Database currently has zero organizations, zero users and zero saved sandbox journals. Do not create artificial customer records on protected production or open public registration until identity, KYB and abuse checks are implemented.
- FISCAL's protected production deployment is READY and foundation PR #1431 is merged. This does not authorize public service. No lawfully valid Greek invoicing, payment collection, official ERP posting or AADE transmission is enabled.


## Milestone 19 — host routing and SSO entrypoint (2026-10-11)

**Separate origins are mandatory:** `kontamou.site` hosts marketplace authentication and vendor-side consent only; the independent service at `https://konta-moy-fiscal.vercel.app` owns merchant sessions, draft APIs, balances, and its Fiscal database. Never proxy merchant cookies or reuse the marketplace PostgreSQL connection.

The marketplace proxy delegates `GET/HEAD /timologio/*` navigation by a private/no-store 307 to the configured distinct HTTPS `FISCAL_SERVICE_BASE_URL`. The two exceptions are `/timologio/marketplace-link` (marketplace vendor confirmation page) and `POST /timologio/api/marketplace-link/confirm` (vendor-authorized confirmation API). Other marketplace `/timologio/api/*` and `/timologio-admin/api/*` requests return 404, never silently forwarding request bodies. Visiting marketplace `/timologio-admin/*` sends the operator to `/admin/fiscal-access`, where existing `super_admin` privileges authorize a one-use, signed SSO handoff. The FISCAL service itself continues to expose its own real authenticated routes.

**Manual protected-browser acceptance still required** after the PR is merged and marketplace deployment is READY:

1. Establish Vercel Deployment Protection access to FISCAL in a separate tab; return to marketplace /admin/fiscal-access, refresh for a fresh signed ticket, then open the fragment-based bridge.
2. Confirm the bridge removes the ticket fragment before POST and that a new FISCAL admin session can access /timologio-admin without acquiring marketplace vendor permissions or sharing marketplace cookies.
3. Attempt a replay of the same signed assertion, a wrong Origin, and an expired ticket; all must be denied and logout must revoke the session.
4. Navigate from marketplace `/timologio/login` to the independent FISCAL origin (307, no-store, no leaked marketplace cookie). Confirm the independent merchant login still requires a FISCAL account and public registration stays disabled.
5. Confirm vendor consent is still served on the marketplace and that other marketplace FISCAL APIs reject requests. Do not create live invoices, live order sync, taxpayer records or official accounting entries.
6. Check independent `/timologio/api/health` with appropriate protected access, and verify application and database audit/log monitoring.

**Caution:** Vercel Deployment Protection SSO is additional to marketplace-issued Fiscal SSO. The current protected production cannot serve arbitrary public users. A READY deployment or CI success alone does not prove actual browser SSO success.

## Milestone 20 — Protected same-origin FISCAL SSO bridge

Cross-site browser POSTs can be challenged by Vercel before they reach an app protected by Vercel Authentication. The marketplace therefore uses a top-level GET into an isolated FISCAL bridge with a 60-second signed assertion in its fragment; the fragment is not transmitted in that GET request.

The bridge immediately clears the fragment from browser history and exchanges the signed ticket using a same-origin URL-encoded POST to FISCAL. The callback rejects other origins and malformed forms. Signed issuer/audience validation, single-use PostgreSQL replay protection, session isolation and audit logging remain mandatory.

If Vercel Authentication sign-in discards the fragment, establish access to FISCAL first and then refresh the marketplace admin access page to issue a fresh ticket. Never share SSO links. Actual protected browser SSO acceptance is still pending even when CI security tests pass. Public merchant registration and legal fiscal issuance are still disabled.
