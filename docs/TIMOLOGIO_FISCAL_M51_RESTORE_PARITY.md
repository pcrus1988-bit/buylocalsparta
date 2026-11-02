# FISCAL M51 — isolated restored-target structural parity

**Status: code and synthetic tests only. Not a production restore.** This milestone adds a strictly read-only comparison between the live, dedicated FISCAL PostgreSQL project (`kcpwxplxqtqdsfwlfsaa`) and a second Supabase project that an authorized operator has already restored **from a real production backup**. The script does not create the second project, restore anything, access customer records, repair migration history, or authorize fiscal issuance.

## Why this check is useful

M47 verified a synthetic `pg_dump`/`pg_restore` in disposable CI. M48 discovered that the real production FISCAL database has the seven 0014 FK indexes without the `0014_fk_lookup_indexes.sql` entry in the independent migration ledger. M49 verified the SQL provenance, while M50 added a Management API backup **inventory** query. Neither inventory nor synthetic restoration demonstrates that a *real* backup restores into an isolated target. M51 helps check **structural parity after an actual restore** without making any claims about the backup's origin or the correctness of restored data.

## Preconditions — no production mutation

1. The authorized operator independently confirms the completed source backup in the private FISCAL Supabase dashboard and securely records its exact identifier and completion time. Prefer a restoration point close enough to the source for a meaningful structural comparison; schema changes between backup and current source will correctly produce a failed parity check.
2. The operator explicitly approves the additional isolated project's **cost**, environment, and access boundary. Restore a real FISCAL backup to a **new, separate** project; never use in-place recovery on production for this check. Supabase's [restore to a new project](https://supabase.com/docs/guides/platform/clone-project) feature is available only on eligible paid plans and may incur extra charges.
3. The clone must not have outgoing email, webhooks, payments, scheduled jobs, automated issuance, or external integrations enabled. Apply independent access controls, disable outbound workers and inspect any copied credentials. Database restores do not copy Supabase Storage object bytes; independently validate object backups.
4. Use restricted **read-only** PostgreSQL connections to the production FISCAL project and restored target. Inject connection strings using private operator secret management. Do not paste passwords or connection strings into chat, issue comments, logs, CI, or shared artifacts.
5. Set `FISCAL_DATABASE_URL` to the real FISCAL source; `FISCAL_RESTORE_TARGET_URL` to the newly restored **different** Supabase project; `FISCAL_RESTORE_TARGET_PROJECT_REF` to that clone's exact 20-character Supabase project ref; and `FISCAL_RESTORE_INSPECTION_MODE` to `metadata-read-only`. Run the following in the repository root:

```bash
node scripts/fiscal-restore-parity.mjs
```

The script rejects a non-FISCAL source, the same source and destination project, an unexpected target ref, and any configured `DATABASE_URL`/`POSTGRES_URL` that resolves to either. Source and target identities are validated from the Supabase direct-connection host or transaction-pooler username. If a custom proxy obscures those identities, the inspection refuses rather than guessing.

## Exact read-only checks

Each endpoint is queried inside a **repeatable-read, read-only transaction** with a 5-second statement timeout. Only metadata is read:

- Exact filenames and SHA-256 hashes in `fiscal_schema_migrations` (not tenant data)
- The `fiscal_%` table inventory and its RLS flags
- Definitions of the seven original 0014 FK indexes, compared with immutable repository definitions
- Original Supabase migration history identity `20261011145704 / fiscal_fk_lookup_indexes_0014`

The inspector demands identical migration ledgers and table inventories on both endpoints, RLS enabled for every FISCAL table, and the seven expected index definitions on both. Any absent, duplicate, malformed, altered or unknown metadata, SQL error, or connection failure causes a sanitized fail-closed exit. The only successful output is a small metadata summary; it contains **no addresses, credentials, customer names, document content or personal records**.

**Critical limitation:** structural parity is not evidence of backup identity, data integrity, restore completion, recovered Storage objects, disaster recovery time, or an independently approved recovery. The output therefore always includes:

```json
{
  "restoredProductionBackupVerified": false,
  "restoredDataIntegrityVerified": false,
  "backupProvenanceVerified": false,
  "productionMigrationWritesAuthorized": false,
  "statutoryIssuanceAuthorized": false
}
```

A correct result may continue to report `originalIndexLedgerReconciliationPending: true`. That is the expected current M48/M49 finding, **not** authorization to insert the missing entry. Do not run 0018–0021 or enable any invoice / AADE / payment transition based on this tool.

## Independent release evidence still required

The separate authorized evidence review must associate the restored project with the **actual backup identifier** (not guessed from a clone), verify representative **restored data** against pre-backup/source evidence, verify separate Storage object recovery where needed, audit security isolation and permissions, and record independent approval and recovery timing. These steps cannot be replaced by M51's structural comparison.

## Automated test

`node --test scripts/fiscal-restore-parity.test.mjs` runs with fake metadata and no network, databases, Management API tokens or third-party costs. CI tests rejection of wrong project identities, source/target confusion, RLS loss, checksum drift, missing migration history, unexpected index definitions, transaction rollback on errors, and permanent denial of migration/issuance permissions.

No production database writes, migrations, restore requests, Supabase billing actions, or Vercel deployments are performed by this milestone.