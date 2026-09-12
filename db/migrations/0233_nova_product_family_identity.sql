-- 0233_nova_product_family_identity.sql
-- One governed NOVA source parent -> one canonical product family.
-- Child variants/offers remain independent for size/color, price, stock and orders.
-- Uncategorized staging canonicals must remain family-less by database contract;
-- they join the source parent's family automatically when taxonomy is assigned.

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
    SELECT 1
    FROM public.dropship_suppliers ds
    WHERE ds.id=p_supplier_id
      AND ds.code='nova_brandsgateway'
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

  IF v_family_id IS NULL THEN
    SELECT cv.market_id,cv.brand_id,cv.category_id,cv.model
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

    INSERT INTO public.product_families(market_id,brand_id,category_id,model,active)
    VALUES(v_anchor.market_id,v_anchor.brand_id,v_anchor.category_id,v_anchor.model,true)
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
    AND cv.category_id IS NOT NULL
    AND cv.family_id IS NULL;

  RETURN v_family_id;
END $$;

-- Backfill every NOVA source parent that has crossed the taxonomy-governance boundary.
DO $$
DECLARE
  source_parent record;
BEGIN
  FOR source_parent IN
    SELECT DISTINCT dso.supplier_id,dso.external_product_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE ds.code='nova_brandsgateway'
      AND cv.category_id IS NOT NULL
  LOOP
    PERFORM bls_private.ensure_nova_product_family(source_parent.supplier_id,source_parent.external_product_id);
  END LOOP;
END $$;

-- Fail closed if any governed child is still detached or a source parent spans families.
DO $$
DECLARE
  unresolved_count bigint;
  conflict_count bigint;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM public.dropship_supplier_offers dso
  JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  WHERE ds.code='nova_brandsgateway'
    AND cv.category_id IS NOT NULL
    AND cv.family_id IS NULL;

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
    RAISE EXCEPTION 'NOVA family verification failed: unresolved governed variants=%, conflicting parents=%', unresolved_count, conflict_count;
  END IF;
END $$;

-- A newly linked API variant immediately inherits the family when it is already governed.
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

-- When governance categorizes a staged child, attach it and its governed siblings.
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
