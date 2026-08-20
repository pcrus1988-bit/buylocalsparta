-- Least-privilege Supabase Vault bridge for KONTA MOY Daily VAPID secrets.
BEGIN;

CREATE OR REPLACE FUNCTION bls_private.get_daily_vapid_config()
RETURNS TABLE(secret_name text, secret_value text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, vault, bls_private
AS $$
  SELECT ds.name::text, ds.decrypted_secret::text
  FROM vault.decrypted_secrets ds
  WHERE ds.name IN (
    'bls_web_push_public_key',
    'bls_web_push_private_key',
    'bls_web_push_subject'
  )
  ORDER BY ds.name;
$$;

CREATE OR REPLACE FUNCTION bls_private.create_daily_vapid_secret(
  p_secret text,
  p_name text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, vault, bls_private
AS $$
DECLARE
  created_id uuid;
BEGIN
  IF p_name NOT IN (
    'bls_web_push_public_key',
    'bls_web_push_private_key',
    'bls_web_push_subject'
  ) THEN
    RAISE EXCEPTION 'Daily VAPID secret name is not allowed';
  END IF;
  IF p_secret IS NULL OR length(p_secret) < 3 THEN
    RAISE EXCEPTION 'Daily VAPID secret value is invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = p_name) THEN
    RAISE EXCEPTION 'Daily VAPID secret already exists: %', p_name;
  END IF;

  SELECT vault.create_secret(p_secret, p_name, p_description, NULL)
  INTO created_id;
  RETURN created_id;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.get_daily_vapid_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.create_daily_vapid_secret(text,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION bls_private.get_daily_vapid_config()
  TO bls_app_runtime, bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.create_daily_vapid_secret(text,text,text)
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;
