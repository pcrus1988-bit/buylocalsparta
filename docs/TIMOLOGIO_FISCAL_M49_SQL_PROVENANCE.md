# FISCAL M49 — Provenance proof for already-applied 0014 indexes (22 October 2026)

## Confirmed independent evidence

The FISCAL PostgreSQL project is `kcpwxplxqtqdsfwlfsaa`. Read-only inspection of `supabase_migrations.schema_migrations` found exactly one migration:

- Version `20261011145704` / name `fiscal_fk_lookup_indexes_0014`.
- **Original executed SQL is preserved in the `statements` array**. It contains seven `CREATE INDEX IF NOT EXISTS` commands and no other operations.
- The commands match all seven operations in `fiscal/migrations/0014_fk_lookup_indexes.sql` after removing comments and the file's BEGIN/COMMIT envelope.
- All seven real `pg_catalog.pg_indexes` definitions agree with the expected public schema, table, B-tree method and indexed column.
- `public.fiscal_schema_migrations` nevertheless has **no checksum entry** for this file. It is not correct to describe 0014 as a physically missing migration.

The underlying divergence was caused by **different migration history mechanisms**: the official Supabase history recorded application, but the separate checksummed FISCAL ledger did not. This does **not** prove a production backup can be restored, and it does not authorize any ledger mutation.

## Reproducible read-only command

For authorized operators working from the exact checked-in repository revision, with the dedicated FISCAL database URL in a private environment, run:

```bash
node scripts/fiscal-0014-provenance.mjs
```

This command only reads the Supabase migration statement history, the FISCAL internal checksum ledger and `pg_catalog.pg_indexes` inside a bounded `BEGIN TRANSACTION READ ONLY`.

It validates the **entire seven-operation DDL**, not a prefix, index name alone or an approximate table match. It rejects extra operations, modified columns, unexpected index names, missing original SQL, duplicate migration history, changed B-tree definitions and inconsistent internal SHA256 checksums. It prints a sanitized JSON summary: the exact checked-in source hash, normalized DDL hash, version, seven verified operations, whether the internal marker exists and whether reconciliation is required. It never prints credentials, merchant records or the connection string.

Use `--require-reconciled` for a **read-only** policy check; it returns exit code 2 while the marker is missing. It cannot update the database in either mode.

### Isolated database regressions

```bash
node --test scripts/fiscal-0014-provenance.test.mjs
```

The FISCAL CI additionally replays a synthetic Supabase `schema_migrations` history row into its disposable PostgreSQL 17 database, verifies both the present-marker and missing-marker cases, simulates a tampered stored SQL body and rolls back **all** temporary changes. CI never accesses the live FISCAL database.

## Production recovery remains a separate operation

**The correct next step is a verified, isolated restoration of a recent production FISCAL backup.** The Supabase Pro plan normally schedules backups, but that is not proof of an accessible restorable backup for this project. No backup inventory or successful real-backup restore has been verified here.

Only after that evidence is recorded privately may the responsible operator review a separate, transactionally audited repair of *one* `fiscal_schema_migrations` row. A checksum entry must refer to the exact checked-in file and must only be recorded after the original executed DDL is independently confirmed. There is deliberately **no** `--repair` or `--apply` option in the M49 tool.

Run the M46 checksum readiness checker and M48 pre-write catalog gate after any properly authorized repair. Only then consider schema additions 0018–0021, with independent MFA/security contact, alert provider and backup controls.

FISCAL legal issuance, external ERP, official AADE/myDATA transmission, live marketplace sync and production MFA recovery are **not** authorized by this provenance inspection. M48 continues to refuse the current inconsistent production ledger.

Private FISCAL backup dashboard:
https://supabase.com/dashboard/project/kcpwxplxqtqdsfwlfsaa/database/backups/scheduled

Supabase backup guidance: https://supabase.com/docs/guides/platform/backups
