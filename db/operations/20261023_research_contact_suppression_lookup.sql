-- Emergency additive index for GDPR contact suppression, 2026-10-23.
-- Existing index starts with frame_unit_id and cannot efficiently seek by the
-- global (contact_type, contact_value_hash) pair used by suppression updates.
-- Historical query plans estimated cost ~12668 vs ~4 with this index.
-- Built and verified VALID+READY in the production Supabase DB on 2026-10-23.
-- Run only in a standalone autocommit connection (not inside a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS research_contact_points_type_hash_lookup_idx
  ON public.research_contact_points (contact_type, contact_value_hash);

-- Read-only verification:
-- SELECT ix.indisvalid,ix.indisready FROM pg_index ix
-- JOIN pg_class c ON c.oid=ix.indexrelid
-- WHERE c.relname='research_contact_points_type_hash_lookup_idx';

-- Non-destructive rollback, if needed:
-- DROP INDEX CONCURRENTLY IF EXISTS public.research_contact_points_type_hash_lookup_idx;
