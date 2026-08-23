-- Buy Local Sparta — reviewed Nikolaou supplier-leaf taxonomy tranche.
--
-- Scope: 12 semantic supplier leaves represented by 13 stable source taxonomy
-- nodes (the chainsaw-bar leaf appears under two historical supplier paths).
-- These decisions were manually reviewed against the latest Nikolaou snapshot
-- and sampled product titles. Mixed leaves are deliberately excluded.
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

  CREATE TEMP TABLE reviewed_leaf_taxonomy (
    source_key text PRIMARY KEY,
    expected_label text NOT NULL,
    target_code text NOT NULL,
    review_reason text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO reviewed_leaf_taxonomy(source_key, expected_label, target_code, review_reason)
  VALUES
    ('nikolaou:67a2682dc4c08b3c819e', 'Αλυσίδες Αλυσοπρίονων', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: chainsaw chains are machinery accessories'),
    ('nikolaou:d2e6e54c85b83eb6015b', 'Αξεσουάρ Ηλεκτροκόλλησης', 'tool-accessories-consumables', 'Reviewed supplier leaf: welding wires, clamps and related items are tool accessories/consumables'),
    ('nikolaou:5a2071124c2ec5506d50', 'Εξαρτήματα Αέρος', 'tool-accessories-consumables', 'Reviewed supplier leaf: air hoses, couplers and fittings are tool accessories/consumables'),
    ('nikolaou:1aec3495e9b6d7638f08', 'Έπιπλα Camping-Παραλίας', 'outdoor-furniture', 'Reviewed supplier leaf: camping and beach chairs/tables are outdoor furniture'),
    ('nikolaou:7fa6d5e5d4e47c28fdcb', 'Εστίες Υγραερίου', 'ovens-hobs', 'Reviewed supplier leaf: LPG cooking hobs belong to ovens and hobs'),
    ('nikolaou:b6c6cfdd13aff4e7edff', 'Λάμες Αλυσοπρίονων & Κονταροπρίονων', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: chainsaw and pole-saw bars are machinery accessories'),
    ('nikolaou:1cafc474df113b16fcc6', 'Λάμες Αλυσοπρίονων & Κονταροπρίονων', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: chainsaw and pole-saw bars are machinery accessories'),
    ('nikolaou:4e6ded59217892009dc9', 'Μάσκες Ηλεκτρονικές', 'safety-ppe', 'Reviewed supplier leaf: welding masks are personal protective equipment'),
    ('nikolaou:9475acb06f7fc73690f1', 'Μέγγενες', 'hand-tools', 'Reviewed supplier leaf: bench and multi-angle vices are hand tools'),
    ('nikolaou:d0b5b3942cf61481ccc6', 'Μεσινέζες Θαμνοκοπτικών', 'agricultural-machinery-accessories', 'Reviewed supplier leaf: trimmer line is a garden-machine accessory/consumable'),
    ('nikolaou:470d8de4dc397b99de20', 'Σκαλιστήρια', 'agricultural-hand-tools', 'Reviewed supplier leaf: hoes/cultivators are agricultural hand tools'),
    ('nikolaou:55dd03be911af17b6112', 'Σκούπες-Σφουγγαρίστρες-Φαράσια', 'cleaning-household-accessories', 'Reviewed supplier leaf: brooms, mops, floor squeegees and dustpans are cleaning accessories'),
    ('nikolaou:43ff188b394cd61a40bd', 'Ψαλίδια & Πριόνια Κλάδου', 'agricultural-hand-tools', 'Reviewed supplier leaf: pruning shears and branch saws are agricultural hand tools');

  SELECT count(*), count(DISTINCT n.source_label)
  INTO v_node_count, v_label_count
  FROM reviewed_leaf_taxonomy r
  JOIN public.catalog_source_taxonomy_nodes n
    ON n.source_id = v_source_id
   AND n.source_key = r.source_key
   AND n.source_label = r.expected_label;

  IF v_node_count <> 13 OR v_label_count <> 12 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou leaf identity assertion failed: expected 13 nodes / 12 labels, got % nodes / % labels', v_node_count, v_label_count;
  END IF;

  SELECT count(DISTINCT c.code)
  INTO v_target_count
  FROM reviewed_leaf_taxonomy r
  JOIN public.categories c
    ON c.code = r.target_code
   AND c.active = true
   AND c.assignable = true;

  IF v_target_count <> 8 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou category assertion failed: expected 8 active assignable target categories, got %', v_target_count;
  END IF;

  SELECT count(*)
  INTO v_conflicting_approved
  FROM reviewed_leaf_taxonomy r
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
    RAISE EXCEPTION 'Reviewed Nikolaou leaf batch found % conflicting approved mappings; manual resolution required', v_conflicting_approved;
  END IF;

  UPDATE public.catalog_source_category_mappings m
  SET mapping_status = 'superseded',
      reviewed_at = COALESCE(m.reviewed_at, now()),
      reason = concat_ws(' · ', NULLIF(m.reason, ''), 'Superseded by reviewed Nikolaou supplier-leaf classification'),
      metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object('supersededBy', 'nikolaou_reviewed_leaf_taxonomy_v1', 'supersededAt', now()),
      updated_at = now()
  FROM reviewed_leaf_taxonomy r
  JOIN public.catalog_source_taxonomy_nodes n ON n.source_id = v_source_id AND n.source_key = r.source_key
  JOIN public.categories target ON target.code = r.target_code
  WHERE m.source_taxonomy_node_id = n.id
    AND m.category_id <> target.id
    AND m.mapping_status IN ('candidate', 'rejected', 'superseded');

  UPDATE public.catalog_source_category_mappings m
  SET mapping_status = 'approved',
      mapping_method = 'manual',
      confidence = 0.99,
      reason = r.review_reason,
      reviewed_at = COALESCE(m.reviewed_at, now()),
      metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object('reviewedBy', 'nikolaou_reviewed_leaf_taxonomy_v1', 'sourceCode', 'nikolaou-tools', 'reviewedAt', now(), 'reviewBasis', 'supplier_leaf_label_plus_sampled_product_titles'),
      updated_at = now()
  FROM reviewed_leaf_taxonomy r
  JOIN public.catalog_source_taxonomy_nodes n ON n.source_id = v_source_id AND n.source_key = r.source_key
  JOIN public.categories target ON target.code = r.target_code AND target.active = true AND target.assignable = true
  WHERE m.source_taxonomy_node_id = n.id
    AND m.category_id = target.id
    AND m.mapping_status <> 'approved';

  INSERT INTO public.catalog_source_category_mappings(id, source_taxonomy_node_id, category_id, mapping_status, mapping_method, confidence, reason, reviewed_at, metadata, created_at, updated_at)
  SELECT gen_random_uuid(), n.id, target.id, 'approved', 'manual', 0.99, r.review_reason, now(), jsonb_build_object('reviewedBy', 'nikolaou_reviewed_leaf_taxonomy_v1', 'sourceCode', 'nikolaou-tools', 'reviewedAt', now(), 'reviewBasis', 'supplier_leaf_label_plus_sampled_product_titles'), now(), now()
  FROM reviewed_leaf_taxonomy r
  JOIN public.catalog_source_taxonomy_nodes n ON n.source_id = v_source_id AND n.source_key = r.source_key
  JOIN public.categories target ON target.code = r.target_code AND target.active = true AND target.assignable = true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_source_category_mappings m
    WHERE m.source_taxonomy_node_id = n.id AND m.category_id = target.id AND m.mapping_status = 'approved'
  );

  SELECT count(*) INTO v_final_count
  FROM reviewed_leaf_taxonomy r
  JOIN public.catalog_source_taxonomy_nodes n ON n.source_id = v_source_id AND n.source_key = r.source_key
  JOIN public.categories target ON target.code = r.target_code
  JOIN public.catalog_source_category_mappings m ON m.source_taxonomy_node_id = n.id AND m.category_id = target.id AND m.mapping_status = 'approved' AND m.mapping_method = 'manual' AND m.confidence = 0.99;

  SELECT count(*) INTO v_competing_live
  FROM reviewed_leaf_taxonomy r
  JOIN public.catalog_source_taxonomy_nodes n ON n.source_id = v_source_id AND n.source_key = r.source_key
  JOIN public.catalog_source_category_mappings m ON m.source_taxonomy_node_id = n.id AND m.mapping_status IN ('candidate', 'approved')
  JOIN public.categories c ON c.id = m.category_id
  WHERE c.code <> r.target_code;

  IF v_final_count <> 13 OR v_competing_live <> 0 THEN
    RAISE EXCEPTION 'Reviewed Nikolaou leaf final assertion failed: approved targets %, competing live mappings %', v_final_count, v_competing_live;
  END IF;

  RAISE NOTICE 'Reviewed Nikolaou taxonomy ready: 13 source nodes / 12 semantic leaves approved at 0.99 manual confidence';
END
$$;

COMMIT;
