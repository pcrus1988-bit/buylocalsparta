-- Least-privilege Supabase Vault bridge for the KONTA MOU ΓΕΜΗ OpenData credential.
BEGIN;

CREATE OR REPLACE FUNCTION bls_private.get_gemi_opendata_api_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, vault, bls_private
AS $$
  SELECT ds.decrypted_secret::text
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'gemi_opendata_api_key'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION bls_private.get_gemi_opendata_api_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.get_gemi_opendata_api_key()
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;
