-- KONTA MOY expansion foundation — enforce least-privilege ACLs on HUB runtime tables.
-- RLS already protects row access; this migration removes broader default table grants
-- so bls_app_runtime is read-only and bls_platform_runtime owns controlled writes.

BEGIN;

REVOKE ALL ON TABLE public.expansion_hubs
  FROM anon, authenticated, bls_app_runtime, bls_platform_runtime;
REVOKE ALL ON TABLE public.market_hub_config
  FROM anon, authenticated, bls_app_runtime, bls_platform_runtime;

GRANT SELECT ON TABLE public.expansion_hubs, public.market_hub_config
  TO bls_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expansion_hubs, public.market_hub_config
  TO bls_platform_runtime;

DO $$
BEGIN
  IF NOT has_table_privilege('bls_app_runtime', 'public.expansion_hubs', 'SELECT')
     OR NOT has_table_privilege('bls_app_runtime', 'public.market_hub_config', 'SELECT') THEN
    RAISE EXCEPTION 'bls_app_runtime must retain read access to HUB runtime tables';
  END IF;

  IF has_table_privilege('bls_app_runtime', 'public.expansion_hubs', 'INSERT')
     OR has_table_privilege('bls_app_runtime', 'public.expansion_hubs', 'UPDATE')
     OR has_table_privilege('bls_app_runtime', 'public.expansion_hubs', 'DELETE')
     OR has_table_privilege('bls_app_runtime', 'public.market_hub_config', 'INSERT')
     OR has_table_privilege('bls_app_runtime', 'public.market_hub_config', 'UPDATE')
     OR has_table_privilege('bls_app_runtime', 'public.market_hub_config', 'DELETE') THEN
    RAISE EXCEPTION 'bls_app_runtime must be read-only on HUB runtime tables';
  END IF;

  IF NOT has_table_privilege('bls_platform_runtime', 'public.expansion_hubs', 'SELECT')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.expansion_hubs', 'INSERT')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.expansion_hubs', 'UPDATE')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.expansion_hubs', 'DELETE')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.market_hub_config', 'SELECT')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.market_hub_config', 'INSERT')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.market_hub_config', 'UPDATE')
     OR NOT has_table_privilege('bls_platform_runtime', 'public.market_hub_config', 'DELETE') THEN
    RAISE EXCEPTION 'bls_platform_runtime must retain controlled CRUD access to HUB runtime tables';
  END IF;

  IF has_table_privilege('anon', 'public.expansion_hubs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.expansion_hubs', 'SELECT')
     OR has_table_privilege('anon', 'public.market_hub_config', 'SELECT')
     OR has_table_privilege('authenticated', 'public.market_hub_config', 'SELECT') THEN
    RAISE EXCEPTION 'client Data API roles must not access HUB runtime tables';
  END IF;
END
$$;

COMMIT;
