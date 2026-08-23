-- Buy Local Sparta — reviewed Nikolaou supplier-leaf taxonomy tranche v2.
--
-- Scope: 20 clean supplier leaves sampled from the remaining low-confidence
-- Nikolaou backlog. Each leaf maps directly to an existing KONTAMOU product
-- class. Mixed leaves and leaves requiring new taxonomy classes are excluded.
--
-- Safety:
-- - keyed by catalog source + stable source taxonomy source_key, never DB UUIDs
-- - refuses conflicting approved mappings
-- - preserves prior fallback evidence as superseded rather than deleting it
-- - does not create canonicals, VendorOffers, inventory, prices or publication
-- - idempotent: rerunning retains the same approved target mapping

BEGIN;

DO $$
DECLARE
  v_source_id uuid;
  v_node_count integer;
  v_label_count integer;
  v_target_count integer;
  v_conflicting_approved integer;
  v_final_count integer;
  v_competing_live integer;
BEGIN
  SELECT id
  INTO v_source_id
  FROM public.catalog_sources
  WHERE code = 'nikolaou-tools'
    AND active = true
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Active catalog source nikolaou-tools was not found';
  END IF;

  CREATE TEMP TABLE reviewed_leaf_taxonomy_v2 (
    source_key text PRIMARY KEY,
    expected_label text NOT NULL,
    target_code text NOT NULL,
    review_reason text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO reviewed_leaf_taxonomy_v2(source_key, expected_label, target_code, review_reason)
  VALUES
    ('nikolaou:5ef4f8952a658e7e3241', 'Μπαταρίες-Φορτιστές NFORCE', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: NFORCE batteries, chargers and battery cables are garden-machine accessories'),
    ('nikolaou:8d6843cb13e1739976f9', 'Δίδυμοι τροχοί', 'power-tools', 'Reviewed supplier leaf: powered bench grinders are power tools'),
    ('nikolaou:b6500efb1e2a8f988957', 'Κεφαλές Θαμνοκοπτικών', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: trimmer heads are garden-machine accessories'),
    ('nikolaou:83ca2b6855a4d2654884', 'Φαλτσοπρίονα', 'power-tools', 'Reviewed supplier leaf: powered mitre saws are power tools'),
    ('nikolaou:d011af2ae9fa7506f1a4', 'Έπιπλα Γραφείου', 'office-furniture', 'Reviewed supplier leaf: office chairs are office furniture'),
    ('nikolaou:b79b26376debb17c6fee', 'Εστίες Επαγωγικές', 'ovens-hobs', 'Reviewed supplier leaf: electric and induction tabletop hobs belong to ovens and hobs'),
    ('nikolaou:62d5b5896e2806c7c259', 'Μαγνητικές Γωνίες Συγκόλλησης', 'tool-accessories-consumables', 'Reviewed supplier leaf: welding magnets and magnetic angles are tool accessories'),
    ('nikolaou:5ca2547b0661675b1d68', 'Μάσκες - Ωτοασπίδες', 'safety-ppe', 'Reviewed supplier leaf: brushcutter masks, ear defenders and protective helmets are PPE'),
    ('nikolaou:7a153a4da81941d5783d', 'Εστίες Κεραμικές', 'ovens-hobs', 'Reviewed supplier leaf: ceramic electric hobs belong to ovens and hobs'),
    ('nikolaou:8fab50804ff6183d4f8f', 'Ηχεία', 'soundbars-speakers', 'Reviewed supplier leaf: portable Bluetooth speakers belong to speakers'),
    ('nikolaou:17fe1641f64d08254a4d', 'Αερόκλειδα', 'power-tools', 'Reviewed supplier leaf: pneumatic impact wrenches are powered tools'),
    ('nikolaou:0909097561caa89351b6', 'Καρφωτικά Αέρος', 'power-tools', 'Reviewed supplier leaf: pneumatic nailers and staplers are powered tools'),
    ('nikolaou:ec93f22c7ccad1bf62fb', 'Δίσκοι Θαμνοκοπτικών', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: brushcutter blades and discs are garden-machine accessories'),
    ('nikolaou:87de56e3bb5736e10b2e', 'Ιμάντες Θαμνοκοπτικών', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: brushcutter harnesses are garden-machine accessories'),
    ('nikolaou:f7da845de9abcd690493', 'Μουσαμάδες', 'garden-outdoor-accessories', 'Reviewed supplier leaf: outdoor tarpaulins are garden and outdoor accessories'),
    ('nikolaou:1d23f46ab5c3978137f5', 'Σίτες Κουνουπιών', 'door-window-hardware', 'Reviewed supplier leaf: mosquito screens and screen rolls are door/window hardware'),
    ('nikolaou:b08acbc84c8444f7b6db', 'Χλοοτάπητες', 'garden-outdoor-accessories', 'Reviewed supplier leaf: synthetic turf is a garden/outdoor product'),
    ('nikolaou:e6a3334d90fcf5dd4ffd', 'Δίσκοι Τροχιστικών', 'tool-accessories-consumables', 'Reviewed supplier leaf: sharpening and grinding discs are tool consumables'),
    ('nikolaou:28b34e422d6ee59ce32a', 'Σκουπάκια χειρός', 'vacuum-cleaners', 'Reviewed supplier leaf: rechargeable handheld and stick vacuums are vacuum cleaners'),
    ('nikolaou:1fb3fa399bd6370b3ecc', 'Βάσεις Εργαλείων', 'tool-accessories-consumables', 'Reviewed supplier leaf: drill and angle-grinder stands are tool accessories');

  SELECT count(*), count(DISTINCT n.source_label)
  INTO v_node_count, v_label_count
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
   AND n.source_label = r.expected_label;

  IF v_node_count <> 20 OR v_label_count <> 20 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou v2 leaf identity assertion failed: expected 20 nodes / 20 labels, got % nodes / % labels', v_node_count, v_label_count;
  END IF;

  SELECT count(DISTINCT c.code)
  INTO v_target_count
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.categories c
    ON c.code = r.target_code
   AND c.active = true
   AND c.assignable = true;

  IF v_target_count <> 10 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou v2 category assertion failed: expected 10 active assignable target categories, got %', v_target_count;
  END IF;

  SELECT count(*)
  INTO v_conflicting_approved
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
  JOIN public.catalog_source_category_mappings m
    ON m.source_taxonomy_node_id = n.id
   AND m.mapping_status = 'approved'
  JOIN public.categories c
    ON c.id = m.category_id
  WHERE c.code <> r.target_code;

  IF v_conflicting_approved <> 0 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou v2 leaf batch found % conflicting approved mappings; manual resolution required', v_conflicting_approved;
  END IF;

  UPDATE public.catalog_source_category_mappings m
  SET mapping_status = 'superseded',
      reviewed_at = COALESCE(m.reviewed_at, now()),
      reason = concat_ws(' · ', NULLIF(m.reason, ''), 'Superseded by reviewed Nikolaou supplier-leaf classification v2'),
      metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'supersededBy', 'nikolaou_reviewed_leaf_taxonomy_v2',
        'supersededAt', now()
      ),
      updated_at = now()
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
  JOIN public.categories target
    ON target.code = r.target_code
  WHERE m.source_taxonomy_node_id = n.id
    AND m.category_id <> target.id
    AND m.mapping_status IN ('candidate', 'rejected', 'superseded');

  UPDATE public.catalog_source_category_mappings m
  SET mapping_status = 'approved',
      mapping_method = 'manual',
      confidence = 0.99,
      reason = r.review_reason,
      reviewed_at = COALESCE(m.reviewed_at, now()),
      metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object(
        'reviewedBy', 'nikolaou_reviewed_leaf_taxonomy_v2',
        'sourceCode', 'nikolaou-tools',
        'reviewedAt', now(),
        'reviewBasis', 'supplier_leaf_label_plus_sampled_product_titles'
      ),
      updated_at = now()
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
  JOIN public.categories target
    ON target.code = r.target_code
   AND target.active = true
   AND target.assignable = true
  WHERE m.source_taxonomy_node_id = n.id
    AND m.category_id = target.id
    AND m.mapping_status <> 'approved';

  INSERT INTO public.catalog_source_category_mappings(
    id, source_taxonomy_node_id, category_id, mapping_status, mapping_method,
    confidence, reason, reviewed_at, metadata, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), n.id, target.id, 'approved', 'manual', 0.99,
    r.review_reason, now(),
    jsonb_build_object(
      'reviewedBy', 'nikolaou_reviewed_leaf_taxonomy_v2',
      'sourceCode', 'nikolaou-tools',
      'reviewedAt', now(),
      'reviewBasis', 'supplier_leaf_label_plus_sampled_product_titles'
    ),
    now(), now()
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
  JOIN public.categories target
    ON target.code = r.target_code
   AND target.active = true
   AND target.assignable = true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_category_mappings m
    WHERE m.source_taxonomy_node_id = n.id
      AND m.category_id = target.id
      AND m.mapping_status = 'approved'
  );

  SELECT count(*)
  INTO v_final_count
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
  JOIN public.categories target
    ON target.code = r.target_code
  JOIN public.catalog_source_category_mappings m
    ON m.source_taxonomy_node_id = n.id
   AND m.category_id = target.id
   AND m.mapping_status = 'approved'
   AND m.mapping_method = 'manual'
   AND m.confidence = 0.99;

  SELECT count(*)
  INTO v_competing_live
  FROM reviewed_leaf_taxonomy_v2 r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
  JOIN public.catalog_source_category_mappings m
    ON m.source_taxonomy_node_id = n.id
   AND m.mapping_status IN ('candidate', 'approved')
  JOIN public.categories c
    ON c.id = m.category_id
  WHERE c.code <> r.target_code;

  IF v_final_count <> 20 OR v_competing_live <> 0 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou v2 final assertion failed: approved targets %, competing live mappings %', v_final_count, v_competing_live;
  END IF;

  RAISE NOTICE 'Reviewed Nikolaou taxonomy v2 ready: 20 clean supplier leaves approved at 0.99 manual confidence';
END
$$;

COMMIT;
