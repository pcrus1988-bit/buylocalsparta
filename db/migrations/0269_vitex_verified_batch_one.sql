-- KONTA MOY — verify first high-confidence Vitex manufacturer batch against official TDS + 2026 catalogue.
--
-- Scope:
--   * Vitex Eco
--   * Vitex Kitchen & Bath
--   * Acrylan
--   * Acrylan Elastic
--
-- This migration adds catalogue-backed packaging/base evidence, removes one
-- over-specified coat-count field that was not a manufacturer requirement,
-- and promotes only these conflict-free profiles/products to verified.

BEGIN;

DO $$
DECLARE
  v_catalogue_source uuid;
BEGIN
  SELECT id
    INTO v_catalogue_source
  FROM public.manufacturer_technical_sources
  WHERE manufacturer = 'Vitex'
    AND source_title = 'Vitex Product Catalogue GR 2026'
    AND is_current = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_catalogue_source IS NULL THEN
    RAISE EXCEPTION 'Vitex Product Catalogue GR 2026 source is missing';
  END IF;

  -- The TDS provides one-coat and two-coat coverage values for Vitex Eco, but
  -- does not prescribe "exactly two coats" as a universal application rule.
  UPDATE public.manufacturer_application_profiles a
  SET number_of_coats_min = NULL,
      number_of_coats_max = NULL,
      updated_at = now()
  FROM public.manufacturer_products p
  WHERE a.product_id = p.id
    AND a.is_current = true
    AND a.source_layer = 'manufacturer'
    AND p.manufacturer = 'Vitex'
    AND p.product_name = 'Vitex Eco';

  -- Current 2026 catalogue bases.
  UPDATE public.manufacturer_products
  SET available_bases = CASE product_name
      WHEN 'Vitex Kitchen & Bath' THEN ARRAY['W']::text[]
      WHEN 'Vitex Eco' THEN ARRAY['W','M','TR']::text[]
      WHEN 'Acrylan' THEN ARRAY['W','M','TR']::text[]
      WHEN 'Acrylan Elastic' THEN ARRAY['W','M','TR']::text[]
      ELSE available_bases
    END,
    updated_at = now()
  WHERE manufacturer = 'Vitex'
    AND product_name IN ('Vitex Eco','Vitex Kitchen & Bath','Acrylan','Acrylan Elastic');

  -- Catalogue-backed evidence: current listing, bases and packages.
  WITH evidence_rows(product_name, field_name, rule_key, normalized_value, source_page, section_heading, exact_excerpt) AS (
    VALUES
      ('Vitex Eco','current_catalogue_listing','catalogue_2026_current',
        '{"catalogue_year":2026,"status":"listed"}'::jsonb,10,'Εσωτερικοί Τοίχοι — Πλαστικά Χρώματα',
        'Vitex Eco — Κορυφαίας ποιότητας οικολογικό ματ πλαστικό χρώμα.'),
      ('Vitex Eco','available_bases','catalogue_2026_bases',
        '["W","M","TR"]'::jsonb,10,'Αποχρώσεις & Συσκευασίες',
        'Βάσεις W, M, TR 1L 3L 10L'),
      ('Vitex Eco','package_sizes','catalogue_2026_packages',
        '[{"label":"White","amount_l":0.75},{"label":"White","amount_l":3},{"label":"White","amount_l":10},{"label":"Base W","amount_l":1},{"label":"Base M","amount_l":1},{"label":"Base TR","amount_l":1},{"label":"Base W","amount_l":3},{"label":"Base M","amount_l":3},{"label":"Base TR","amount_l":3},{"label":"Base W","amount_l":10},{"label":"Base M","amount_l":10},{"label":"Base TR","amount_l":10}]'::jsonb,
        10,'Αποχρώσεις & Συσκευασίες','Λευκό 750mL 3L 10L — Βάσεις W, M, TR 1L 3L 10L'),

      ('Vitex Kitchen & Bath','current_catalogue_listing','catalogue_2026_current',
        '{"catalogue_year":2026,"status":"listed"}'::jsonb,14,'Εσωτερικοί Τοίχοι — Πλαστικά Χρώματα',
        'Vitex Kitchen and Bath — Πλαστικό χρώμα με αντιμουχλική δράση και καθαριστικό για προστασία από μύκητες'),
      ('Vitex Kitchen & Bath','available_bases','catalogue_2026_bases',
        '["W"]'::jsonb,14,'Αποχρώσεις & Συσκευασίες',
        'Βάσεις W 1L 3L'),
      ('Vitex Kitchen & Bath','package_sizes','catalogue_2026_packages',
        '[{"label":"White","amount_l":0.75},{"label":"White","amount_l":3},{"label":"White","amount_l":9},{"label":"Base W","amount_l":1},{"label":"Base W","amount_l":3}]'::jsonb,
        14,'Αποχρώσεις & Συσκευασίες','Λευκό 750mL 3L 9L — Βάσεις W 1L 3L'),

      ('Acrylan','current_catalogue_listing','catalogue_2026_current',
        '{"catalogue_year":2026,"status":"listed"}'::jsonb,16,'Εξωτερικοί Τοίχοι — Ακρυλικά Χρώματα',
        'Acrylan — 100% Ακρυλικό χρώμα'),
      ('Acrylan','available_bases','catalogue_2026_bases',
        '["W","M","TR"]'::jsonb,16,'Αποχρώσεις & Συσκευασίες',
        'Βάσεις W, M, TR 1L 3L 10L'),
      ('Acrylan','package_sizes','catalogue_2026_packages',
        '[{"label":"White","amount_l":0.75},{"label":"White","amount_l":3},{"label":"White","amount_l":10},{"label":"Base W","amount_l":1},{"label":"Base M","amount_l":1},{"label":"Base TR","amount_l":1},{"label":"Base W","amount_l":3},{"label":"Base M","amount_l":3},{"label":"Base TR","amount_l":3},{"label":"Base W","amount_l":10},{"label":"Base M","amount_l":10},{"label":"Base TR","amount_l":10}]'::jsonb,
        16,'Αποχρώσεις & Συσκευασίες','Λευκό 750mL 3L 10L — Βάσεις W, M, TR 1L 3L 10L'),

      ('Acrylan Elastic','current_catalogue_listing','catalogue_2026_current',
        '{"catalogue_year":2026,"status":"listed"}'::jsonb,17,'Εξωτερικοί Τοίχοι — Ακρυλικά Χρώματα',
        'Acrylan Elastic — Ελαστομερές στεγανωτικό ακρυλικό χρώμα'),
      ('Acrylan Elastic','available_bases','catalogue_2026_bases',
        '["W","M","TR"]'::jsonb,17,'Αποχρώσεις & Συσκευασίες',
        'Βάσεις W, M, TR 3L 10L'),
      ('Acrylan Elastic','package_sizes','catalogue_2026_packages',
        '[{"label":"White","amount_l":3},{"label":"White","amount_l":10},{"label":"Base W","amount_l":3},{"label":"Base M","amount_l":3},{"label":"Base TR","amount_l":3},{"label":"Base W","amount_l":10},{"label":"Base M","amount_l":10},{"label":"Base TR","amount_l":10}]'::jsonb,
        17,'Αποχρώσεις & Συσκευασίες','Λευκό 3L 10L — Βάσεις W, M, TR 3L 10L')
  )
  INSERT INTO public.manufacturer_instruction_evidence (
    product_id,
    source_id,
    source_layer,
    field_name,
    rule_key,
    normalized_value,
    source_page,
    section_heading,
    exact_excerpt,
    confidence,
    evidence_fingerprint,
    is_current
  )
  SELECT
    p.id,
    v_catalogue_source,
    'manufacturer',
    e.field_name,
    e.rule_key,
    e.normalized_value,
    e.source_page,
    e.section_heading,
    e.exact_excerpt,
    1,
    encode(digest(
      '0269|' || p.manufacturer || '|' || p.manufacturer_key || '|' ||
      e.field_name || '|' || e.rule_key || '|Vitex Product Catalogue GR 2026',
      'sha256'
    ), 'hex'),
    true
  FROM evidence_rows e
  JOIN public.manufacturer_products p
    ON p.manufacturer = 'Vitex'
   AND p.product_name = e.product_name
  ON CONFLICT (evidence_fingerprint) DO UPDATE
    SET normalized_value = EXCLUDED.normalized_value,
        source_page = EXCLUDED.source_page,
        section_heading = EXCLUDED.section_heading,
        exact_excerpt = EXCLUDED.exact_excerpt,
        confidence = EXCLUDED.confidence,
        is_current = true;

  -- Package rows are deliberately label-specific because bases and white can
  -- share the same nominal volume.
  WITH package_rows(product_name, amount, unit, package_label) AS (
    VALUES
      ('Vitex Eco',0.75::numeric,'L','White 750 mL'),
      ('Vitex Eco',3::numeric,'L','White 3 L'),
      ('Vitex Eco',10::numeric,'L','White 10 L'),
      ('Vitex Eco',1::numeric,'L','Base W 1 L'),
      ('Vitex Eco',1::numeric,'L','Base M 1 L'),
      ('Vitex Eco',1::numeric,'L','Base TR 1 L'),
      ('Vitex Eco',3::numeric,'L','Base W 3 L'),
      ('Vitex Eco',3::numeric,'L','Base M 3 L'),
      ('Vitex Eco',3::numeric,'L','Base TR 3 L'),
      ('Vitex Eco',10::numeric,'L','Base W 10 L'),
      ('Vitex Eco',10::numeric,'L','Base M 10 L'),
      ('Vitex Eco',10::numeric,'L','Base TR 10 L'),

      ('Vitex Kitchen & Bath',0.75::numeric,'L','White 750 mL'),
      ('Vitex Kitchen & Bath',3::numeric,'L','White 3 L'),
      ('Vitex Kitchen & Bath',9::numeric,'L','White 9 L'),
      ('Vitex Kitchen & Bath',1::numeric,'L','Base W 1 L'),
      ('Vitex Kitchen & Bath',3::numeric,'L','Base W 3 L'),

      ('Acrylan',0.75::numeric,'L','White 750 mL'),
      ('Acrylan',3::numeric,'L','White 3 L'),
      ('Acrylan',10::numeric,'L','White 10 L'),
      ('Acrylan',1::numeric,'L','Base W 1 L'),
      ('Acrylan',1::numeric,'L','Base M 1 L'),
      ('Acrylan',1::numeric,'L','Base TR 1 L'),
      ('Acrylan',3::numeric,'L','Base W 3 L'),
      ('Acrylan',3::numeric,'L','Base M 3 L'),
      ('Acrylan',3::numeric,'L','Base TR 3 L'),
      ('Acrylan',10::numeric,'L','Base W 10 L'),
      ('Acrylan',10::numeric,'L','Base M 10 L'),
      ('Acrylan',10::numeric,'L','Base TR 10 L'),

      ('Acrylan Elastic',3::numeric,'L','White 3 L'),
      ('Acrylan Elastic',10::numeric,'L','White 10 L'),
      ('Acrylan Elastic',3::numeric,'L','Base W 3 L'),
      ('Acrylan Elastic',3::numeric,'L','Base M 3 L'),
      ('Acrylan Elastic',3::numeric,'L','Base TR 3 L'),
      ('Acrylan Elastic',10::numeric,'L','Base W 10 L'),
      ('Acrylan Elastic',10::numeric,'L','Base M 10 L'),
      ('Acrylan Elastic',10::numeric,'L','Base TR 10 L')
  )
  INSERT INTO public.manufacturer_package_sizes (
    product_id,
    amount,
    unit,
    package_label,
    source_evidence_id,
    active
  )
  SELECT
    p.id,
    pr.amount,
    pr.unit,
    pr.package_label,
    e.id,
    true
  FROM package_rows pr
  JOIN public.manufacturer_products p
    ON p.manufacturer = 'Vitex'
   AND p.product_name = pr.product_name
  JOIN public.manufacturer_instruction_evidence e
    ON e.product_id = p.id
   AND e.source_id = v_catalogue_source
   AND e.field_name = 'package_sizes'
   AND e.rule_key = 'catalogue_2026_packages'
   AND e.is_current = true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.manufacturer_package_sizes existing
    WHERE existing.product_id = p.id
      AND existing.variant_id IS NULL
      AND existing.amount = pr.amount
      AND existing.unit = pr.unit
      AND COALESCE(existing.package_label,'') = pr.package_label
      AND existing.active = true
  );

  -- Final promotion gate: only the four products explicitly audited against
  -- their official TDS plus the current 2026 catalogue are promoted.
  UPDATE public.manufacturer_application_profiles a
  SET verification_status = 'verified',
      last_verified_at = now(),
      updated_at = now()
  FROM public.manufacturer_products p
  WHERE a.product_id = p.id
    AND a.is_current = true
    AND a.source_layer = 'manufacturer'
    AND p.manufacturer = 'Vitex'
    AND p.product_name IN ('Vitex Eco','Vitex Kitchen & Bath','Acrylan','Acrylan Elastic')
    AND EXISTS (
      SELECT 1
      FROM public.manufacturer_instruction_evidence e
      WHERE e.product_id = p.id
        AND e.source_id = v_catalogue_source
        AND e.field_name = 'current_catalogue_listing'
        AND e.is_current = true
    );

  UPDATE public.manufacturer_products p
  SET verification_status = 'verified',
      last_verified_at = now(),
      updated_at = now()
  WHERE p.manufacturer = 'Vitex'
    AND p.product_name IN ('Vitex Eco','Vitex Kitchen & Bath','Acrylan','Acrylan Elastic')
    AND EXISTS (
      SELECT 1
      FROM public.manufacturer_application_profiles a
      WHERE a.product_id = p.id
        AND a.is_current = true
        AND a.source_layer = 'manufacturer'
        AND a.verification_status = 'verified'
    );
END $$;

COMMIT;
