-- Defense in depth: Fiscal tables must not be exposed through Supabase Data API.
-- Server-only PostgreSQL connections operate under a dedicated DB ownership/security model.
BEGIN;
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename LIKE 'fiscal_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',item.tablename);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',item.tablename);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',item.tablename);
    END IF;
  END LOOP;
END;
$$;
-- Future Fiscal migrations must apply the same security constraints to new tables.
COMMIT;
