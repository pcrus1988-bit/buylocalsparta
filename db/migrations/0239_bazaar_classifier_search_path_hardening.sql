-- 0239_bazaar_classifier_search_path_hardening.sql
-- Pin the private NOVA/BAZAAR classifier functions to an empty search_path.
-- Their function bodies already schema-qualify private helper references, so this
-- is behavior-preserving while eliminating mutable search_path resolution risk.

ALTER FUNCTION bls_private.catalog_nova_condition_label(jsonb)
  SET search_path = '';

ALTER FUNCTION bls_private.catalog_nova_commerce_channel(jsonb)
  SET search_path = '';
