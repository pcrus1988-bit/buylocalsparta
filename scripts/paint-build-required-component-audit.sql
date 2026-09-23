-- Paint & Build required-component audit.
-- Read-only. Lists positive manufacturer rules whose required primer/component cannot yet
-- be assembled as a verified, current, priced VITEX commerce component.
WITH required AS (
  SELECT mp.product_name finish_product, ar.rule_key,
    COALESCE(ar.actions->>'required_primer', ar.actions->'primer_options'->>0) required_component
  FROM public.manufacturer_application_rules ar
  JOIN public.manufacturer_products mp ON mp.id=ar.product_id
  WHERE ar.active=true
    AND ar.result_status IN ('requires_specific_primer','requires_system_component')
    AND (ar.actions ? 'required_primer' OR jsonb_array_length(COALESCE(ar.actions->'primer_options','[]'::jsonb))>0)
), component AS (
  SELECT r.*, cmp.id component_product_id,cmp.verification_status,cmp.product_system_status,
    EXISTS (
      SELECT 1 FROM public.manufacturer_application_profiles ap
      WHERE ap.product_id=cmp.id AND ap.source_layer='manufacturer'
        AND ap.verification_status='verified' AND ap.is_current=true
    ) verified_profile,
    EXISTS (
      SELECT 1 FROM public.vitex_commerce_products vcp
      WHERE vcp.manufacturer_product_id=cmp.id AND vcp.active=true
        AND vcp.match_status IN ('verified','product_matched') AND vcp.price_minor>0
    ) priced_commerce
  FROM required r
  LEFT JOIN public.manufacturer_products cmp ON lower(cmp.product_name)=lower(r.required_component)
)
SELECT *,
 CASE
  WHEN component_product_id IS NULL THEN 'component_identity_missing'
  WHEN verification_status IS DISTINCT FROM 'verified' OR NOT verified_profile THEN 'component_technical_unverified'
  WHEN product_system_status IS DISTINCT FROM 'current' THEN 'component_not_current'
  WHEN NOT priced_commerce THEN 'component_not_sellable'
  ELSE 'component_ready'
 END component_state
FROM component
ORDER BY component_state,finish_product,rule_key;
