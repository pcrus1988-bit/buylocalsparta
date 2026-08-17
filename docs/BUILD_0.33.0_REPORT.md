# Buy Local Sparta — Build 0.33.0 Report

**Release:** 0.33.0  
**Focus:** Customer PostgreSQL application-service cutover  
**Date:** 15 August 2026

## Summary

Build 0.33.0 is the first request-time production-state cutover onto the PostgreSQL runtime introduced in Build 0.32. When `DATABASE_URL` is configured, the production Next.js customer account no longer depends on per-process memory for identity/session and customer-owned personalization state.

The cutover is intentionally incremental. Customer commerce/order state remains on the existing deterministic commerce adapter, and Vendor/Admin request-time state remains pending PostgreSQL cutover. This avoids mixing identity, finance/commerce and governance persistence changes in one release.

## PostgreSQL-backed customer state

The production customer path now uses PostgreSQL for:

- password authentication of existing verified customer accounts;
- opaque signed browser sessions with only token hashes persisted;
- persisted CSRF proof and shared session restoration;
- cross-instance logout/session revocation;
- cross-instance fixed-window login throttling using one-way hashed correlation keys;
- personalization/preferences;
- saved products and saved-product alert preferences;
- recently viewed products;
- saved searches;
- notification-centre state;
- privacy export/request state and Admin privacy processing.

`customer-state-runtime.ts` automatically selects PostgreSQL whenever `DATABASE_URL` is configured. Real production still fails closed when shared database state is missing; the memory adapter remains development/explicit-preview only.

## Authentication hardening

`PostgresCustomerAuthService` now:

1. verifies the account password and active/verified/customer role state;
2. signs an opaque browser token with the shared application secret;
3. persists only the token hash plus hashed CSRF proof;
4. restores sessions from PostgreSQL across instances;
5. verifies the persisted CSRF hash before returning a session principal;
6. touches shared session activity;
7. revokes the database session on logout.

Passwordless identities are treated as unavailable to password authentication instead of throwing while mapping a nullable `password_hash`.

## Migration 0029 and login throttling

`0029_customer_account_runtime.sql` adds `auth_rate_limit_windows`. Keys are SHA-256 correlations of route + trusted visitor identity rather than raw browser identifiers. The PostgreSQL worker now includes `retention.auth_rate_limits` and deletes stale windows after seven days.

The migration checksum is registered and the immutable migration verifier now validates 29 migrations.

## Cross-instance database proof configured in CI

`scripts/db-integration-smoke.ts` now creates two independent PostgreSQL runtime instances and is designed to prove:

- a session created by runtime A is recognized by runtime B;
- saved/preferences/search/notification/privacy state written by A is visible to B;
- login throttling is enforced across instances;
- revocation in B invalidates the session in A.

The Node 24 production CI applies all migrations, checks DB readiness, executes this smoke test and then performs the real Next.js build.

## Production login behavior

The customer login page now enables the real production path when `DATABASE_URL` is present rather than incorrectly treating PostgreSQL identity as a future feature. `BLS_AUTH_SECRET` must be shared across all web instances. Fictional demo credentials remain development/explicit-preview only.

Production self-registration and transactional email verification delivery are **not** activated in this release. Existing verified PostgreSQL customer accounts can authenticate; the project does not fake an email provider or expose verification secrets to simulate a launch-ready registration flow.

## Regression controls added

The project consistency gate now checks that:

- the customer state runtime selects PostgreSQL with `DATABASE_URL`;
- the customer auth service retains DB session/save/find/revoke boundaries;
- restored sessions validate the persisted CSRF proof;
- passwordless identities fail password authentication cleanly;
- migration 0029 retains persistent login throttling;
- the durable worker retains bounded login-throttle storage;
- production login is enabled by the DB backend;
- PostgreSQL runtime typecheck remains part of production CI;
- live DB smoke retains cross-instance state/revocation/rate-limit assertions.

## Validation completed locally

On the exact 0.33.0 source before packaging:

- 209 / 209 Core automated tests passed;
- 29 / 29 immutable SQL migrations verified by checksum;
- project consistency/security/PostgreSQL gate passed;
- 4 / 4 generated development UI syntax checks passed;
- 6 / 6 structural accessibility checks passed;
- complete dependency-free HTTP marketplace smoke journey passed;
- strict Core TypeScript check passed with zero errors;
- 124 production-web `.ts`/`.tsx` files syntax-transpiled with zero errors;
- 124 production-web files passed relative-import resolution;
- PostgreSQL runtime/worker/DB-smoke source files passed Node type-stripping syntax checks;
- focused persistence proof passed: valid signed session restores, persisted-CSRF mismatch is rejected, and revoked session does not restore;
- no temporary `node_modules`, proof scripts, symlinks, `.next`, or cache directories are included.

## Validation not claimed locally

This execution environment does not provide a PostgreSQL server and cannot freshly install the full Next/React/pg dependency tree. Therefore this report does **not** claim local execution of:

- the live PostgreSQL/PostGIS migration/RLS/cross-instance smoke;
- `npm run typecheck:postgres-runtime` against the installed official `pg` type package;
- the genuine Node 24 `next build`.

Those are configured as production CI/deployment gates and must pass before deployment.

## Remaining production cutover

Highest-priority next persistence work:

1. move customer commerce/cart/order request state to PostgreSQL and prove reservation/order concurrency;
2. move Vendor sessions, catalog operational state and fulfilment mutations to PostgreSQL;
3. move Admin staff sessions, audit/governance and finance controls to PostgreSQL;
4. run RLS/cross-instance/concurrency tests for each stage;
5. then connect provider-backed S3/media, workers/search, notifications, courier, PSP and ERP/myDATA integrations.

The legal/PSP/accounting launch gates remain unchanged.
