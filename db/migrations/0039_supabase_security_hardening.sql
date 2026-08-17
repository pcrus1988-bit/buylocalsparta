-- Buy Local Sparta — Supabase production hardening.
-- Public-schema tables are deny-by-default under RLS. Platform-wide access is available
-- only through a dedicated login credential that is a member of bls_platform_runtime.

GRANT USAGE ON SCHEMA public TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bls_app_runtime, bls_platform_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO bls_app_runtime, bls_platform_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bls_app_runtime, bls_platform_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO bls_app_runtime, bls_platform_runtime;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schema_name, target.table_name);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class pc ON pc.oid = p.polrelid
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      WHERE pn.nspname = target.schema_name
        AND pc.relname = target.table_name
        AND p.polname = 'bls_platform_runtime_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY bls_platform_runtime_all ON %I.%I FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()))',
        target.schema_name,
        target.table_name
      );
    END IF;
  END LOOP;
END
$$;
