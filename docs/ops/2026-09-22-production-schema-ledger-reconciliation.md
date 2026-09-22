# Production schema ledger reconciliation — 2026-09-22

## Incident
Production Vercel deployments were blocked by the production schema fingerprint gate because migration `0266_general_build_guidance_evidence_hardening.sql` had a different SHA-256 in the production `public.schema_migrations` ledger than the checksum registered on `main`.

## Reconciliation
- Re-ran the current `0266` migration SQL against production after verifying the migration is idempotent (upserts, guarded updates, function/trigger replacement; no table/column drops, truncation, or deletes).
- Reconciled the production ledger entry for version 266 to the checksum registered in `db/migrations/checksums.0266.json`:
  `b3e14832d42da91daa94a48bdd741703bab3b1da684da6cd6b4ae66352cd7603`.
- Preserved the original `applied_at` timestamp.
- Did not disable or weaken `scripts/verify-production-schema-head.ts`.

## Related CI repairs
The same release window also included:
- `fix(ci): mirror Supabase postgres role in local migration bootstrap`
- `fix(seo): verify split sitemap architecture`

These address CI-only failures independently of the production schema gate.

## Rule going forward
Once a migration version has been applied to production, its SQL and checksum are immutable. Any later SQL changes must use a new migration version.
