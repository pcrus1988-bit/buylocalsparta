# Buy Local Sparta

Production-oriented implementation of the **Buy Local Sparta** human-first, multi-vendor local-commerce platform.

> **Buy Local. Know Your Vendor. Get Real Advice.**

## Build 0.45.0

Build 0.45.0 closes the merchant-visual gap left by Build 0.44 without weakening the media-governance model. `/shops` and `/vendor/[id]` now prefer approved merchant photography when a Vendor-approved published merchant story explicitly references an eligible Vendor-owned media asset; the existing generated merchant artwork remains the fallback when no governed photo is available. The public media stream independently revalidates Vendor activity, story publication/approval, media ownership, non-product scope, malware scan, rights approval, moderation approval and reviewed object metadata on every read.

Admin `/admin/content` now includes the supported story-to-media association workflow, so no direct SQL is required. Staff can choose only same-Vendor merchant/story images that have passed scan, rights and moderation checks, or remove the association to restore the generated fallback. The mutation requires `content.write`, CSRF verification, PostgreSQL platform scope and canonical Admin auditing. Product media and Fair Vendor Exposure behavior are unchanged. No migration is required; the existing `merchant_stories.og_image` association is used. See `docs/BUILD_0.45.0_REPORT.md` and `docs/GOVERNED_MERCHANT_MEDIA.md`.

## Build 0.44.0

Build 0.44.0 upgrades the customer storefront from generic category anchors and numbered placeholder art into a category-aware discovery layer. Six Greek-first category landing pages now route through the canonical catalog and existing Fair Vendor Exposure assignment path; `/shop` supports server-side category filtering; saved searches retain category intent; product, vendor and detail cards use a shared category visual system; and the catalog API can filter by category without exposing hidden supplier offers. A new `check:storefront` regression gate protects taxonomy mappings and fairness-routing boundaries. Production merchant/product photography remains a separate media-content activation step. See `docs/BUILD_0.44.0_REPORT.md`.

## Build 0.43.0

Build 0.43.0 turns the prepared integrations into an explicit deployment topology: the Vercel web project builds from the monorepo root, Next.js traces private workspace packages from that root, and four long-running Node 24 worker roles are packaged in a separate production container. Web readiness no longer requires private ClamAV network access; object storage is web-critical while malware scanning remains a media-worker/staging-evidence gate. See `docs/DEPLOYMENT_TOPOLOGY.md` and `docs/DEPLOYMENT_ENVIRONMENT_MATRIX.md`.

Build 0.42.1 forward-ports seven Vercel hotfix patches originally prepared against Build 0.37 onto the current 0.42 codebase. The fixes cover serverless preview session persistence, async catalog rendering, Admin fairness/order projection typing, Vendor trust/catalog TypeScript contracts, and Next.js TypeScript configuration. No migration or marketplace-domain behavior was changed. See `docs/BUILD_0.42.1_VERCEL_HOTFIX_REPORT.md`.

Build 0.42.0 adds the **staging activation and retained evidence layer** over the production integrations prepared in Builds 0.37–0.41. A new append-only PostgreSQL ledger records redacted provider checks by build/environment, while `npm run stage:preflight` performs read-only connectivity checks for PostgreSQL, Viva, AADE myDATA, Meilisearch, Resend, S3-compatible object storage, ClamAV, BOX NOW and the deployed `/api/health/ready` endpoint. The preflight refuses accidental Viva-live, BOX-NOW-production or AADE-production credentials when the deployment is labelled staging.

Connectivity is deliberately not treated as end-to-end proof. Controlled scenarios can be recorded separately with `npm run stage:evidence`; only the SHA-256 digest of the external reference is stored. Admin `/admin/activation` shows the latest evidence, build identity and expiry. Two manual GitHub workflows support staging preflight and operator-confirmed scenario evidence without placing provider credentials in repository files. See `docs/STAGING_ACTIVATION_RUNBOOK.md`.

Build 0.41.0 added the BOX NOW courier bridge; Build 0.40.0 connected Meilisearch and Resend; Build 0.39.0 prepared AADE myDATA; Build 0.38.0 added atomic Vendor rescue and S3/ClamAV media processing; Build 0.37.0 prepared Viva Smart Checkout.

**Activation remains evidence-gated.** This build does not invent successful provider tests: live/staging credentials and controlled scenarios must actually be exercised and retained before provider activation.

## Run the functional development build

The current execution environment contains Node 22 while the production target is Node 24 LTS. The core/runtime deliberately has no external runtime dependency and can be exercised here with Node's type-stripping flag:

```bash
npm run check
npm run dev:core
```

Then open:

- `http://localhost:3000/` — customer storefront
- `http://localhost:3000/join` — merchant application/onboarding
- `http://localhost:3000/vendor` — vendor backoffice
- `http://localhost:3000/admin` — platform admin

Demo accounts are printed by the server on startup. All demo merchants are fictional.

The production Next.js workspace can be built with `npm run check:web` after dependencies are installed under the Node 24 target. The canonical Vercel project Root Directory is the repository root (leave the dashboard Root Directory blank); `/vercel.json` then builds only the `@buy-local-sparta/web` workspace and serves `apps/web/.next`. Build 0.43.0 retains and extends the production CI recipe that provisions PostgreSQL/PostGIS, applies migrations, runs live database readiness/smoke checks and then executes the Next.js build. This local execution environment still cannot install the full Next/React/pg dependency tree or run PostgreSQL, so those CI steps remain configured deployment gates rather than claimed local proof.

## Current automated proof

`npm run check` now starts with a project-consistency gate, then runs migration integrity, the core suite, UI parsing, structural accessibility regression checks and the full HTTP critical-journey smoke test.

- release/package/docs/static-route/security-header/customer-session/vendor-session consistency gate passing
- merchant-directory regression gate proves active-Vendor/story approval, same-Vendor media ownership, scan/rights/moderation approval, Admin association/CSRF/audit boundaries and Fair Vendor Exposure separation
- 210 core tests passing
- 30,000-selection statistical fairness test plus multi-location fairness proof
- 37 SQL migrations verified by checksum; the pre-production migration-13 freshness-column repair remains explicitly documented in Build 0.34
- 4 generated development interfaces pass JavaScript syntax validation
- 6 rendered development interfaces pass structural accessibility regression checks
- production-web TypeScript/TSX source passes syntax transpilation and relative-import resolution in the release check
- strict Core, Viva-provider, AADE myDATA, Meilisearch, Resend, BOX NOW, object-storage, media-processing, media-worker and PostgreSQL-runtime TypeScript checks pass; the live DB integration smoke also has its own NodeNext semantic TypeScript gate
- Production CI provisions fresh PostgreSQL/PostGIS, applies all migrations, runs live DB smoke, typechecks long-running workers, builds the production worker image and executes the real Next.js production build
- live DB smoke is configured to prove two-instance customer + Vendor + Admin state plus persistent cart/checkout, oversell protection, atomic Vendor rescue, media intent/scan persistence, canonical search projection, Resend delivery/webhook dedupe and Viva provider-order/capture/refund/cancellation races when PostgreSQL is available
- direct account-runtime proof passed: authenticate → save product/search → customer-linked checkout → account order/notification projection
- direct Vendor operations proof passed: scoped catalog bootstrap → manual submit → CSV dry-run/commit → vendor-bound media → pending compliance → analytics/finance projection
- direct Admin governance proof passed across vendor transition, matching/trust, finance maker-checker, orders/returns, reviews, privacy, categories, CMS, recalls, analytics and maintenance
- focused production-web recall proof passed: public product → recall suppression across catalog/account → explicit resolve/restore → public product
- genuine zero-result saved search → later canonical publication → new-match alert → grouped notification mark-read/archive lifecycle
- localized recommendation explanations + brand/category diversity caps remain separate from vendor fairness
- full existing marketplace journey remains green across search, advice, checkout, pickup/shipping, finance, returns, compliance, CMS, analytics and operational controls

## Production target

- Node.js 24 LTS
- TypeScript
- server-rendered React / Next.js workspace
- PostgreSQL 18 + PostGIS as authoritative state
- Redis-compatible cache/queues, never financial source of truth
- Meilisearch external canonical-product search projection (prepared; live cluster/key evidence gated)
- S3-compatible object storage
- transactional outbox/workers plus Resend transactional-email delivery (prepared; verified sender/webhook evidence gated)
- Viva.com Smart Checkout adapter (prepared; live credentials/underwriting gated)
- AADE myDATA ERP transport adapter (prepared; accountant-approved mapping/issuance and Digital Goods Movement activation gated)
- BOX NOW locker-delivery adapter (prepared; staging/live credentials + webhook evidence gated) and Google Calendar/Meet adapters

The product remains a **modular monolith** until measured scale or compliance/team boundaries justify service extraction.

## Repository map

- `packages/core` — executable domain services and tests
- `packages/postgres-runtime` — production `pg` pool, SQL adapter, unified PostgreSQL persistence bundle and Viva payment orchestration
- `packages/viva-payments` — Viva.com Smart Checkout/OAuth/transaction/refund provider client
- `packages/aade-mydata` — AADE myDATA ERP transport client with non-blind transmission/reconciliation semantics
- `packages/meilisearch-search` — external canonical-product search adapter with separate query/index-management credentials
- `packages/resend-notifications` — transactional email provider and signed Svix/Resend webhook verifier
- `packages/object-storage` — private S3-compatible signed upload, verification and scan-safe promotion adapter
- `packages/media-processing` — dependency-light ClamAV INSTREAM client and malware-scan configuration
- `db/migrations` — normalized PostgreSQL schema and additive migrations
- `apps/web` — active production Next.js customer surface and domain-backed route layer
- `dev` — dependency-free functional web/API harness and smoke test
- `deploy` — Node 24 long-running worker container/entrypoint and deployment environment examples
- `docs` — architecture, decisions, deployment topology, sitemap, API, roadmap, legal gate and project status

## Commercial configuration discipline

The active build exposes only approved plan configuration:

- **Free Listing**
- **Founding / Early Bird** — EUR 1,500 planning price + VAT treatment pending final contract/accounting confirmation, 36 months, zero platform sales-service-fee snapshot, third-party/pass-through costs separate where contractually defined

A generic **Standard** plan exists only as a draft configuration. The earlier business-plan Local/Growth/Pro figures are not silently published because the later Product & Technical Blueprint says standard plan amounts are still to be approved.

## Important production gate

Do not connect real customer money, issue real tax documents, or sign merchants to the reseller flow until the seller/supplier contract, VAT/myDATA treatment, PSP underwriting, supplier invoicing and payout model are approved consistently. See `docs/DECISIONS.md` and `docs/LEGAL_TECH_GATE.md`.
