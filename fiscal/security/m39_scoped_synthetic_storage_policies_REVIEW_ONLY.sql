-- M39 REVIEW-ONLY SECURITY BLUEPRINT. NOT APPLIED TO LIVE SUPABASE.
-- DO NOT move into fiscal/migrations. Never grant to authenticator/users.
-- This requires a future independently approved, signed scoped JWT issuer.
-- Intended for disposable CI rehearsal; deployment separately gated.
DO $m39$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_roles
   WHERE rolname='fiscal_kyb_probe'
    AND NOT rolcanlogin AND NOT rolinherit AND NOT rolbypassrls
    AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb
 )
 OR pg_has_role('authenticator','fiscal_kyb_probe','MEMBER')
 OR pg_has_role('anon','fiscal_kyb_probe','MEMBER')
 OR pg_has_role('authenticated','fiscal_kyb_probe','MEMBER')
 OR EXISTS (
    SELECT 1 FROM pg_auth_members
     WHERE member=(SELECT oid FROM pg_roles WHERE rolname='fiscal_kyb_probe')
 )
 OR NOT EXISTS (SELECT 1 FROM pg_class
     WHERE oid=to_regclass('storage.objects') AND relrowsecurity)
 OR EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects')
 OR NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id='fiscal-kyb-quarantine'
     AND public IS FALSE AND file_size_limit=12582912
     AND allowed_mime_types=ARRAY['application/octet-stream']::text[]
 )
 OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='fiscal-kyb-quarantine')
 THEN RAISE EXCEPTION 'M39_SYNTHETIC_POLICY_NOT_SAFE_TO_STAGE';
 END IF;
END $m39$;

-- Grants apply ONLY to the unassumable no-login probe role, never to
-- authenticator, anon, authenticated or service_role.
GRANT USAGE ON SCHEMA storage TO fiscal_kyb_probe;
GRANT SELECT, INSERT, DELETE ON storage.objects TO fiscal_kyb_probe;
-- No UPDATE, TRUNCATE, REFERENCES, CREATE or access to unrelated tables.

CREATE POLICY fiscal_m39_synth_insert ON storage.objects
 FOR INSERT TO fiscal_kyb_probe
 WITH CHECK (bucket_id = 'fiscal-kyb-quarantine'
 AND name ~ '^__synthetic_m37__/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{32}[.]bin$'
 AND split_part(name, '/', 2) =
   (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'probe_run_id')
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'role')
   = 'fiscal_kyb_probe'
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'purpose')
   = 'fiscal_kyb_synthetic_probe_v1'
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'exp')::bigint
   > extract(epoch from now())::bigint
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'exp')::bigint
   <= extract(epoch from now())::bigint + 900);

CREATE POLICY fiscal_m39_synth_read ON storage.objects
 FOR SELECT TO fiscal_kyb_probe
 USING (bucket_id = 'fiscal-kyb-quarantine'
 AND name ~ '^__synthetic_m37__/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{32}[.]bin$'
 AND split_part(name, '/', 2) =
   (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'probe_run_id')
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'role')
   = 'fiscal_kyb_probe'
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'purpose')
   = 'fiscal_kyb_synthetic_probe_v1'
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'exp')::bigint
   > extract(epoch from now())::bigint
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'exp')::bigint
   <= extract(epoch from now())::bigint + 900
   AND storage.allow_any_operation(ARRAY[
      'object.get_authenticated',
      'object.get_authenticated_info',
      'object.delete'
   ]::text[]));

CREATE POLICY fiscal_m39_synth_delete ON storage.objects
 FOR DELETE TO fiscal_kyb_probe
 USING (bucket_id = 'fiscal-kyb-quarantine'
 AND name ~ '^__synthetic_m37__/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{32}[.]bin$'
 AND split_part(name, '/', 2) =
   (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'probe_run_id')
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'role')
   = 'fiscal_kyb_probe'
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'purpose')
   = 'fiscal_kyb_synthetic_probe_v1'
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'exp')::bigint
   > extract(epoch from now())::bigint
 AND (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'exp')::bigint
   <= extract(epoch from now())::bigint + 900);

-- Critical: this blueprint grants no role membership, issues no JWT,
-- and never grants access to any ordinary user.
