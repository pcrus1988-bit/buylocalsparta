# FISCAL M46 — independent database migration readiness (22 October 2026)

## Read-only status, not authorization

The standalone FISCAL production service is deployed through M45. A read-only check of its **dedicated** PostgreSQL database on 22 October 2026 found the internal fiscal migration ledger through `0017_operator_mfa_stepup.sql`; the four later migrations `0018`–`0021` were **not applied**. Independent catalog inspection also found the expected recovery and alert tables absent. This is an actual migration gap, not just a stale UI state.

These migrations implement opt-in MFA recovery and out-of-band security-alert delivery/reconciliation. **No activation is authorized by applying their schema.** MFA recovery and security-alert dispatch require separately approved security controls, independent approvers, real verified contacts, supervised provider delivery drills and a tested restore path. Certified Greek fiscal issuance remains disabled regardless of migration status.

## M46 inspection command

From the repository root, with the existing dedicated FISCAL DB URL available only in the approved private operator/CI environment:

```bash
node scripts/fiscal-migration-readiness.mjs
node scripts/fiscal-migration-readiness.mjs --require-current
```

The first form returns sanitized JSON with `expected`, `applied`, `pending` (migration filenames), `mismatched` (filename/checksum drift), `unexpected` (database migration without a checked-in file), `drift` and `current`. It exits with code 2 on drift, but allows missing migrations so operators can safely inspect a behind-production database. `--require-current` exits with code 2 if any migration is unapplied, and is intended for CI or post-maintenance verification.

The script rejects a FISCAL URL matching either marketplace `DATABASE_URL` or `POSTGRES_URL`, checks the exact SHA-256 of checked-in migration sources against the FISCAL-only ledger, and performs just a bounded `BEGIN TRANSACTION READ ONLY` catalog query. It does not alter user, merchant, financial or security records, does not apply migrations, and never logs DSNs or raw database errors.

A correct PostgreSQL table name or Supabase dashboard migration version is **not** sufficient evidence; FISCAL uses its own file-name/checksum ledger. A code deployment and a database migration are distinct operations.

## Conditions before applying anything to production

1. Confirm a restorable, independent **FISCAL-only** backup and perform a restore test; retain backup identifiers/evidence outside source control. Do not confuse the marketplace backup with the FISCAL backup.
2. Review migrations 0018–0021 for dependencies, locks, RLS, least privilege, rollback implications and the existing private-server-only access pattern.
3. Run all FISCAL CI tests against isolated disposable PostgreSQL and verify the preview release. Review security alerts and MFA recovery operational sign-offs.
4. Schedule supervised migration with an explicit maintenance and rollback/restore plan. Only the established controlled `node scripts/fiscal-migrate.mjs` path applies these migrations. No automatic production migration from this read-only milestone.
5. Repeat the M46 `--require-current` audit afterwards and verify the separate Admin release gates; keep all legal issuance / recovery / dispatch feature flags OFF until their own approvals and live drills complete.

For a dedicated development database, CI migrates with `scripts/fiscal-migrate.mjs` then invokes the new checker with `--require-current` to prevent unverified migration drift. Local pure-regression checks: `node --test scripts/fiscal-migration-readiness.test.mjs`.
