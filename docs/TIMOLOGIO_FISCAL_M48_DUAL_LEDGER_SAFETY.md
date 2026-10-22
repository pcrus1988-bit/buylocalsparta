# FISCAL M48 — independent migration history reconciliation (22 October 2026)

## Verified production issue

Read-only inspection of dedicated FISCAL PostgreSQL in project `kcpwxplxqtqdsfwlfsaa` showed **17** rows in `public.fiscal_schema_migrations`. The independent SQL source contains **22** checked-in migration files. The five unrecorded files are:

- `0014_fk_lookup_indexes.sql` — **all seven defined indexes already exist**, with expected PostgreSQL definitions. The separate Supabase migration list records `fiscal_fk_lookup_indexes_0014`.
- `0018_governed_mfa_recovery.sql`
- `0019_security_alert_outbox.sql`
- `0020_security_alert_delivery_receipts.sql`
- `0021_security_alert_reconciliation.sql`

The latter four tables and internal markers were absent at inspection. Supabase migration history is NOT a substitute for the dedicated FISCAL filename/SHA256 ledger. The exact original checksum for `0014_fk_lookup_indexes.sql` is not independently proven by the index definitions alone; it must be reconciled through the secure migration process after a real backup restore proof. Never insert a checksum marker on the basis of a similar migration name or a guess.

## New fail-closed control

`scripts/fiscal-migrate.mjs` now takes the advisory migration lock, freezes all local source files and their hashes, and performs `assertSafeFiscalMigrationPreflight` **before the first schema write**.

It refuses to run when:
- Any existing filename has changed SHA256 or any unrecognized ledger record exists.
- A foreign-key index from the specific 0014 migration exists without its internal ledger marker (including partial installation).
- The 0014 marker exists but one of its seven indexes is missing or its index definition is not exactly the expected btree/column/table.
- A known security migration 0018–0021 has a table without its marker, or a marker without its table.
- The migration ledger is absent but any FISCAL table is already present.

This protects production from reapplying a migration whose physical effects were already installed through another migration system. **It intentionally blocks the current production database.** That is a protective outcome, not an operational incident.

No production migration, merchant record, backup, security flag, MFA seed, payment or invoice was changed by M48.

## Live admin observability

`/timologio-admin/release-readiness` now displays a bounded read-only query over the *actual* FISCAL migration ledger, PostgreSQL index catalog, RLS table metadata, and the number of active super-admin MFA factors. No factor secret, session, email address, tenant account or merchant document is retrieved.

- It labels 0014 as a ledger-versus-index discrepancy when indexes exist without an internal marker.
- It lists the five known checkpoint names when they are missing. **This limited inventory does not prove every migration matches its source checksum.** The write preflight handles exact hashes.
- It reports missing RLS as a **count**, not sensitive policy contents.
- An MFA-factor count does not prove there are distinct qualified human approvers.
- Backup restore and legally certified invoice issuance explicitly remain **unverified/disabled**, regardless of green synthetic CI results or newly installed schema.

Admin authentication is required; the interface never mutates the database or attempts to activate integrations.

## Required production recovery path

1. Confirm a specific, recent FISCAL-only backup under Supabase Database > Backups for `kcpwxplxqtqdsfwlfsaa`; verify its restoration on a separate authorized recovery target. Database snapshots do not include Supabase Storage object bytes. Record the restoration evidence privately.
2. Perform an independently reviewed, read-only object-by-object reconciliation of `0014_fk_lookup_indexes.sql` versus both migration histories, including the exact checked-in source hash and any originally executed SQL. Do **not** automatically mark the migration complete based only on index names.
3. Design and review a narrowly scoped, audited correction for the missing FISCAL ledger marker only after sufficient evidence; run it separately from the bulk migrator, inside an approved transaction with rollback and backup.
4. Rerun M46 migration-readiness and M48 full preflight. Only then review application of migrations 0018–0021 with their own database, security and operational controls.
5. Keep legal issuance, live marketplace sync, mandatory operator MFA, governed recovery and alert dispatch **off** until their separate approvals, authentic multi-party delegation and provider delivery drills are successful.

The M47 disposable PostgreSQL backup/restore drill proves only that **synthetic CI data** can be recovered; it does not prove current Supabase production backup recovery.
