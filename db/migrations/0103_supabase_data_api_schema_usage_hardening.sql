BEGIN;

-- Hosted Supabase owns PostGIS extension objects as supabase_admin. The project
-- postgres role can revoke ordinary marketplace privileges but cannot remove
-- grants issued by that extension owner. Close the exposed public schema to
-- Supabase Data API roles instead; the application uses direct PostgreSQL.
REVOKE USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the dedicated server runtime contract explicitly.
GRANT USAGE ON SCHEMA public TO bls_app_runtime, bls_platform_runtime;

COMMIT;
