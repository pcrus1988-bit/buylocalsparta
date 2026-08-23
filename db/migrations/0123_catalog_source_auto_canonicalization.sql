-- Buy Local Sparta — governed source-to-canonical catalogue bridge.
-- Auto-canonicalizes only high-confidence, identity-unique supplier rows.
-- Vendor connection is created as a non-sellable candidate assortment; no offer/publication is created.

BEGIN;

-- Canonical identity may exist before any commercial price is known.
-- NULL means “identity/catalogue record only”, never “free”.
ALTER TABLE public.canonical_variants
  ALTER COLUMN platform_price_minor DROP NOT NULL;

COMMENT ON COLUMN public.canonical_variants.platform_price_minor IS
  'Optional platform/reference price. NULL is valid for identity-only or draft canonicals; sellability must come from an eligible vendor offer.';

CREATE TABLE public.catalog_canonicalization_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_product_id uuid NOT NULL REFERENCES public.catalog_source_products(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.catalog_source_snapshots(id) ON DELETE CASCADE,
  candidate_category_id uuid REFERENCES public.categories(id),
  candidate_variant_id uuid REFERENCES public.canonical_variants(id) ON DELETE SET NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'missing_identity',
    'taxonomy_missing',
    'taxonomy_low_confidence',
    'taxonomy_ambiguous',
    'source_identity_collision',
    'canonical_identity_ambiguous',
    'canonical_category_conflict',
    'assortment_conflict'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_product_id)
);

CREATE INDEX catalog_canonicalization_reviews_status_idx
  ON public.catalog_canonicalization_reviews(source_id,status,reason_code,created_at);

COMMENT ON TABLE public.catalog_canonicalization_reviews IS
  'Exception-only review queue for source products that cannot be safely auto-linked or auto-canonicalized.';

ALTER TABLE public.catalog_canonicalization_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_canonicalization_reviews
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.catalog_source_canonicalization_preview(
  p_source_code text,
  p_snapshot_id uuid DEFAULT NULL,
  p_min_taxonomy_confidence numeric DEFAULT 0.95
)
RETURNS TABLE (
  source_product_id uuid,
  source_product_key text,
  title text,
  brand text,
  model text,
  category_id uuid,
  category_confidence numeric,
  existing_variant_id uuid,
  disposition text,
  reason_code text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
WITH source_context AS (
  SELECT
    cs.id AS source_id,
    cs.market_id,
    COALESCE(
      p_snapshot_id,
      (
        SELECT css.id
        FROM public.catalog_source_snapshots css
        WHERE css.source_id=cs.id
        ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC
        LIMIT 1
      )
    ) AS snapshot_id
  FROM public.catalog_sources cs
  WHERE cs.code=p_source_code
  ORDER BY cs.created_at DESC
  LIMIT 1
),
source_rows AS (
  SELECT
    csp.*,
    sc.market_id,
    NULLIF(btrim(csp.source_identity->>'brand'),'') AS source_brand,
    NULLIF(btrim(csp.source_identity->>'model'),'') AS source_model
  FROM public.catalog_source_products csp
  JOIN source_context sc
    ON sc.source_id=csp.source_id
   AND sc.snapshot_id=csp.snapshot_id
),
mapping_ranked AS (
  SELECT
    sr.id AS source_product_id,
    m.id AS mapping_id,
    m.category_id,
    m.confidence,
    m.mapping_status,
    row_number() OVER (
      PARTITION BY sr.id
      ORDER BY (m.mapping_status='approved') DESC,m.confidence DESC NULLS LAST,m.created_at,m.id
    ) AS rn,
    max(m.confidence) FILTER (WHERE m.mapping_status IN ('candidate','approved'))
      OVER (PARTITION BY sr.id) AS max_confidence
  FROM source_rows sr
  LEFT JOIN public.catalog_source_category_mappings m
    ON m.source_taxonomy_node_id=sr.source_taxonomy_node_id
   AND m.mapping_status IN ('candidate','approved')
),
best_mapping AS (
  SELECT
    mr.source_product_id,
    mr.mapping_id,
    mr.category_id,
    mr.confidence,
    mr.mapping_status,
    CASE
      WHEN mr.mapping_status='approved' THEN 1
      ELSE (
        SELECT count(*)
        FROM public.catalog_source_category_mappings tie
        JOIN source_rows sx ON sx.id=mr.source_product_id
        WHERE tie.source_taxonomy_node_id=sx.source_taxonomy_node_id
          AND tie.mapping_status IN ('candidate','approved')
          AND tie.confidence IS NOT DISTINCT FROM mr.max_confidence
      )
    END AS top_ties
  FROM mapping_ranked mr
  WHERE mr.rn=1
),
source_identity_counts AS (
  SELECT
    bls_private.catalog_normalize_text(sr.source_brand) AS normalized_brand,
    bls_private.catalog_normalize_text(sr.source_model) AS normalized_model,
    count(*) AS row_count
  FROM source_rows sr
  WHERE sr.source_brand IS NOT NULL
    AND sr.source_model IS NOT NULL
  GROUP BY 1,2
),
evaluated AS (
  SELECT
    sr.*,
    bm.mapping_id,
    bm.category_id,
    bm.confidence AS category_confidence,
    bm.mapping_status,
    bm.top_ties,
    sic.row_count AS source_identity_count,
    approved.canonical_variant_id AS approved_variant_id,
    (
      SELECT count(*)
      FROM public.canonical_variants cv
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      WHERE cv.market_id=sr.market_id
        AND cv.category_id=bm.category_id
        AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(sr.source_brand)
        AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(sr.source_model)
        AND cv.recalled=false
    ) AS exact_canonical_count,
    (
      SELECT cv.id
      FROM public.canonical_variants cv
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      WHERE cv.market_id=sr.market_id
        AND cv.category_id=bm.category_id
        AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(sr.source_brand)
        AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(sr.source_model)
        AND cv.recalled=false
      ORDER BY cv.created_at,cv.id
      LIMIT 1
    ) AS exact_canonical_id,
    (
      SELECT count(*)
      FROM public.canonical_variants cv
      LEFT JOIN public.brands b ON b.id=cv.brand_id
      WHERE cv.market_id=sr.market_id
        AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(sr.source_brand)
        AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(sr.source_model)
        AND cv.recalled=false
    ) AS market_identity_count
  FROM source_rows sr
  LEFT JOIN best_mapping bm ON bm.source_product_id=sr.id
  LEFT JOIN source_identity_counts sic
    ON sic.normalized_brand=bls_private.catalog_normalize_text(sr.source_brand)
   AND sic.normalized_model=bls_private.catalog_normalize_text(sr.source_model)
  LEFT JOIN LATERAL (
    SELECT l.canonical_variant_id
    FROM public.catalog_source_product_links l
    WHERE l.source_product_id=sr.id
      AND l.link_status='approved'
    ORDER BY l.updated_at DESC,l.id
    LIMIT 1
  ) approved ON true
)
SELECT
  e.id,
  e.source_product_key,
  e.title,
  e.source_brand,
  e.source_model,
  e.category_id,
  e.category_confidence,
  COALESCE(e.approved_variant_id,CASE WHEN e.exact_canonical_count=1 THEN e.exact_canonical_id END),
  CASE
    WHEN e.approved_variant_id IS NOT NULL THEN 'already_linked'
    WHEN e.source_brand IS NULL OR e.source_model IS NULL THEN 'review'
    WHEN e.category_id IS NULL THEN 'review'
    WHEN e.mapping_status<>'approved' AND COALESCE(e.category_confidence,0)<p_min_taxonomy_confidence THEN 'review'
    WHEN e.mapping_status<>'approved' AND e.top_ties<>1 THEN 'review'
    WHEN COALESCE(e.source_identity_count,0)<>1 THEN 'review'
    WHEN e.exact_canonical_count>1 THEN 'review'
    WHEN e.exact_canonical_count=1 THEN 'link_existing'
    WHEN e.market_identity_count>0 THEN 'review'
    ELSE 'create_canonical'
  END,
  CASE
    WHEN e.approved_variant_id IS NOT NULL THEN NULL
    WHEN e.source_brand IS NULL OR e.source_model IS NULL THEN 'missing_identity'
    WHEN e.category_id IS NULL THEN 'taxonomy_missing'
    WHEN e.mapping_status<>'approved' AND COALESCE(e.category_confidence,0)<p_min_taxonomy_confidence THEN 'taxonomy_low_confidence'
    WHEN e.mapping_status<>'approved' AND e.top_ties<>1 THEN 'taxonomy_ambiguous'
    WHEN COALESCE(e.source_identity_count,0)<>1 THEN 'source_identity_collision'
    WHEN e.exact_canonical_count>1 THEN 'canonical_identity_ambiguous'
    WHEN e.exact_canonical_count=0 AND e.market_identity_count>0 THEN 'canonical_category_conflict'
    ELSE NULL
  END
FROM evaluated e
ORDER BY e.source_product_key;
$$;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_canonicalization(
  p_source_code text,
  p_vendor_id uuid,
  p_location_id uuid,
  p_snapshot_id uuid DEFAULT NULL,
  p_min_taxonomy_confidence numeric DEFAULT 0.95,
  p_default_tax_rate_bps integer DEFAULT 2400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_source_id uuid;
  v_market_id uuid;
  v_snapshot_id uuid;
  v_currency char(3);
  v_locale text;
  v_source_count integer:=0;
  v_created integer:=0;
  v_linked integer:=0;
  v_already integer:=0;
  v_review integer:=0;
  v_assortments integer:=0;
  v_row record;
  v_brand_id uuid;
  v_variant_id uuid;
  v_slug text;
  v_variant_attributes jsonb;
  v_description text;
  v_existing_assortment uuid;
BEGIN
  IF p_min_taxonomy_confidence<0 OR p_min_taxonomy_confidence>1 THEN
    RAISE EXCEPTION 'p_min_taxonomy_confidence must be between 0 and 1';
  END IF;
  IF p_default_tax_rate_bps<0 OR p_default_tax_rate_bps>10000 THEN
    RAISE EXCEPTION 'p_default_tax_rate_bps must be between 0 and 10000';
  END IF;

  SELECT cs.id,cs.market_id,m.currency,m.default_locale
    INTO v_source_id,v_market_id,v_currency,v_locale
  FROM public.catalog_sources cs
  JOIN public.markets m ON m.id=cs.market_id
  WHERE cs.code=p_source_code
  ORDER BY cs.created_at DESC
  LIMIT 1;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Unknown catalogue source: %',p_source_code;
  END IF;

  SELECT COALESCE(
    p_snapshot_id,
    (
      SELECT css.id
      FROM public.catalog_source_snapshots css
      WHERE css.source_id=v_source_id
      ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC
      LIMIT 1
    )
  ) INTO v_snapshot_id;

  IF v_snapshot_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.catalog_source_snapshots css
       WHERE css.id=v_snapshot_id AND css.source_id=v_source_id
     ) THEN
    RAISE EXCEPTION 'Snapshot does not belong to catalogue source %',p_source_code;
  END IF;

  -- Candidate assortment assignment is allowed before vendor activation.
  -- This validates identity/location only; it deliberately does not require vendor status='approved'.
  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_businesses vb
    WHERE vb.id=p_vendor_id AND vb.market_id=v_market_id
  ) THEN
    RAISE EXCEPTION 'Vendor is not in the source market';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_locations vl
    WHERE vl.id=p_location_id
      AND vl.vendor_id=p_vendor_id
      AND vl.market_id=v_market_id
      AND vl.active=true
  ) THEN
    RAISE EXCEPTION 'Active vendor location is not valid for the source market';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog_source_canonicalization:'||v_source_id::text));

  SELECT count(*) INTO v_source_count
  FROM public.catalog_source_products
  WHERE source_id=v_source_id AND snapshot_id=v_snapshot_id;

  FOR v_row IN
    SELECT
      p.*,
      csp.source_id,
      csp.snapshot_id,
      csp.supplier_code,
      csp.normalized_payload,
      csp.source_identity,
      csp.source_taxonomy_node_id
    FROM bls_private.catalog_source_canonicalization_preview(
      p_source_code,v_snapshot_id,p_min_taxonomy_confidence
    ) p
    JOIN public.catalog_source_products csp ON csp.id=p.source_product_id
  LOOP
    IF v_row.disposition='review' THEN
      INSERT INTO public.catalog_canonicalization_reviews(
        source_product_id,source_id,market_id,snapshot_id,candidate_category_id,
        candidate_variant_id,reason_code,status,details,updated_at
      )
      VALUES(
        v_row.source_product_id,v_source_id,v_market_id,v_snapshot_id,v_row.category_id,
        v_row.existing_variant_id,v_row.reason_code,'open',
        jsonb_strip_nulls(jsonb_build_object(
          'sourceProductKey',v_row.source_product_key,
          'title',v_row.title,
          'brand',v_row.brand,
          'model',v_row.model,
          'categoryConfidence',v_row.category_confidence,
          'minTaxonomyConfidence',p_min_taxonomy_confidence
        )),
        now()
      )
      ON CONFLICT (source_product_id) DO UPDATE
      SET candidate_category_id=EXCLUDED.candidate_category_id,
          candidate_variant_id=EXCLUDED.candidate_variant_id,
          reason_code=EXCLUDED.reason_code,
          status='open',
          details=EXCLUDED.details,
          resolved_at=NULL,
          updated_at=now();

      v_review:=v_review+1;
      CONTINUE;
    END IF;

    IF v_row.disposition='already_linked' THEN
      v_variant_id:=v_row.existing_variant_id;
      v_already:=v_already+1;

    ELSIF v_row.disposition='link_existing' THEN
      v_variant_id:=v_row.existing_variant_id;

      INSERT INTO public.catalog_source_product_links(
        source_product_id,canonical_variant_id,link_status,match_method,
        confidence,reasons,reviewed_at
      )
      VALUES(
        v_row.source_product_id,v_variant_id,'approved','model',0.99000,
        jsonb_build_array('exact_brand_model','high_confidence_source_taxonomy'),
        now()
      )
      ON CONFLICT (source_product_id,canonical_variant_id) DO UPDATE
      SET link_status='approved',
          match_method='model',
          confidence=0.99000,
          reasons=EXCLUDED.reasons,
          reviewed_at=now(),
          updated_at=now();

      v_linked:=v_linked+1;

    ELSE
      -- The preview admitted this row only when the top source taxonomy mapping
      -- was unique and at/above the configured confidence threshold.
      UPDATE public.catalog_source_category_mappings m
      SET mapping_status='superseded',
          updated_at=now(),
          metadata=m.metadata||jsonb_build_object('supersededBy','auto_canonicalizer_v1')
      WHERE m.source_taxonomy_node_id=v_row.source_taxonomy_node_id
        AND m.mapping_status='candidate'
        AND m.category_id<>v_row.category_id;

      UPDATE public.catalog_source_category_mappings m
      SET mapping_status='approved',
          reviewed_at=COALESCE(m.reviewed_at,now()),
          updated_at=now(),
          metadata=m.metadata||jsonb_build_object(
            'autoApprovedBy','auto_canonicalizer_v1',
            'autoApprovedConfidence',v_row.category_confidence
          )
      WHERE m.source_taxonomy_node_id=v_row.source_taxonomy_node_id
        AND m.category_id=v_row.category_id
        AND m.mapping_status='candidate';

      SELECT b.id INTO v_brand_id
      FROM public.brands b
      WHERE bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(v_row.brand)
      ORDER BY b.created_at,b.id
      LIMIT 1;

      IF v_brand_id IS NULL THEN
        INSERT INTO public.brands(name,normalized_name,status,created_at,updated_at)
        VALUES(
          v_row.brand,
          lower(regexp_replace(btrim(v_row.brand),'[[:space:]]+',' ','g')),
          'active',
          now(),
          now()
        )
        ON CONFLICT (normalized_name) DO UPDATE
          SET updated_at=public.brands.updated_at
        RETURNING id INTO v_brand_id;
      END IF;

      v_slug:=trim(
        both '-' from regexp_replace(
          lower(v_row.brand||'-'||v_row.model),
          '[^a-z0-9]+','-','g'
        )
      );
      IF v_slug='' THEN v_slug:='product'; END IF;
      v_slug:=left(v_slug,100)||'-'||left(md5(v_row.source_product_id::text),8);

      v_variant_attributes:=COALESCE(v_row.normalized_payload->'variantAttributes','{}'::jsonb);
      v_description:=NULLIF(
        btrim(COALESCE(
          v_row.normalized_payload->>'descriptionEl',
          v_row.normalized_payload->>'supplierDescription'
        )),
        ''
      );

      INSERT INTO public.canonical_variants(
        market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
        variant_attributes,warranty_basis,platform_price_minor,currency,tax_rate_bps,
        active,suppressed,recalled,price_updated_at,created_at,updated_at
      )
      VALUES(
        v_market_id,NULL,v_brand_id,v_row.category_id,v_slug,NULL,NULL,v_row.model,'new',
        v_variant_attributes,NULL,NULL,v_currency,p_default_tax_rate_bps,
        false,false,false,now(),now(),now()
      )
      RETURNING id INTO v_variant_id;

      INSERT INTO public.product_translations(
        canonical_variant_id,locale,title,description,specifications
      )
      VALUES(v_variant_id,v_locale,v_row.title,v_description,v_variant_attributes)
      ON CONFLICT (canonical_variant_id,locale) DO NOTHING;

      INSERT INTO public.catalog_source_product_links(
        source_product_id,canonical_variant_id,link_status,match_method,
        confidence,reasons,reviewed_at
      )
      VALUES(
        v_row.source_product_id,v_variant_id,'approved','enrichment',0.99000,
        jsonb_build_array(
          'auto_created_canonical',
          'unique_brand_model',
          'high_confidence_source_taxonomy'
        ),
        now()
      );

      v_created:=v_created+1;
    END IF;

    -- Attach source evidence to the canonical identity without changing its
    -- commercial meaning or verification status.
    UPDATE public.catalog_price_observations
    SET canonical_variant_id=v_variant_id
    WHERE source_product_id=v_row.source_product_id
      AND canonical_variant_id IS NULL;

    UPDATE public.product_compatibility_claims
    SET subject_canonical_variant_id=v_variant_id
    WHERE source_product_id=v_row.source_product_id
      AND subject_canonical_variant_id IS NULL;

    SELECT vca.id INTO v_existing_assortment
    FROM public.vendor_catalog_assortments vca
    WHERE vca.vendor_id=p_vendor_id
      AND vca.location_id=p_location_id
      AND vca.canonical_variant_id=v_variant_id
      AND vca.assortment_status<>'discontinued'
    ORDER BY vca.created_at,vca.id
    LIMIT 1;

    IF v_existing_assortment IS NULL THEN
      INSERT INTO public.vendor_catalog_assortments(
        market_id,vendor_id,location_id,source_product_id,canonical_variant_id,
        vendor_sku,assortment_status,availability_mode,confirmation_source,
        metadata,created_at,updated_at
      )
      VALUES(
        v_market_id,p_vendor_id,p_location_id,v_row.source_product_id,v_variant_id,
        v_row.supplier_code,'candidate','ask_vendor','import',
        jsonb_build_object(
          'commercialConfirmationRequired',true,
          'sourceCode',p_source_code,
          'snapshotId',v_snapshot_id,
          'canonicalization','auto_canonicalizer_v1'
        ),
        now(),now()
      )
      ON CONFLICT (vendor_id,location_id,source_product_id)
        WHERE source_product_id IS NOT NULL
      DO UPDATE
      SET canonical_variant_id=EXCLUDED.canonical_variant_id,
          vendor_sku=COALESCE(EXCLUDED.vendor_sku,public.vendor_catalog_assortments.vendor_sku),
          assortment_status=CASE
            WHEN public.vendor_catalog_assortments.assortment_status IN ('confirmed','paused')
              THEN public.vendor_catalog_assortments.assortment_status
            ELSE 'candidate'
          END,
          availability_mode=CASE
            WHEN public.vendor_catalog_assortments.assortment_status='confirmed'
              THEN public.vendor_catalog_assortments.availability_mode
            ELSE 'ask_vendor'
          END,
          metadata=public.vendor_catalog_assortments.metadata||EXCLUDED.metadata,
          updated_at=now();

      v_assortments:=v_assortments+1;
    ELSE
      UPDATE public.vendor_catalog_assortments
      SET metadata=metadata||jsonb_build_object(
            'sourceCode',p_source_code,
            'snapshotId',v_snapshot_id,
            'canonicalization','auto_canonicalizer_v1'
          ),
          updated_at=now()
      WHERE id=v_existing_assortment;
    END IF;

    UPDATE public.catalog_canonicalization_reviews
    SET status='resolved',
        resolved_at=now(),
        candidate_variant_id=v_variant_id,
        updated_at=now()
    WHERE source_product_id=v_row.source_product_id
      AND status='open';
  END LOOP;

  RETURN jsonb_build_object(
    'sourceCode',p_source_code,
    'sourceId',v_source_id,
    'snapshotId',v_snapshot_id,
    'vendorId',p_vendor_id,
    'locationId',p_location_id,
    'sourceRows',v_source_count,
    'canonicalCreated',v_created,
    'linkedExisting',v_linked,
    'alreadyLinked',v_already,
    'reviewRequired',v_review,
    'candidateAssortmentsCreated',v_assortments,
    'vendorOffersCreated',0,
    'publicationActivated',false,
    'minTaxonomyConfidence',p_min_taxonomy_confidence
  );
END;
$$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_canonicalization_reviews
  TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_source_canonicalization_preview(text,uuid,numeric)
  TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_canonicalization(text,uuid,uuid,uuid,numeric,integer)
  TO bls_platform_runtime;

COMMIT;
