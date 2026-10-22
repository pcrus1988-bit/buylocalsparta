# FISCAL M50 — verified backup inventory is not verified restoration

**Scope:** the independent KONTA MOY FISCAL database project `kcpwxplxqtqdsfwlfsaa` only. Never use the marketplace project or a shared database.

## Why this control exists

M47 proved an isolated synthetic PostgreSQL custom-dump recovery, M48 stopped all production FISCAL migrations when the original 0014 indexes were present without the internal migration ledger checksum, and M49 independently verified the actual Supabase historical DDL. None of those proves recovery from a **real Supabase production backup**.

The current Supabase organization has a **Pro** plan, which ordinarily includes daily scheduled backups. A plan entitlement is not a successful project-specific backup inventory and does not prove a backup is restorable.

The connected Supabase MCP tools do **not** expose `GET /v1/projects/{ref}/database/backups`. The Management API does offer a read-only endpoint requiring `database:read` permissions. M50 adds a local authorized-operator checker for that endpoint without requiring any new production FISCAL application secrets.

## Actual production inventory check

From a secure operator shell on the exact checked-in repository:

1. Use a Supabase user Management API personal access token with sufficient permission for **this project**. Keep the token in the shell's secret management facilities. Never paste it into chat, git, CI logs, a query string, a frontend environment variable or an artifact.
2. Supply the token privately as `SUPABASE_ACCESS_TOKEN` and run:

```bash
node scripts/fiscal-backup-inventory.mjs
```

For a strict check that exits with code 2 if there is no **COMPLETED** backup from the last 48 hours:

```bash
node scripts/fiscal-backup-inventory.mjs --require-recent
```

The only remote action is a `GET` request to the fixed HTTPS endpoint `https://api.supabase.com/v1/projects/kcpwxplxqtqdsfwlfsaa/database/backups`. Redirects are refused; the body is capped at 64 KiB; network timeouts and errors are sanitized and do not reveal tokens or provider response bodies. The output gives the latest completed backup ID, time and physical/logical type, count of completed records, and the PITR setting. It does not print an API credential.

The `recentCompletedBackupPresent` flag is evidence **only of provider-reported inventory**, not backup consistency, a downloadable artifact or successful database restoration.

**Never infer `backedUpDataRestoreVerified` from inventory:** it remains `false` even when many backups are marked COMPLETED. `productionMigrationWritesAuthorized` and `statutoryIssuanceAuthorized` are also permanently false in this tool.

If the API denies the request, the inventory status is **unknown**. Do not report it as either no backups or success.

## Real-backup restore acceptance — mandatory separate procedure

1. Inspect and record the current scheduled backup or PITR restore-point inventory on the private Supabase dashboard: https://supabase.com/dashboard/project/kcpwxplxqtqdsfwlfsaa/database/backups/scheduled
2. Choose a specifically identified recent backup/restore point. Record a **non-sensitive** reference to it and its creation time in the private operations evidence store.
3. Restore or duplicate **into a different, authorized, isolated destination**. **Never run the Dashboard's normal restore against the production FISCAL project for a verification drill**, as it restores in place and may cause downtime/data loss.
4. Protect access to the isolated target; disable all email/webhook/payment/issuance workers and external integrations. Restore any custom role passwords securely, as Supabase backups may not contain them.
5. Perform read-only structural and actual data-integrity checks on the *restored* target, including its FISCAL migration checksum ledger, historical 0014 index definitions, RLS posture, business-record counts and operator security records. Keep sensitive row details out of logs. Use approved private operator evidence to link the exact provider backup to the verified destination.
6. Independently validate object storage recovery: Supabase PostgreSQL backups **do not include Storage object bytes**. Check separate encrypted object-level backups, not only their metadata.
7. Record proof that an independent operator reviewed the backup reference, restoration outcome, sample-data integrity, destination isolation, recovery timing and rollback plan.

**Only after steps 1–7 actually occur** may the production migration ledger correction be independently authorized. Do not insert the 0014 checksum automatically or execute migrations 0018–0021 without these controls.

## Tests

`node --test scripts/fiscal-backup-inventory.test.mjs` checks response parsing, stale/failed/in-progress inventory, token and project identity protection, HTTP error sanitization, untrusted JSON, oversized responses and the permanent deny states.

The CI test replaces the network layer with a controlled fixture; **CI does not access actual production backups, does not contain any management API tokens and does not prove live recoverability**.

Documentation:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/api/v1-list-all-backups

No production database records, credentials, fiscal payment, real backup artifact or Vercel production configuration are modified by M50.
