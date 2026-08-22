# Buy Local Sparta — deployment topology

## Web: Vercel

The canonical Vercel project root is the **repository root**, not `apps/web`.

Required Vercel settings:

- Framework Preset: Next.js
- Root Directory: leave blank / repository root
- Node.js: 24.x
- Install Command: `npm ci --ignore-scripts`
- Build Command: `npm ci --ignore-scripts && npm --workspace @buy-local-sparta/web run build`
- Output Directory: `apps/web/.next`

The same settings are committed in `/vercel.json` so dashboard drift is visible in source control. The repository-root `package-lock.json` is authoritative for CI, staging, Vercel and worker image dependency resolution; release paths must use `npm ci`, not `npm install`, so the tested graph is reproduced instead of re-resolved.

The current Vercel project has an observed dashboard Install Command override that still performs a preliminary `npm install --ignore-scripts` before the source-controlled build command. The connected Vercel integration available to this project does not expose a project-setting write action. Until that dashboard override is removed, the source-controlled Build Command intentionally runs `npm ci --ignore-scripts` again before `next build`; this clean reinstall is the authoritative dependency graph used by the actual web build. Removing the dashboard Install Command override later will eliminate the redundant preliminary install without changing the locked build result.

Why: `apps/web` imports private workspace packages from `/packages/*`. A Vercel Root Directory that isolates `apps/web` can make those files unavailable or cause npm to resolve unpublished `@buy-local-sparta/*` packages from the registry instead of the workspace.

The web deployment is request/response compute only. It may perform short provider calls from route handlers and may generate lightweight reports inline, but it must not host polling loops.

### Hard production schema gate

Every Vercel production build runs `scripts/verify-production-schema-head.ts` before `next build`. The production schema gate reads the immutable repository migration manifest and the live `public.schema_migrations` ledger through `DATABASE_URL`, then requires an exact match for every migration version, filename and SHA-256 checksum. A missing production migration, an unexpected production-only migration, or a checksum/filename mismatch fails the build before a new application deployment can become READY.

This gate is intentionally read-only. Schema changes must be applied as a separate one-off release action before the matching application commit is promoted. Preview and non-production Vercel builds skip this live-production comparison; CI still validates the full migration chain against an isolated PostGIS database.

If the gate reports drift, do not bypass it. Apply the repository migrations to production first and redeploy the exact same commit. This ordering prevents application code from reaching production ahead of the schema it expects.

## Worker processes: long-lived container runtime

The following are deliberately **not Vercel Functions**:

- `postgres` — scheduled leases, reservation/payment reconciliation and retention
- `search` — Meilisearch reconciliation
- `notifications` — durable Resend delivery queue
- `media` — S3 staging/verification plus ClamAV streaming scan
- `reports` — queued high-complexity reporting, multi-domain aggregation and PDF generation

Build the shared worker image:

```sh
docker build -f deploy/worker.Dockerfile -t buy-local-sparta-worker .
```

The worker image copies the repository-root lockfile before running `npm ci --omit=dev --ignore-scripts`, so worker dependencies are the same locked production graph validated by CI.

Run one independently scalable process per role:

```sh
docker run --env-file worker.env -e BLS_WORKER_ROLE=postgres buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=search buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=notifications buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=media buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=reports buy-local-sparta-worker
```

Do not combine all five roles into one process. Separate roles reduce blast radius, allow different network access (especially private ClamAV), and allow independent restart/scaling.

### Reporting execution modes

The report engine always creates a durable `report_jobs` row first.

- Default: `BLS_REPORT_ASYNC_ENABLED=false`. Reports are generated inline so the feature works without provisioning an extra worker.
- Scaled mode: set `BLS_REPORT_ASYNC_ENABLED=true` on the web process **and** run a `reports` worker. The deterministic planner sends high-complexity reports to the queue while smaller reports still finish inline.
- `BLS_REPORT_POLL_MS`, `BLS_REPORT_BATCH_SIZE` and `BLS_REPORT_WORKER_ID` belong on the `reports` worker.

Do not enable async mode unless at least one healthy `reports` worker is running, otherwise high-complexity report jobs will remain queued.

## Release order

1. Build/test source in CI from the committed `package-lock.json`.
2. Apply PostgreSQL migrations as a one-off release command.
3. Verify production `public.schema_migrations` matches the repository migration head and checksums.
4. Deploy/update worker roles from the same locked dependency graph.
5. Deploy Vercel web from the same locked dependency graph; the production prebuild independently repeats the schema-head verification and blocks on drift.
6. Verify `/api/health/ready` reports the exact release build/schema.
7. Run `stage:preflight -- --record` for staging.
8. Execute and record provider scenarios before production promotion.

For schema changes used by reporting, deploy the migration before enabling `BLS_REPORT_ASYNC_ENABLED`; both web and report worker refuse an unexpected application schema version.

## Vercel preview boundary

Database-less Vercel previews may use Build 0.42.1+ signed stateless demo sessions only when **all** explicit preview flags are enabled. That mode is not an alternative production topology. Durable PDF reports require the PostgreSQL runtime.

## Data locality

Keep Vercel function region, PostgreSQL and provider-adjacent worker runtime in the same European geography where possible. Do not hard-code a Vercel region in source until the actual PostgreSQL region is selected; latency-sensitive database placement should be configured together.
