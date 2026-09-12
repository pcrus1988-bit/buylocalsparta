-- 0233_nova_product_family_identity.sql
-- One governed NOVA source parent -> one canonical product family.
-- Child variants/offers remain independent for size/color, price, stock and orders.
-- Uncategorized staging canonicals remain family-less until taxonomy is assigned.

-- Persist the authoritative supplier-parent identity on the family itself. These
-- columns are nullable for locally-created/non-dropship families and the partial
-- unique index prevents two concurrent syncs from creating two families for one
-- supplier parent without conflating unrelated suppliers or generic families.
ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS source_supplier_id uuid REFERENCES public.dropship_suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_external_product_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_families_source_parent
  ON public.product_families(source_supplier_id,source_external_product_id)
  WHERE source_supplier_id IS NOT NULL AND source_external_product_id IS NOT NULL;

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
  v_assigned_family_id uuid;
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

  -- Serialize one source parent across concurrent catalogue workers. The unique
  -- source-parent index is the hard guarantee; this lock also keeps the family and
  -- child attachment work in one predictable transaction path.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_supplier_id::text || ':' || p_external_product_id,0)
  );

  SELECT pf.id
  INTO v_family_id
  FROM public.product_families pf
  WHERE pf.source_supplier_id=p_supplier_id
    AND pf.source_external_product_id=p_external_product_id
  LIMIT 1;

  SELECT
    count(DISTINCT cv.family_id) FILTER (WHERE cv.family_id IS NOT NULL),
    min(cv.family_id::text) FILTER (WHERE cv.family_id IS NOT NULL)::uuid
  INTO v_family_count,v_assigned_family_id
  FROM public.dropship_supplier_offers dso
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  WHERE dso.supplier_id=p_supplier_id
    AND dso.external_product_id=p_external_product_id;

  IF v_family_count > 1 THEN
    RAISE EXCEPTION 'NOVA source parent % already spans % product families', p_external_product_id, v_family_count;
  END IF;

  IF v_family_id IS NOT NULL
     AND v_assigned_family_id IS NOT NULL
     AND v_family_id<>v_assigned_family_id THEN
    RAISE EXCEPTION 'NOVA source parent % identity family % conflicts with assigned family %',
      p_external_product_id,v_family_id,v_assigned_family_id;
  END IF;

  IF v_family_id IS NULL AND v_assigned_family_id IS NOT NULL THEN
    v_family_id := v_assigned_family_id;

    UPDATE public.product_families pf
    SET source_supplier_id=p_supplier_id,
        source_external_product_id=p_external_product_id,
        updated_at=now()
    WHERE pf.id=v_family_id
      AND pf.source_supplier_id IS NULL
      AND pf.source_external_product_id IS NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_families pf
      WHERE pf.id=v_family_id
        AND pf.source_supplier_id=p_supplier_id
        AND pf.source_external_product_id=p_external_product_id
    ) THEN
      RAISE EXCEPTION 'Existing family % is already bound to another source parent', v_family_id;
    END IF;
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

    INSERT INTO public.product_families(
      market_id,brand_id,category_id,model,active,source_supplier_id,source_external_product_id
    )
    VALUES(
      v_anchor.market_id,v_anchor.brand_id,v_anchor.category_id,v_anchor.model,true,
      p_supplier_id,p_external_product_id
    )
    ON CONFLICT (source_supplier_id,source_external_product_id)
      WHERE source_supplier_id IS NOT NULL AND source_external_product_id IS NOT NULL
    DO UPDATE SET updated_at=EXCLUDED.updated_at
    RETURNING id INTO v_family_id;
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

-- Initial backfill for every NOVA source parent that crossed taxonomy governance.
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

-- A newly linked API variant immediately inherits the family when it is governed.
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

-- Reconcile again after trigger installation so a source row written concurrently
-- with the initial sweep cannot remain detached when this migration commits.
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

-- Fail closed if any governed child is detached, a source parent spans families, or
-- a persisted source identity disagrees with the family assigned to its children.
DO $$
DECLARE
  unresolved_count bigint;
  conflict_count bigint;
  identity_mismatch_count bigint;
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

  SELECT count(*) INTO identity_mismatch_count
  FROM public.dropship_supplier_offers dso
  JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
  JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
  JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  JOIN public.product_families pf
    ON pf.source_supplier_id=dso.supplier_id
   AND pf.source_external_product_id=dso.external_product_id
  WHERE ds.code='nova_brandsgateway'
    AND cv.category_id IS NOT NULL
    AND cv.family_id IS DISTINCT FROM pf.id;

  IF unresolved_count > 0 OR conflict_count > 0 OR identity_mismatch_count > 0 THEN
    RAISE EXCEPTION 'NOVA family verification failed: unresolved governed variants=%, conflicting parents=%, source identity mismatches=%',
      unresolved_count,conflict_count,identity_mismatch_count;
  END IF;
END $$;
