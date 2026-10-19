-- M38 FISCAL-only, ONCE per independently hosted FISCAL Supabase project.
-- Apply via Supabase migration API (named m38_fiscal_kyb_probe_dormant_role).
-- This script is NOT in fiscal/migrations: the standalone fiscal migration
-- chain has not yet reached 0018-0021 on production.
--
-- NO Storage access. NO role memberships. NO JWT generation. NO object policy.
-- The role cannot be assumed by authenticator or merchant/user sessions.
DO $m38$
DECLARE
 r record;
BEGIN
 IF to_regclass('storage.objects') IS NULL
   OR NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid=to_regclass('storage.objects') AND relrowsecurity
   )
   OR EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
   )
   OR NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id='fiscal-kyb-quarantine'
      AND public IS FALSE
      AND file_size_limit=12582912
      AND allowed_mime_types=ARRAY['application/octet-stream']::text[]
   )
   OR EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id='fiscal-kyb-quarantine'
   )
 THEN
   RAISE EXCEPTION 'M38_FISCAL_BUCKET_SECURITY_PREFLIGHT_FAILED';
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM pg_roles WHERE rolname='fiscal_kyb_probe'
 ) THEN
   CREATE ROLE fiscal_kyb_probe
    NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER
    NOCREATEROLE NOCREATEDB NOREPLICATION;
 END IF;

 SELECT rolname,rolcanlogin,rolinherit,rolbypassrls,
        rolsuper,rolcreaterole,rolcreatedb,rolreplication
 INTO r FROM pg_roles WHERE rolname='fiscal_kyb_probe';

 IF r.rolcanlogin OR r.rolinherit OR r.rolbypassrls OR
    r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
    OR pg_has_role('authenticator','fiscal_kyb_probe','MEMBER')
    OR pg_has_role('anon','fiscal_kyb_probe','MEMBER')
    OR pg_has_role('authenticated','fiscal_kyb_probe','MEMBER')
    OR EXISTS (
      SELECT 1 FROM pg_auth_members m
      WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname='fiscal_kyb_probe')
    )
 THEN
   RAISE EXCEPTION 'M38_ROLE_NOT_DORMANT';
 END IF;
END $m38$;
COMMENT ON ROLE fiscal_kyb_probe IS
 'KONTA MOY FISCAL M38: DORMANT NOLOGIN role; NO authenticator grants, NO RLS policies, NO credentials. Not authorized for live Storage access.';
