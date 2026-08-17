# Buy Local Sparta — Build 0.42.0 Report

**Release:** 0.42.0  
**Focus:** staging activation orchestration and retained provider evidence  
**Date:** 17 August 2026

## Summary

Build 0.42.0 turns the prepared production integrations into an auditable staging-activation workflow. It does not mark a provider launch-ready merely because credentials are present. Instead, the platform distinguishes configuration, connectivity, real staging scenario evidence, and deployed-build evidence.

The release adds a PostgreSQL-backed append-only activation-evidence ledger, provider-specific read-only preflight checks, Admin visibility, GitHub staging workflows, and cross-instance evidence persistence. Credentials and raw provider responses are never stored in the evidence ledger; only bounded/redacted metadata and SHA-256 evidence digests are retained.

## New activation evidence model

Migration `0037_activation_evidence.sql` adds `provider_activation_evidence` with platform-only RLS, append-only mutation protection, build/environment/provider/check identity, evidence status, expiry, bounded details, and a SHA-256 evidence digest.

Supported provider identities are:

- database
- viva
- mydata
- search
- email
- object_storage
- clamav
- boxnow
- web

Evidence check kinds distinguish:

- `configuration`
- `connectivity`
- `scenario`
- `deployment`

Statuses distinguish `passed`, `failed`, `blocked`, and `skipped`.

## Staging preflight

`npm run stage:preflight` now evaluates the configured staging environment without performing customer-facing destructive actions.

Provider checks include:

- PostgreSQL/PostGIS/schema readiness;
- Viva OAuth/Smart Checkout scope plus webhook credential reachability;
- AADE myDATA read-only transmitted-document request;
- Meilisearch health plus indexing-key presence;
- Resend sending-domain readiness plus webhook/suppression configuration;
- S3-compatible private object-storage bucket readiness and HTTPS upload origin;
- ClamAV `PING`;
- BOX NOW stage connectivity plus customer locker-widget configuration;
- deployed `/api/health/ready` over HTTPS with exact build-version match.

Staging-labelled runs explicitly reject Viva live, AADE production, and BOX NOW production environments.

`--record` persists the preflight result set only when the database itself is ready.

## Manual scenario evidence

`npm run stage:evidence` records operator-provided staging scenario evidence after a real external-provider test has been performed. Provider, check kind, and status are allow-listed. The external reference is hashed before persistence and operator notes are bounded.

The GitHub workflow `.github/workflows/staging-scenario-evidence.yml` passes workflow inputs through environment variables and quoted shell arguments rather than directly interpolating user input into shell commands.

## Admin visibility

`/admin/activation` shows the activation ledger to authorized platform staff, including build, environment, provider, check, status, observed/expiry times and evidence-digest prefix. It does not expose provider secrets or full external responses.

## GitHub staging workflow

`.github/workflows/staging-activation.yml` prepares an explicit privileged staging run using Node 24 and the GitHub `staging` environment. It runs the repository checks, activation typecheck, database readiness, and the recorded staging preflight against the deployed web URL.

A configurable activation runner allows private S3/ClamAV connectivity to use a self-hosted runner rather than exposing private infrastructure publicly.

## Cross-instance proof

The live PostgreSQL integration smoke now records activation evidence through one application runtime and confirms that a second independent runtime can read the same entry. This extends the existing cross-instance customer, Vendor, Admin, payment, media, search/email and courier proofs.

## Important production boundary

Build 0.42.0 prepares and audits staging activation; it does **not** claim that real external-provider scenarios have already occurred.

A provider is not considered launch-evidenced merely because configuration or connectivity succeeds. Real staging scenario evidence is still required for the applicable provider, for example:

- Viva demo payment, refund, reversal/webhook and cancellation-race scenarios;
- BOX NOW stage parcel creation, label, signed tracking webhooks, delivery and return/cancellation;
- S3 upload, ETag-conditional promotion and ClamAV scan;
- Meilisearch full projection/reconciliation and customer query path;
- Resend verified-domain delivery plus signed webhook lifecycle;
- AADE test-environment transmission only after accountant-approved mapping;
- PostgreSQL multi-instance/concurrency CI and real Node 24 Next.js build.

## Verification performed locally

Before packaging, the exact 0.42.0 source passed:

- 210/210 Core tests;
- 8/8 Viva tests;
- 4/4 AADE myDATA tests;
- 3/3 media/ClamAV tests;
- 2/2 Meilisearch tests;
- 3/3 Resend tests;
- 5/5 BOX NOW tests;
- 37/37 migration integrity checks;
- project consistency/security/PostgreSQL/provider/activation gate;
- 4/4 development UI syntax checks;
- 6/6 structural accessibility checks;
- complete dependency-free HTTP marketplace smoke journey;
- strict Core TypeScript;
- strict Viva TypeScript;
- strict AADE myDATA TypeScript;
- strict Meilisearch TypeScript;
- strict Resend TypeScript;
- strict BOX NOW TypeScript;
- strict PostgreSQL-runtime TypeScript;
- strict S3/object-storage TypeScript;
- strict media-processing and media-worker TypeScript;
- semantic live-DB smoke TypeScript;
- semantic staging-activation tooling TypeScript;
- all GitHub workflow YAML parsed successfully;
- 375 TypeScript/TSX files scanned with zero parse errors and zero missing relative imports before the report was added.

The strict semantic checks used temporary local type-resolution shims because the clean source archive intentionally contains no installed dependency tree. Those validation artifacts are removed before the final clean-tree regression and packaging.

## Not claimed locally

This environment does not provide the real external credentials/services needed to claim live activation. Therefore this report does not claim:

- a real Viva transaction;
- a real BOX NOW parcel;
- a real Resend delivery/domain webhook;
- a real Meilisearch cluster rebuild;
- a real S3/ClamAV staging object;
- a real AADE test transmission;
- live PostgreSQL/PostGIS integration execution;
- a genuine dependency-installed Node 24 `next build`.

Those are staging/CI promotion gates and are now represented explicitly by the activation workflows and evidence ledger.
