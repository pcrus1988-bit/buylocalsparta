-- CI gate for Paint & Build / VITEX reachability.
-- Fails only when a current verified VITEX manufacturer product has a reviewed positive scenario rule
-- but assigned active commerce variants are not classified reachable. Unverified products are reported, not failed.
DO $$
DECLARE broken_count integer;
BEGIN
  WITH reviewed AS (
    SELECT scenario_key,substrate,interior_exterior FROM public.build_solution_profiles
    WHERE published=true AND review_status='approved' AND evidence_status='verified'
  ), positive AS (
    SELECT DISTINCT ar.product_id
    FROM reviewed s
    JOIN public.manufacturer_application_rules ar ON ar.active=true
      AND ar.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
      AND public.jsonb_condition_matches(jsonb_build_object('scenario_key',s.scenario_key,'substrate',s.substrate,'interior_exterior',s.interior_exterior),ar.condition_expression)
    JOIN public.manufacturer_products mp ON mp.id=ar.product_id
      AND mp.verification_status='verified' AND mp.product_system_status='current'
    JOIN public.manufacturer_application_profiles ap ON ap.product_id=mp.id
      AND ap.source_layer='manufacturer' AND ap.verification_status='verified' AND ap.is_current=true
    JOIN public.manufacturer_instruction_evidence ie ON ie.id=ar.source_evidence_id AND ie.is_current=true
    JOIN public.manufacturer_technical_sources ts ON ts.id=ie.source_id AND ts.is_current=true
  ), assigned AS (
    SELECT DISTINCT vcp.manufacturer_product_id
    FROM public.vitex_commerce_products vcp
    JOIN public.catalog_source_products csp ON csp.source_product_key=vcp.import_fingerprint
    JOIN public.catalog_sources cs ON cs.id=csp.source_id AND cs.code='vitex-commerce-media' AND cs.active=true
    JOIN public.vendor_catalog_assortments vca ON vca.source_product_id=csp.id
      AND vca.assortment_status NOT IN ('rejected','discontinued')
    WHERE vcp.active=true AND vcp.manufacturer_product_id IS NOT NULL
  )
  SELECT count(*) INTO broken_count
  FROM positive p JOIN assigned a ON a.manufacturer_product_id=p.product_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_vitex_studio_coverage c
    WHERE c.commerce_active AND c.manufacturer_product_id=p.product_id AND c.coverage_state='reachable_verified'
  );
  IF broken_count > 0 THEN
    RAISE EXCEPTION 'Paint Build VITEX reachability gate failed: % verified assigned product(s) have positive reviewed rules but no reachable commerce row', broken_count;
  END IF;
END $$;
