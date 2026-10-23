-- Emergency zero-row-mutation PostgreSQL timeout recovery, 2026-10-23.
-- Applied to the production Supabase project with CREATE INDEX CONCURRENTLY.
-- Rationale: research reminders' contact-wide delivery safety EXISTS probes were
-- filtering 500k+ research_invite_messages by contact_point_id with no supporting
-- contact-leading btree index. Keep this operational DDL idempotent in source control.
-- Execute in a standalone autocommit session (never inside BEGIN/COMMIT).
-- CREATE INDEX CONCURRENTLY permits normal message writes during the build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS research_invite_messages_contact_point_lookup_idx
  ON public.research_invite_messages (contact_point_id)
  WHERE contact_point_id IS NOT NULL;

-- Read-only verification; must return indisvalid=true and indisready=true:
-- SELECT i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)
--   FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
--  WHERE c.relname='research_invite_messages_contact_point_lookup_idx';

-- If ever needed, rollback separately (no business-row modifications):
-- DROP INDEX CONCURRENTLY IF EXISTS public.research_invite_messages_contact_point_lookup_idx;
