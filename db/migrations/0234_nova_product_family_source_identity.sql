-- 0234_nova_product_family_source_identity.sql
-- Harden NOVA family identity around the authoritative supplier source parent.
-- Migration 0233 remains immutable; this migration binds its existing families
-- to (supplier_id, external_product_id) and makes future materialization race-safe.

ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS source_supplier_id uuid
    REFERENCES public.dropship_suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_external_product_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_families_source_parent
  ON public.product_families(source_supplier_id,source_external_product_id)
  WHERE source_supplier_id IS NOT NULL
    AND source_external_product_id IS NOT NULL;

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
  IF p_supplier_id IS NULL
     OR p_external_product_id IS NULL
     OR btrim(p_external_product_id)='' THEN
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

  -- Serialize all work for one supplier parent inside the transaction. The partial
  -- unique index above is the hard persistence guarantee.
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
    RAISE EXCEPTION
      'NOVA source parent % already spans % product families',
      p_external_product_id,v_family_count;
  END IF;

  IF v_family_id IS NOT NULL
     AND v_assigned_family_id IS NOT NULL
     AND v_family_id<>v_assigned_family_id THEN
    RAISE EXCEPTION
      'NOVA source parent % identity family % conflicts with assigned family %',
      p_external_product_id,v_family_id,v_assigned_family_id;
  END IF;

  -- 0233 may already have created/assigned a family. Bind that exact family to the
  -- supplier parent rather than creating or selecting a family by model text again.
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
      RAISE EXCEPTION
        'Existing family % is already bound to another source parent',
        v_family_id;
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
      market_id,
      brand_id,
      category_id,
      model,
      active,
      source_supplier_id,
      source_external_product_id
    )
    VALUES(
      v_anchor.market_id,
      v_anchor.brand_id,
      v_anchor.category_id,
      v_anchor.model,
      true,
      p_supplier_id,
      p_external_product_id
    )
    ON CONFLICT (source_supplier_id,source_external_product_id)
      WHERE source_supplier_id IS NOT NULL
        AND source_external_product_id IS NOT NULL
    DO UPDATE SET updated_at=EXCLUDED.updated_at
    RETURNING id INTO v_family_id;
  END IF;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION
      'Could not resolve NOVA family for supplier %, source parent %',
      p_supplier_id,p_external_product_id;
  END IF;

  UPDATE public.canonical_variants cv
  SET family_id=v_family_id,
      updated_at=now()
  FROM public.vendor_offers vo
  JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
  WHERE cv.id=vo.canonical_variant_id
    AND dso.supplier_id=p_supplier_id
    AND dso.external_product_id=p_external_product_id
    AND cv.category_id IS NOT NULL
    AND cv.family_id IS NULL;

  RETURN v_family_id;
END $$;

-- Bind every governed family created by 0233 to its authoritative source parent.
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
    PERFORM bls_private.ensure_nova_product_family(
      source_parent.supplier_id,
      source_parent.external_product_id
    );
  END LOOP;
END $$;

-- Re-run after replacing the function so concurrent source writes that entered via
-- the 0233 triggers are reconciled under source-authoritative identity before commit.
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
    PERFORM bls_private.ensure_nova_product_family(
      source_parent.supplier_id,
      source_parent.external_product_id
    );
  END LOOP;
END $$;

-- Fail closed on any governed detach, split parent, shared family identity, or
-- persisted source identity disagreement.
DO $$
DECLARE
  unresolved_count bigint;
  conflict_count bigint;
  shared_family_count bigint;
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
    HAVING count(DISTINCT cv.family_id)
      FILTER (WHERE cv.family_id IS NOT NULL)>1
  ) conflicts;

  SELECT count(*) INTO shared_family_count
  FROM (
    SELECT cv.family_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    WHERE ds.code='nova_brandsgateway'
      AND cv.family_id IS NOT NULL
    GROUP BY cv.family_id
    HAVING count(DISTINCT (dso.supplier_id,dso.external_product_id))>1
  ) shared_families;

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

  IF unresolved_count>0
     OR conflict_count>0
     OR shared_family_count>0
     OR identity_mismatch_count>0 THEN
    RAISE EXCEPTION
      'NOVA source-family verification failed: unresolved=%, split parents=%, shared families=%, identity mismatches=%',
      unresolved_count,
      conflict_count,
      shared_family_count,
      identity_mismatch_count;
  END IF;
END $$;
