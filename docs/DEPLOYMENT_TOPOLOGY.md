# Buy Local Sparta — deployment topology

## Web: Vercel

The canonical Vercel project root is the **repository root**, not `apps/web`.

Required Vercel settings:

- Framework Preset: Next.js
- Root Directory: leave blank / repository root
- Node.js: 24.x
- Install Command: `npm install --ignore-scripts`
- Build Command: `npm --workspace @buy-local-sparta/web run build`
- Output Directory: `apps/web/.next`

The same settings are committed in `/vercel.json` so dashboard drift is visible in source control.

Why: `apps/web` imports private workspace packages from `/packages/*`. A Vercel Root Directory that isolates `apps/web` can make those files unavailable or cause npm to resolve unpublished `@buy-local-sparta/*` packages from the registry instead of the workspace.

The web deployment is request/response compute only. It may perform short provider calls from route handlers, but it must not host polling loops.

## Worker processes: long-lived container runtime

The following are deliberately **not Vercel Functions**:

- `postgres` — scheduled leases, reservation/payment reconciliation and retention
- `search` — Meilisearch reconciliation
- `notifications` — durable Resend delivery queue
- `media` — S3 staging/verification plus ClamAV streaming scan

Build the shared worker image:

```sh
docker build -f deploy/worker.Dockerfile -t buy-local-sparta-worker .
```

Run one independently scalable process per role:

```sh
docker run --env-file worker.env -e BLS_WORKER_ROLE=postgres buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=search buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=notifications buy-local-sparta-worker
docker run --env-file worker.env -e BLS_WORKER_ROLE=media buy-local-sparta-worker
```

Do not combine all four roles into one process. Separate roles reduce blast radius, allow different network access (especially private ClamAV), and allow independent restart/scaling.

## Release order

1. Build/test source in CI.
2. Apply PostgreSQL migrations as a one-off release command.
3. Deploy/update worker roles.
4. Deploy Vercel web.
5. Verify `/api/health/ready` reports the exact release build.
6. Run `stage:preflight -- --record` for staging.
7. Execute and record provider scenarios before production promotion.

## Vercel preview boundary

Database-less Vercel previews may use Build 0.42.1+ signed stateless demo sessions only when **all** explicit preview flags are enabled. That mode is not an alternative production topology.

## Data locality

Keep Vercel function region, PostgreSQL and provider-adjacent worker runtime in the same European geography where possible. Do not hard-code a Vercel region in source until the actual PostgreSQL region is selected; latency-sensitive database placement should be configured together.
