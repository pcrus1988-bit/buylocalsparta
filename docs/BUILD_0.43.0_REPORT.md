# Buy Local Sparta Build 0.43.0 — Deployment Topology / Vercel Hardening Report

## Scope

Build 0.43.0 converts the provider-ready codebase into an explicit deployment topology. It does not add another marketplace feature layer. The focus is preventing Vercel/serverless configuration from breaking the monorepo or accidentally hosting long-running worker responsibilities inside request functions.

## Vercel monorepo correction

The repository now contains a root `vercel.json` with the canonical web build:

- repository root as the Vercel project root;
- `npm install --ignore-scripts` from that root;
- `npm --workspace @buy-local-sparta/web run build`;
- output from `apps/web/.next`;
- Node 24 is retained through the root engine contract.

The root package declares `packageManager: npm@10.9.2` to make the package manager explicit in a workspace deployment even while the final registry-generated lockfile remains pending.

`apps/web` now has a prebuild context guard that verifies the root workspace and private `packages/*` sources are visible before Next.js starts. This turns the historical Vercel Root Directory mistake into a clear configuration error.

## Next.js workspace tracing

`apps/web/next.config.ts` now sets `outputFileTracingRoot` to the repository root. This ensures the server trace can include runtime files imported from private workspace packages outside `apps/web`.

The existing `transpilePackages` list remains the application bundling contract for private workspace packages, and `pg` remains server-external.

## Long-running workers

Added:

- `deploy/worker.Dockerfile`
- `deploy/worker-entrypoint.sh`
- `deploy/worker.env.example`
- `.dockerignore`

One Node 24 image can run exactly one fail-closed role selected by `BLS_WORKER_ROLE`:

- `postgres`
- `search`
- `notifications`
- `media`

Unknown/missing roles terminate rather than silently starting the wrong workload. The runbook explicitly requires independent processes instead of one combined process.

Production CI now typechecks the four worker entrypoints and builds the worker container in addition to the Next.js application.

## Web/worker dependency separation

A deployment-specific media defect was corrected: web readiness and signed-upload admission previously required direct ClamAV connectivity whenever the media pipeline was enabled. That would pressure operators to expose or route private `clamd` access into the Vercel web runtime.

Build 0.43 changes the boundary:

- Vercel web requires PostgreSQL + private object-storage signing/completion access;
- the media worker requires object storage + private ClamAV access;
- staging preflight still proves object storage and ClamAV separately.

The malware governance workflow itself is unchanged: the web cannot mark a file clean, and publication still depends on the worker-owned scan state plus rights/moderation approval.

## Environment/operations documentation

Added:

- `docs/DEPLOYMENT_TOPOLOGY.md`
- `docs/DEPLOYMENT_ENVIRONMENT_MATRIX.md`

The environment matrix explicitly keeps worker-only credentials away from unrelated Vercel functions where possible, including private ClamAV connectivity and Meilisearch index-management credentials.

## New regression gates

Added `npm run check:deployment` to the normal `npm run check` chain. It verifies:

- root Vercel build/install/output commands;
- Node 24 / explicit npm package-manager contract;
- web ESM/build-context guard;
- Next.js monorepo output tracing;
- absence of Vercel cron substitution for daemon workers;
- all four worker roles and fail-closed dispatch;
- Node 24 worker image;
- web readiness does not import/require ClamAV;
- deployment topology and environment-matrix documentation stays present.

## Validation performed locally

On the exact Build 0.43.0 source before packaging:

- 210/210 Core tests passed;
- 8/8 Viva tests passed;
- 4/4 AADE myDATA tests passed;
- 3/3 ClamAV/media tests passed;
- 2/2 Meilisearch tests passed;
- 3/3 Resend tests passed;
- 5/5 BOX NOW tests passed;
- 37/37 migrations verified;
- database-less preview-auth proof passed;
- project consistency gate passed;
- deployment topology gate passed;
- 4/4 development UI syntax checks passed;
- 6/6 structural accessibility checks passed;
- complete dependency-free HTTP marketplace smoke journey passed;
- 378 TS/TSX files syntax-transpiled successfully;
- 378 TS/TSX files scanned with zero broken relative imports;
- root `vercel.json` parsed successfully;
- all GitHub Actions workflow YAML parsed successfully;
- web build-context guard passed from the repository source tree.

## External evidence still required

This local environment cannot install the complete npm dependency graph, run PostgreSQL, or run Docker. Therefore the following are configured production/CI gates rather than claimed local evidence:

1. generate and commit a root `package-lock.json` from a network-enabled Node 24/npm environment;
2. run the real `next build` / Vercel build using the root monorepo configuration;
3. build and start the worker image for every role;
4. run live PostgreSQL/PostGIS database smoke;
5. retain staging activation evidence for the deployed web and provider scenarios.

No provider activation status was invented by this release.
