-- 0233_nova_product_family_identity.sql
-- Group governed NOVA / BrandsGateway child variants under one canonical product family
-- per supplier source parent without rewriting child identities, offers, inventory, or orders.
--
-- Staged NOVA records may remain family-less until taxonomy governance supplies a
-- category. Once one child of a supplier parent is categorized, the whole source
-- sibling set can safely reference the same family even while individual siblings
-- are still staged/uncategorized.

DO $$
DECLARE
  conflict_count bigint;
BEGIN
  SELECT count(*) INTO conflict_count
  FROM (
    SELECT dso.supplier_id,dso.external_product_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE ds.code='nova_brandsgateway'
      AND cv.family_id IS NOT NULL
    GROUP BY dso.supplier_id,dso.external_product_id
    HAVING count(DISTINCT cv.family_id)>1
  ) conflicts;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'NOVA family backfill aborted: % supplier parents already span multiple families', conflict_count;
  END IF;
END $$;

WITH existing_family AS (
  SELECT dso.supplier_id,dso.external_product_id,min(cv.family_id::text)::uuid AS family_id
  FROM public.dropship_supplier_offers dso
  JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  WHERE ds.code='nova_brandsgateway'
    AND cv.family_id IS NOT NULL
  GROUP BY dso.supplier_id,dso.external_product_id
), sibling_variants AS (
  SELECT DISTINCT dso.supplier_id,dso.external_product_id,vo.canonical_variant_id,ef.family_id
  FROM existing_family ef
  JOIN public.dropship_supplier_offers dso
    ON dso.supplier_id=ef.supplier_id
   AND dso.external_product_id=ef.external_product_id
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
)
UPDATE public.canonical_variants cv
SET family_id=sv.family_id,updated_at=now()
FROM sibling_variants sv
WHERE cv.id=sv.canonical_variant_id
  AND cv.family_id IS NULL;

CREATE TEMP TABLE tmp_nova_family_anchor ON COMMIT DROP AS
SELECT DISTINCT ON (dso.supplier_id,dso.external_product_id)
  dso.supplier_id,
  dso.external_product_id,
  cv.id AS canonical_variant_id,
  cv.market_id,
  cv.brand_id,
  cv.category_id,
  cv.model,
  cv.product_type_id,
  cv.active
FROM public.dropship_supplier_offers dso
JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
WHERE ds.code='nova_brandsgateway'
  AND cv.category_id IS NOT NULL
  AND cv.brand_id IS NOT NULL
  AND cv.model IS NOT NULL
  AND btrim(cv.model)<>''
  AND NOT EXISTS (
    SELECT 1
    FROM public.dropship_supplier_offers sibling_dso
    JOIN public.vendor_offers sibling_vo ON sibling_vo.id=sibling_dso.vendor_offer_id
    JOIN public.canonical_variants sibling_cv ON sibling_cv.id=sibling_vo.canonical_variant_id
    WHERE sibling_dso.supplier_id=dso.supplier_id
      AND sibling_dso.external_product_id=dso.external_product_id
      AND sibling_cv.family_id IS NOT NULL
  )
ORDER BY dso.supplier_id,dso.external_product_id,cv.active DESC,cv.created_at,cv.id;

INSERT INTO public.product_families(
  market_id,brand_id,category_id,model,active,product_type_id
)
SELECT DISTINCT
  a.market_id,a.brand_id,a.category_id,a.model,true,a.product_type_id
FROM tmp_nova_family_anchor a
ON CONFLICT DO NOTHING;

WITH resolved AS (
  SELECT
    a.supplier_id,
    a.external_product_id,
    pf.id AS family_id
  FROM tmp_nova_family_anchor a
  JOIN public.product_families pf
    ON pf.market_id=a.market_id
   AND pf.brand_id IS NOT DISTINCT FROM a.brand_id
   AND pf.category_id=a.category_id
   AND lower(btrim(coalesce(pf.model,'')))=lower(btrim(a.model))
), siblings AS (
  SELECT DISTINCT dso.supplier_id,dso.external_product_id,vo.canonical_variant_id,r.family_id
  FROM resolved r
  JOIN public.dropship_supplier_offers dso
    ON dso.supplier_id=r.supplier_id
   AND dso.external_product_id=r.external_product_id
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
)
UPDATE public.canonical_variants cv
SET family_id=s.family_id,updated_at=now()
FROM siblings s
WHERE cv.id=s.canonical_variant_id
  AND (cv.family_id IS NULL OR cv.family_id=s.family_id);

DO $$
DECLARE
  unresolved_count bigint;
  conflict_count bigint;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM (
    SELECT dso.supplier_id,dso.external_product_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE ds.code='nova_brandsgateway'
    GROUP BY dso.supplier_id,dso.external_product_id
    HAVING bool_or(cv.category_id IS NOT NULL)
       AND bool_or(cv.family_id IS NULL)
  ) unresolved;

  SELECT count(*) INTO conflict_count
  FROM (
    SELECT dso.supplier_id,dso.external_product_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE ds.code='nova_brandsgateway'
    GROUP BY dso.supplier_id,dso.external_product_id
    HAVING count(DISTINCT cv.family_id) FILTER (WHERE cv.family_id IS NOT NULL)>1
  ) conflicts;

  IF unresolved_count > 0 OR conflict_count > 0 THEN
    RAISE EXCEPTION 'NOVA family backfill verification failed: unresolved=%, conflicts=%', unresolved_count, conflict_count;
  END IF;
END $$;

-- Keep the invariant true for every future API sync and every catalogue-governance
-- writer, not only the current NOVA materializer.
CREATE OR REPLACE FUNCTION bls_private.ensure_nova_product_family(
  p_supplier_id uuid,
  p_external_product_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_family_id uuid;
  v_family_count integer;
  v_anchor record;
BEGIN
  IF p_supplier_id IS NULL OR p_external_product_id IS NULL OR btrim(p_external_product_id)='' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dropship_suppliers ds
    WHERE ds.id=p_supplier_id AND ds.code='nova_brandsgateway'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    count(DISTINCT cv.family_id) FILTER (WHERE cv.family_id IS NOT NULL),
    min(cv.family_id::text) FILTER (WHERE cv.family_id IS NOT NULL)::uuid
  INTO v_family_count,v_family_id
  FROM public.dropship_supplier_offers dso
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  WHERE dso.supplier_id=p_supplier_id
    AND dso.external_product_id=p_external_product_id;

  IF v_family_count > 1 THEN
    RAISE EXCEPTION 'NOVA source parent % already spans % product families', p_external_product_id, v_family_count;
  END IF;

  IF v_family_id IS NOT NULL THEN
    UPDATE public.canonical_variants cv
    SET family_id=v_family_id,updated_at=now()
    FROM public.vendor_offers vo
    JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    WHERE cv.id=vo.canonical_variant_id
      AND dso.supplier_id=p_supplier_id
      AND dso.external_product_id=p_external_product_id
      AND cv.family_id IS NULL;
    RETURN v_family_id;
  END IF;

  SELECT cv.market_id,cv.brand_id,cv.category_id,cv.model,cv.product_type_id
  INTO v_anchor
  FROM public.dropship_supplier_offers dso
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  WHERE dso.supplier_id=p_supplier_id
    AND dso.external_product_id=p_external_product_id
    AND cv.category_id IS NOT NULL
    AND cv.brand_id IS NOT NULL
    AND cv.model IS NOT NULL
    AND btrim(cv.model)<>''
  ORDER BY cv.active DESC,cv.created_at,cv.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.product_families(
    market_id,brand_id,category_id,model,active,product_type_id
  ) VALUES(
    v_anchor.market_id,v_anchor.brand_id,v_anchor.category_id,v_anchor.model,true,v_anchor.product_type_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_family_id;

  IF v_family_id IS NULL THEN
    SELECT pf.id INTO v_family_id
    FROM public.product_families pf
    WHERE pf.market_id=v_anchor.market_id
      AND pf.brand_id IS NOT DISTINCT FROM v_anchor.brand_id
      AND pf.category_id=v_anchor.category_id
      AND lower(btrim(coalesce(pf.model,'')))=lower(btrim(v_anchor.model))
    ORDER BY pf.created_at,pf.id
    LIMIT 1;
  END IF;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve NOVA family for supplier %, source parent %', p_supplier_id, p_external_product_id;
  END IF;

  UPDATE public.canonical_variants cv
  SET family_id=v_family_id,updated_at=now()
  FROM public.vendor_offers vo
  JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
  WHERE cv.id=vo.canonical_variant_id
    AND dso.supplier_id=p_supplier_id
    AND dso.external_product_id=p_external_product_id
    AND cv.family_id IS NULL;

  RETURN v_family_id;
END $$;

CREATE OR REPLACE FUNCTION bls_private.sync_nova_product_family_from_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF TG_OP='UPDATE'
     AND (OLD.supplier_id,OLD.external_product_id) IS DISTINCT FROM (NEW.supplier_id,NEW.external_product_id) THEN
    PERFORM bls_private.ensure_nova_product_family(OLD.supplier_id,OLD.external_product_id);
  END IF;
  PERFORM bls_private.ensure_nova_product_family(NEW.supplier_id,NEW.external_product_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nova_product_family_from_offer ON public.dropship_supplier_offers;
CREATE TRIGGER trg_nova_product_family_from_offer
AFTER INSERT OR UPDATE OF supplier_id,external_product_id,vendor_offer_id
ON public.dropship_supplier_offers
FOR EACH ROW
EXECUTE FUNCTION bls_private.sync_nova_product_family_from_offer();

CREATE OR REPLACE FUNCTION bls_private.sync_nova_product_family_from_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  source_parent record;
BEGIN
  FOR source_parent IN
    SELECT DISTINCT dso.supplier_id,dso.external_product_id
    FROM public.vendor_offers vo
    JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    WHERE vo.canonical_variant_id=NEW.id
      AND ds.code='nova_brandsgateway'
  LOOP
    PERFORM bls_private.ensure_nova_product_family(source_parent.supplier_id,source_parent.external_product_id);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nova_product_family_from_canonical ON public.canonical_variants;
CREATE TRIGGER trg_nova_product_family_from_canonical
AFTER UPDATE OF category_id,brand_id,model
ON public.canonical_variants
FOR EACH ROW
WHEN (NEW.category_id IS NOT NULL)
EXECUTE FUNCTION bls_private.sync_nova_product_family_from_canonical();
