-- Nikolaou Tools — explicit product-level taxonomy decisions for four mixed supplier leaves.
-- Idempotent operational script; requires migration 0127.

BEGIN;

CREATE TEMP TABLE _nikolaou_mixed_taxonomy_seed(
  model text PRIMARY KEY,
  category_code text NOT NULL
) ON COMMIT DROP;

INSERT INTO _nikolaou_mixed_taxonomy_seed(model,category_code) VALUES
  ('BTV1300','display-mounts-stands'),
  ('BTV1050','display-mounts-stands'),
  ('BTV1000','display-mounts-stands'),
  ('BTV1100','display-mounts-stands'),
  ('BTV1160','display-mounts-stands'),
  ('BTV1150','display-mounts-stands'),
  ('BTV1200','display-mounts-stands'),
  ('BTV1250','display-mounts-stands'),
  ('BTV1270','display-mounts-stands'),
  ('BTV1290','display-mounts-stands'),
  ('BTV1502','display-mounts-stands'),
  ('BTV1504','display-mounts-stands'),
  ('BPN1000','garden-outdoor-accessories'),
  ('BPN1100','garden-outdoor-accessories'),
  ('SN3010','garden-outdoor-accessories'),
  ('SN1500','garden-outdoor-accessories'),
  ('SN1550','garden-outdoor-accessories'),
  ('SN2050','garden-outdoor-accessories'),
  ('SN3050','garden-outdoor-accessories'),
  ('SN4050','garden-outdoor-accessories'),
  ('SN5050','garden-outdoor-accessories'),
  ('SN6050','garden-outdoor-accessories'),
  ('BG1000','garden-outdoor-accessories'),
  ('BPC2250','storage-organisation'),
  ('BPC2260','storage-organisation'),
  ('BPC2270','kitchen-furniture'),
  ('BPC2272','kitchen-furniture'),
  ('BHT5790','tool-accessories-consumables'),
  ('BHT8014','kitchen-dining-homeware'),
  ('BHT8015','kitchen-dining-homeware'),
  ('SSF836','cleaning-household-accessories'),
  ('SSF838','cleaning-household-accessories'),
  ('SSF840','cleaning-household-accessories'),
  ('SSF842','cleaning-household-accessories'),
  ('SSF820','agricultural-hand-tools'),
  ('SSF824','agricultural-hand-tools'),
  ('SSF826','agricultural-hand-tools'),
  ('SSF832','agricultural-hand-tools'),
  ('SSF834','agricultural-hand-tools'),
  ('SSF679','agricultural-hand-tools');

DO $$
DECLARE
  v_source_id uuid;
  v_snapshot_id uuid;
  v_matched integer;
  v_distinct_products integer;
BEGIN
  SELECT cs.id INTO v_source_id
  FROM public.catalog_sources cs
  WHERE cs.code='nikolaou-tools' AND cs.active=true
  ORDER BY cs.created_at DESC,cs.id DESC LIMIT 1;
  IF v_source_id IS NULL THEN RAISE EXCEPTION 'Active nikolaou-tools source not found'; END IF;

  SELECT css.id INTO v_snapshot_id
  FROM public.catalog_source_snapshots css
  WHERE css.source_id=v_source_id
  ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC LIMIT 1;
  IF v_snapshot_id IS NULL THEN RAISE EXCEPTION 'Nikolaou snapshot not found'; END IF;

  SELECT count(*),count(DISTINCT csp.id) INTO v_matched,v_distinct_products
  FROM _nikolaou_mixed_taxonomy_seed s
  JOIN public.catalog_source_products csp
    ON csp.source_id=v_source_id AND csp.snapshot_id=v_snapshot_id
   AND bls_private.catalog_normalize_text(csp.source_identity->>'model')=bls_private.catalog_normalize_text(s.model);

  IF v_matched<>40 OR v_distinct_products<>40 THEN
    RAISE EXCEPTION 'Expected 40 unique Nikolaou products, matched % rows / % products',v_matched,v_distinct_products;
  END IF;
END
$$;

WITH source_context AS (
  SELECT cs.id AS source_id,
         (SELECT css.id FROM public.catalog_source_snapshots css WHERE css.source_id=cs.id
          ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC LIMIT 1) AS snapshot_id
  FROM public.catalog_sources cs
  WHERE cs.code='nikolaou-tools' AND cs.active=true
  ORDER BY cs.created_at DESC,cs.id DESC LIMIT 1
)
SELECT bls_private.set_catalog_source_product_category_override(
  csp.id,s.category_code,0.9900,'mixed_source_leaf',
  jsonb_build_object('source','nikolaou_mixed_leaf_review_v1','model',s.model,'categoryCode',s.category_code)
)
FROM _nikolaou_mixed_taxonomy_seed s
CROSS JOIN source_context sc
JOIN public.catalog_source_products csp
  ON csp.source_id=sc.source_id AND csp.snapshot_id=sc.snapshot_id
 AND bls_private.catalog_normalize_text(csp.source_identity->>'model')=bls_private.catalog_normalize_text(s.model);

COMMIT;
