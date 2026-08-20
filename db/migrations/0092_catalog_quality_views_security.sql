BEGIN;

ALTER VIEW public.catalog_family_schema_completeness SET (security_invoker = true);
ALTER VIEW public.catalog_variant_schema_completeness SET (security_invoker = true);
ALTER VIEW public.catalog_variant_publish_readiness SET (security_invoker = true);

REVOKE ALL ON public.catalog_family_schema_completeness FROM anon, authenticated;
REVOKE ALL ON public.catalog_variant_schema_completeness FROM anon, authenticated;
REVOKE ALL ON public.catalog_variant_publish_readiness FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.catalog_family_schema_completeness FROM bls_app_runtime, bls_platform_runtime, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.catalog_variant_schema_completeness FROM bls_app_runtime, bls_platform_runtime, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.catalog_variant_publish_readiness FROM bls_app_runtime, bls_platform_runtime, service_role;

GRANT SELECT ON public.catalog_family_schema_completeness TO bls_app_runtime, bls_platform_runtime, service_role;
GRANT SELECT ON public.catalog_variant_schema_completeness TO bls_app_runtime, bls_platform_runtime, service_role;
GRANT SELECT ON public.catalog_variant_publish_readiness TO bls_app_runtime, bls_platform_runtime, service_role;

COMMIT;
