-- KONTA MOU — pin the Google identity cleanup trigger function search path.

BEGIN;

ALTER FUNCTION public.remove_external_identities_when_user_closed()
  SET search_path = '';

REVOKE ALL ON FUNCTION public.remove_external_identities_when_user_closed()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
