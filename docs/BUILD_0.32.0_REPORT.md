# Buy Local Sparta — Build 0.32.0 Report

**Release:** 0.32.0  
**Focus:** PostgreSQL production-runtime foundation, deployment readiness and Core TypeScript hardening  
**Baseline:** Build 0.31.0

## Executive summary

Build 0.32.0 converts the previously prepared PostgreSQL repository layer into an executable production-runtime boundary. It adds a real `pg.Pool` workspace, database/schema readiness, live database smoke tooling, a durable PostgreSQL scheduled-job worker, a PostgreSQL/PostGIS local target and a Node 24 production CI recipe.

This is deliberately an **infrastructure foundation, not a false persistence-cutover claim**. Customer account, Vendor and Admin production-web application services still use deterministic preview adapters and continue to fail closed in real production. Their next step is request-time injection of the PostgreSQL repositories followed by live RLS/concurrency/multi-instance proof.

## Implemented

### PostgreSQL runtime workspace

- Added `packages/postgres-runtime` as `@buy-local-sparta/postgres-runtime`.
- Owns the real `pg.Pool` and adapts `Pool`/`PoolClient` to the existing Core `SqlPool` / `ReleasableSqlExecutor` contracts.
- Constructs the existing unified `PostgresPersistenceBundle` over the real pool.
- Adds an idle-client pool error listener so unexpected idle client failures are observed instead of becoming unhandled process errors.
- Centralizes database pool environment parsing and validation.

### Database readiness

Readiness now checks:

- PostgreSQL major version 18;
- `postgis` extension;
- `pgcrypto` extension;
- `citext` extension;
- exact applied migration version against the latest immutable repository migration (`0028`).

A database that is behind **or ahead** of the application schema is not considered ready.

Production Next.js now exposes:

- `GET /api/health/ready` — HTTP 200 only when the required database is ready; otherwise HTTP 503.

A database-less production-style preview requires the explicit `BLS_ALLOW_DATABASELESS_PREVIEW=true` override. It is not the normal production configuration.

### Deployment/database commands

Added:

- `npm run db:ready`
- `npm run db:smoke`
- `npm run check:postgres`
- `npm run worker:postgres`
- `npm run typecheck:core`
- `npm run check:release`

`db:smoke` uses a live transaction, transaction-local platform/request scope, verifies the Sparta market and required extensions, rolls the transaction back, and exercises the real PostgreSQL catalog repository.

### Durable PostgreSQL worker

Added `workers/postgres-worker.ts`, using the existing durable `PostgresScheduledJobStore` and lease semantics for database-native maintenance:

- inventory reservation expiry;
- security-event retention;
- analytics-event retention.

Provider-dependent search, external notification and media-processing workers are intentionally not fabricated in this release.

### PostgreSQL/PostGIS development and CI targets

Added `compose.postgres.yml` with a PostgreSQL 18/PostGIS service target.

Added `.github/workflows/production-ci.yml` defining the intended production verification path:

1. Node 24;
2. dependency installation;
3. full repository regression suite;
4. strict Core TypeScript check;
5. immutable migration application;
6. live PostgreSQL readiness;
7. live database integration smoke;
8. production Next.js build.

The CI workflow no longer forces a global `NODE_ENV=test`, avoiding test-environment leakage into the final Next.js build step.

### Next.js server dependency boundary

- Added the PostgreSQL runtime workspace to `transpilePackages`.
- Keeps `pg` server-only through `serverExternalPackages`.
- Adds server-side singleton lifecycle for the production PostgreSQL runtime.
- Keeps database credentials and the native database driver out of client code.

## Latent Core inconsistencies found and fixed

Adding a real strict Core TypeScript gate exposed compile-time mismatches that Node's runtime type stripping could not detect. They were corrected without changing intended domain behavior:

1. PostgreSQL analytics referenced a nonexistent `TransactionScope`; it now uses the actual `DatabaseScope` contract.
2. `PaymentStatus` did not include the already-used/tested `chargeback` state.
3. `FulfilmentMode` did not include database-supported `bulky_special`.
4. Replacement fulfilment now shares the canonical `FulfilmentMode` type rather than a narrower duplicate union.
5. Settlement, dispute and pickup services now distinguish public readonly records from their internally mutable stored state.
6. Media `ReviewStatus` was renamed to `MediaReviewStatus` to remove an ambiguous duplicate public export with verified-review status.
7. Authentication role-set construction now preserves the `Role` union instead of widening to `string`.
8. Inventory freshness rule lookup no longer produces an empty-string/undefined narrowing inconsistency.
9. Two invalid `readonly Array<T>` type forms were corrected to `ReadonlyArray<T>`.

## Consistency-gate expansion

`npm run check:consistency` now also verifies:

- `pg` version/dependency alignment across root, web and PostgreSQL runtime workspaces;
- local Core/PostgreSQL workspace version alignment;
- production Next.js server-only handling of `pg`;
- construction of the real `PostgresPersistenceBundle`;
- pool error handling;
- expected schema version equals the latest migration filename;
- readiness returns HTTP 503 when the database is unhealthy;
- durable worker job boundaries;
- required database environment variables;
- Node 24 + PostgreSQL/PostGIS CI steps;
- repaired Core union/scope contracts.

## Verification performed in this execution environment

Passed:

- 209/209 Core automated tests;
- 28/28 immutable SQL migration checksum checks;
- project consistency/security/PostgreSQL gate;
- 4/4 generated development UI syntax checks;
- 6/6 structural accessibility checks;
- complete HTTP critical-journey smoke workflow;
- strict Core TypeScript typecheck with zero errors;
- 121 production-web TypeScript/TSX files syntax-transpiled with zero errors;
- 121 production-web source files checked for relative import/asset resolution with zero missing paths;
- new PostgreSQL runtime/readiness/worker/scripts pass Node syntax checking.

## Verification not claimed locally

The current execution container does not provide a live PostgreSQL/PostGIS server and cannot install the complete project dependency tree from the npm registry. Therefore the following are **configured but not claimed as locally passed**:

- applying all migrations to a live PostgreSQL 18/PostGIS instance;
- live RLS and concurrency verification;
- `db:ready` / `db:smoke` against a real database;
- production Next.js `next build` under the installed Node 24 dependency tree;
- multi-instance customer/Vendor/Admin persistence behavior.

The new production CI workflow is specifically designed to execute the first four of those gates in an environment with network/dependency/database availability.

## Production state boundary after 0.32.0

Build 0.32.0 does **not** remove the existing production fail-closed behavior for ephemeral customer, Vendor or Admin state. The PostgreSQL runtime is now ready to be injected, but application-service cutover is intentionally the next phase so it can be tested incrementally rather than changing identity, commerce and governance persistence simultaneously.

## Recommended next phase

1. Replace production account session/personalization state with PostgreSQL-backed identity/privacy/engagement repositories.
2. Cut Vendor catalog/trust/advice/finance/returns projections and mutations to the PostgreSQL persistence bundle.
3. Cut Admin identity/audit/governance operations to PostgreSQL.
4. Run RLS cross-tenant and concurrent inventory/settlement tests against live PostgreSQL.
5. Make the live PostgreSQL CI workflow a required branch/deployment gate.
6. Then proceed to S3/media processing, durable external notification/search workers, courier, PSP and ERP/myDATA adapters.
