# FISCAL M47 — reproducible backup/restore acceptance (22 October 2026)

## Scope and limits

M47 exercises a **real PostgreSQL 17 custom-format database backup and an actual restore to a separate, empty, local PostgreSQL database in CI**. It does not use, access, export or restore any production FISCAL or KONTA MOY marketplace data. It is not evidence that a specific Supabase production snapshot is restorable.

The M46 migration readiness guard already detects unapplied migrations 0018–0021 on the dedicated live FISCAL database. M47 addresses a *different* requirement: proving that a logically backed-up, disposable instance can be restored and that its security posture and test records survive. Restoring production backups requires a separately authorized, supervised drill with secrets, storage, network and access controls specific to the target.

## CI drill

The existing Fiscal Foundation CI:
1. Starts a disposable `postgres:17` service with a database named `fiscal_ci`.
2. Applies **every checked-in independent FISCAL migration** and verifies the exact migration checksums.
3. Runs `node --test scripts/fiscal-disposable-restore-drill.test.mjs` to reject production, remote, shared or misidentified database targets.
4. Runs `node scripts/fiscal-disposable-restore-drill.mjs` under `CI=true` and `FISCAL_RESTORE_DRILL_MODE=synthetic`.
5. Inserts one **synthetic, nonidentifying** test record into the disposable source's existing auth-rate-limit table. Then uses the matching `postgres:17` image's `pg_dump -Fc` client to create a custom archive in a temporary runner-only directory. Nothing is uploaded as an artifact.
6. Uses `pg_restore --list` to confirm archive readability. Creates a new empty `fiscal_restore_ci` database on the same ephemeral local service, and restores the archive with `--exit-on-error --clean --if-exists --no-owner --no-acl` **only inside that freshly created disposable restore database**. Cleaning the default `public` schema is necessary because the archive also owns its definition; this never runs on the source database.
7. Confirms **every exact migration filename/checksum** is preserved, verifies the synthetic row and timestamp, and checks all restored FISCAL tables retain RLS. The temporary dump is deleted even on errors.
8. Continues with existing Fiscal security, tenancy, schema, Next.js build and HTTP acceptance.

Only a localhost/127.0.0.1 source with exact database `fiscal_ci`, exact user `fiscal_ci`, and explicitly enabled CI synthetic mode is accepted. Source and restore database names differ. The script fails closed on any missing privilege, client or restore error and logs **no connection string, password, dump contents, tenant rows or raw DB errors**.

**The drill is intentionally not a production backup utility.** Never relax its CI-only and localhost restrictions to export real merchant data. The Docker image uses the same major PostgreSQL version (17) as the disposable service.

## Production backup release gate (NOT YET VERIFIED)

The linked Supabase organization is on Pro, for which Supabase documents scheduled daily backups. The specific FISCAL project's available backup inventory and successful test restore remain **unverified** by this code milestone.

An authorized operator must independently establish:

- A recent, identifiable backup of **only** the dedicated FISCAL project `kcpwxplxqtqdsfwlfsaa` in Supabase **Database → Backups**; do not confuse marketplace and FISCAL projects.
- Exact backup creation time, retention window, encryption/custody and scope. Supabase database backups **do not include Storage objects**; document separate Storage lifecycle/restore evidence if used.
- An isolated restoration rehearsal using an approved separate recovery environment and sanitized evidence. Verify FISCAL migration ledger, audit immutability, RLS, tenant isolation, DB roles, required functions and application-specific secrets/key custody, and fresh application health. A restore into an active production database is not an acceptable drill.
- A written incident/runbook owner, authorized access, RPO/RTO expectations, recovery rollback plan and restoration evidence reference stored in a secure system outside public GitHub. Never post real dump archives or database credentials in source control, GitHub Actions artifacts or chat.

Supabase's current backup guidance: https://supabase.com/docs/guides/platform/backups

## Production migration decisions

**M47 DOES NOT APPLY migrations 0018–0021.** They provide sensitive opt-in MFA recovery, security-alert outbox, signed delivery events and reconciliation tables. Production still requires the independently confirmed backup/restore drill, migration security review, appropriate operator delegation and approvals. Even once the tables exist, recovery and notifications stay off until verified contacts, two independent authorized approvers, a real-provider delivery drill and incident response. AADE certification and fiscal issuance remain disabled.

Use M46's read-only checker to inspect actual pending migrations:

```bash
node scripts/fiscal-migration-readiness.mjs
```

Do not run the separate write-enabled production migrator until the above release conditions are satisfied.