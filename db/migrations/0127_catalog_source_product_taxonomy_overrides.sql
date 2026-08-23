-- Buy Local Sparta — stable product-level supplier taxonomy overrides.
-- Supplier leaves can legitimately contain products from multiple KONTAMOU classes.
-- Overrides bind to (source_id, source_product_key), survive later source snapshots,
-- preserve immutable supplier taxonomy evidence, and never make a product sellable.

BEGIN;

-- Precise class for TV/monitor mounts discovered in the Nikolaou catalogue.
INSERT INTO public.product_types(code,status,product_mode,variant_strategy,created_at,updated_at)
VALUES('display_mount','active','standard','none',now(),now())
ON CONFLICT (code) DO UPDATE
SET status='active',product_mode='standard',variant_strategy='none',updated_at=now();

INSERT INTO public.product_type_translations(product_type_id,locale,name,description)
SELECT pt.id,v.locale,v.name,v.description
FROM public.product_types pt
CROSS JOIN (VALUES
  ('el','Βάση τηλεόρασης / οθόνης','Βάσεις, βραχίονες και στηρίγματα για τηλεοράσεις και οθόνες.'),
  ('en','TV / monitor mount','Mounts, arms and stands for televisions and monitors.')
) AS v(locale,name,description)
WHERE pt.code='display_mount'
ON CONFLICT (product_type_id,locale) DO UPDATE
SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO public.categories(
  market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
  require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
  advice_allowed,checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order,updated_at
)
SELECT
  p.market_id,p.id,'display-mounts-stands','display-mounts-stands',p.commerce_mode,true,
  '{}'::jsonb,'{}'::jsonb,p.require_compatibility_confirmation,p.regulated_checkout_allowed,
  p.counteroffer_allowed,p.advice_allowed,p.checkout_fulfilment_modes,
  'product_class',true,true,40,now()
FROM public.categories p
WHERE p.code='tv-audio-home-entertainment'
  AND NOT EXISTS (
    SELECT 1 FROM public.categories existing
    WHERE existing.market_id=p.market_id AND existing.code='display-mounts-stands'
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.category_translations(category_id,locale,name)
SELECT c.id,v.locale,v.name
FROM public.categories c
CROSS JOIN (VALUES
  ('el','Βάσεις τηλεοράσεων & οθονών'),
  ('en','TV & monitor mounts')
) AS v(locale,name)
WHERE c.code='display-mounts-stands'
ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO public.category_product_types(category_id,product_type_id,is_default,sort_order)
SELECT c.id,pt.id,true,10
FROM public.categories c
JOIN public.product_types pt ON pt.code='display_mount'
WHERE c.code='display-mounts-stands'
ON CONFLICT (category_id,product_type_id) DO UPDATE
SET is_default=true,sort_order=10;

CREATE TABLE public.catalog_source_product_category_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  source_product_key text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id),
  override_status text NOT NULL DEFAULT 'approved'
    CHECK (override_status IN ('candidate','approved','superseded')),
  confidence numeric(5,4) NOT NULL DEFAULT 1.0000
    CHECK (confidence >= 0 AND confidence <= 1),
  reason_code text NOT NULL DEFAULT 'mixed_source_leaf'
    CHECK (reason_code IN ('mixed_source_leaf','manual_review','model_rule','admin_override','other')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id,source_product_key)
);

CREATE INDEX catalog_source_product_category_overrides_lookup_idx
  ON public.catalog_source_product_category_overrides(source_id,override_status,source_product_key);
CREATE INDEX catalog_source_product_category_overrides_category_idx
  ON public.catalog_source_product_category_overrides(category_id,override_status,updated_at DESC);

COMMENT ON TABLE public.catalog_source_product_category_overrides IS
  'Stable per-supplier-product KONTAMOU category decisions for mixed/exceptional source taxonomy. Decisions survive new snapshots while supplier evidence remains unchanged.';

ALTER TABLE public.catalog_source_product_category_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON public.catalog_source_product_category_overrides
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.set_catalog_source_product_category_override(
  p_source_product_id uuid,
  p_category_code text,
  p_confidence numeric DEFAULT 1.0,
  p_reason_code text DEFAULT 'manual_review',
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_market_id uuid;
  v_source_id uuid;
  v_source_product_key text;
  v_category_id uuid;
  v_override_id uuid;
BEGIN
  IF p_source_product_id IS NULL THEN RAISE EXCEPTION 'Source product id is required'; END IF;
  IF p_category_code IS NULL OR btrim(p_category_code)='' THEN RAISE EXCEPTION 'Category code is required'; END IF;
  IF p_confidence IS NULL OR p_confidence<0 OR p_confidence>1 THEN RAISE EXCEPTION 'Override confidence must be between 0 and 1'; END IF;
  IF p_reason_code NOT IN ('mixed_source_leaf','manual_review','model_rule','admin_override','other') THEN
    RAISE EXCEPTION 'Unsupported override reason code: %',p_reason_code;
  END IF;

  SELECT cs.market_id,csp.source_id,csp.source_product_key
  INTO v_market_id,v_source_id,v_source_product_key
  FROM public.catalog_source_products csp
  JOIN public.catalog_sources cs ON cs.id=csp.source_id
  WHERE csp.id=p_source_product_id;
  IF v_source_id IS NULL THEN RAISE EXCEPTION 'Source product was not found'; END IF;

  SELECT c.id INTO v_category_id
  FROM public.categories c
  WHERE c.market_id=v_market_id AND c.code=p_category_code AND c.active=true AND c.assignable=true
  ORDER BY c.created_at,c.id LIMIT 1;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Active assignable category % was not found in source market',p_category_code;
  END IF;

  INSERT INTO public.catalog_source_product_category_overrides(
    source_id,source_product_key,category_id,override_status,confidence,reason_code,evidence,reviewed_at,updated_at
  ) VALUES(
    v_source_id,v_source_product_key,v_category_id,'approved',p_confidence,p_reason_code,COALESCE(p_evidence,'{}'::jsonb),now(),now()
  )
  ON CONFLICT (source_id,source_product_key) DO UPDATE
  SET category_id=EXCLUDED.category_id,override_status='approved',confidence=EXCLUDED.confidence,
      reason_code=EXCLUDED.reason_code,evidence=EXCLUDED.evidence,reviewed_at=now(),updated_at=now()
  RETURNING id INTO v_override_id;

  RETURN v_override_id;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.apply_catalog_source_product_category_overrides(
  p_source_code text,
  p_vendor_id uuid,
  p_location_id uuid,
  p_snapshot_id uuid DEFAULT NULL,
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
  v_override_rows integer:=0;
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
  v_identity_count integer;
  v_exact_count integer;
  v_market_identity_count integer;
  v_reason_code text;
BEGIN
  IF p_default_tax_rate_bps<0 OR p_default_tax_rate_bps>10000 THEN
    RAISE EXCEPTION 'p_default_tax_rate_bps must be between 0 and 10000';
  END IF;

  SELECT cs.id,cs.market_id,m.currency,m.default_locale
  INTO v_source_id,v_market_id,v_currency,v_locale
  FROM public.catalog_sources cs
  JOIN public.markets m ON m.id=cs.market_id
  WHERE cs.code=p_source_code AND cs.active=true
  ORDER BY cs.created_at DESC,cs.id DESC LIMIT 1;
  IF v_source_id IS NULL THEN RAISE EXCEPTION 'Unknown active catalogue source: %',p_source_code; END IF;

  SELECT COALESCE(p_snapshot_id,(
    SELECT css.id FROM public.catalog_source_snapshots css
    WHERE css.source_id=v_source_id
    ORDER BY COALESCE(css.observed_at,css.created_at) DESC,css.created_at DESC,css.id DESC LIMIT 1
  )) INTO v_snapshot_id;
  IF v_snapshot_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.catalog_source_snapshots css WHERE css.id=v_snapshot_id AND css.source_id=v_source_id
  ) THEN RAISE EXCEPTION 'Snapshot does not belong to catalogue source %',p_source_code; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendor_businesses vb WHERE vb.id=p_vendor_id AND vb.market_id=v_market_id) THEN
    RAISE EXCEPTION 'Vendor is not in the source market';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vendor_locations vl
    WHERE vl.id=p_location_id AND vl.vendor_id=p_vendor_id AND vl.market_id=v_market_id AND vl.active=true
  ) THEN RAISE EXCEPTION 'Active vendor location is not valid for the source market'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('catalog_source_product_overrides:'||v_source_id::text));

  SELECT count(*) INTO v_override_rows
  FROM public.catalog_source_product_category_overrides o
  JOIN public.catalog_source_products csp
    ON csp.source_id=o.source_id AND csp.source_product_key=o.source_product_key
  WHERE o.source_id=v_source_id AND csp.snapshot_id=v_snapshot_id AND o.override_status='approved';

  FOR v_row IN
    SELECT csp.*,o.category_id,o.confidence AS category_confidence,
           NULLIF(btrim(csp.source_identity->>'brand'),'') AS source_brand,
           NULLIF(btrim(csp.source_identity->>'model'),'') AS source_model,
           c.code AS category_code
    FROM public.catalog_source_product_category_overrides o
    JOIN public.catalog_source_products csp
      ON csp.source_id=o.source_id AND csp.source_product_key=o.source_product_key
    JOIN public.categories c ON c.id=o.category_id
    WHERE o.source_id=v_source_id AND csp.snapshot_id=v_snapshot_id
      AND o.override_status='approved' AND c.market_id=v_market_id AND c.active=true AND c.assignable=true
    ORDER BY csp.source_product_key,csp.id
  LOOP
    v_variant_id:=NULL;
    v_reason_code:=NULL;

    SELECT l.canonical_variant_id INTO v_variant_id
    FROM public.catalog_source_product_links l
    WHERE l.source_product_id=v_row.id AND l.link_status='approved'
    ORDER BY l.updated_at DESC,l.id LIMIT 1;

    IF v_variant_id IS NOT NULL THEN
      v_already:=v_already+1;
    ELSE
      IF v_row.source_brand IS NULL OR v_row.source_model IS NULL THEN
        v_reason_code:='missing_identity';
      ELSE
        SELECT count(*) INTO v_identity_count
        FROM public.catalog_source_products sx
        WHERE sx.source_id=v_source_id AND sx.snapshot_id=v_snapshot_id
          AND bls_private.catalog_normalize_text(NULLIF(btrim(sx.source_identity->>'brand'),''))=bls_private.catalog_normalize_text(v_row.source_brand)
          AND bls_private.catalog_normalize_text(NULLIF(btrim(sx.source_identity->>'model'),''))=bls_private.catalog_normalize_text(v_row.source_model);
        IF v_identity_count<>1 THEN v_reason_code:='source_identity_collision'; END IF;
      END IF;

      IF v_reason_code IS NULL THEN
        SELECT count(*) INTO v_exact_count
        FROM public.canonical_variants cv
        LEFT JOIN public.brands b ON b.id=cv.brand_id
        WHERE cv.market_id=v_market_id AND cv.category_id=v_row.category_id
          AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(v_row.source_brand)
          AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(v_row.source_model)
          AND cv.recalled=false;

        SELECT count(*) INTO v_market_identity_count
        FROM public.canonical_variants cv
        LEFT JOIN public.brands b ON b.id=cv.brand_id
        WHERE cv.market_id=v_market_id
          AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(v_row.source_brand)
          AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(v_row.source_model)
          AND cv.recalled=false;

        IF v_exact_count>1 THEN
          v_reason_code:='canonical_identity_ambiguous';
        ELSIF v_exact_count=0 AND v_market_identity_count>0 THEN
          v_reason_code:='canonical_category_conflict';
        ELSIF v_exact_count=1 THEN
          SELECT cv.id INTO v_variant_id
          FROM public.canonical_variants cv
          LEFT JOIN public.brands b ON b.id=cv.brand_id
          WHERE cv.market_id=v_market_id AND cv.category_id=v_row.category_id
            AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(v_row.source_brand)
            AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(v_row.source_model)
            AND cv.recalled=false
          ORDER BY cv.created_at,cv.id LIMIT 1;

          INSERT INTO public.catalog_source_product_links(
            source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
          ) VALUES(
            v_row.id,v_variant_id,'approved','model',LEAST(v_row.category_confidence,0.99000),
            jsonb_build_array('exact_brand_model','approved_product_category_override'),now()
          )
          ON CONFLICT (source_product_id,canonical_variant_id) DO UPDATE
          SET link_status='approved',match_method='model',confidence=EXCLUDED.confidence,
              reasons=EXCLUDED.reasons,reviewed_at=now(),updated_at=now();
          v_linked:=v_linked+1;
        END IF;
      END IF;

      IF v_reason_code IS NOT NULL THEN
        INSERT INTO public.catalog_canonicalization_reviews(
          source_product_id,source_id,market_id,snapshot_id,candidate_category_id,
          candidate_variant_id,reason_code,status,details,updated_at
        ) VALUES(
          v_row.id,v_source_id,v_market_id,v_snapshot_id,v_row.category_id,NULL,
          v_reason_code,'open',jsonb_strip_nulls(jsonb_build_object(
            'sourceProductKey',v_row.source_product_key,'title',v_row.title,
            'brand',v_row.source_brand,'model',v_row.source_model,
            'categoryCode',v_row.category_code,'categoryResolution','product_override'
          )),now()
        )
        ON CONFLICT (source_product_id) DO UPDATE
        SET candidate_category_id=EXCLUDED.candidate_category_id,candidate_variant_id=NULL,
            reason_code=EXCLUDED.reason_code,status='open',details=EXCLUDED.details,
            resolved_at=NULL,updated_at=now();
        v_review:=v_review+1;
        CONTINUE;
      END IF;

      IF v_variant_id IS NULL THEN
        SELECT b.id INTO v_brand_id
        FROM public.brands b
        WHERE bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(v_row.source_brand)
        ORDER BY b.created_at,b.id LIMIT 1;

        IF v_brand_id IS NULL THEN
          INSERT INTO public.brands(name,normalized_name,status,created_at,updated_at)
          VALUES(
            v_row.source_brand,lower(regexp_replace(btrim(v_row.source_brand),'[[:space:]]+',' ','g')),
            'active',now(),now()
          )
          ON CONFLICT (normalized_name) DO UPDATE SET updated_at=public.brands.updated_at
          RETURNING id INTO v_brand_id;
        END IF;

        v_slug:=trim(both '-' from regexp_replace(
          lower(v_row.source_brand||'-'||v_row.source_model),'[^a-z0-9]+','-','g'
        ));
        IF v_slug='' THEN v_slug:='product'; END IF;
        v_slug:=left(v_slug,100)||'-'||left(md5(v_row.id::text),8);
        v_variant_attributes:=COALESCE(v_row.normalized_payload->'variantAttributes','{}'::jsonb);
        v_description:=NULLIF(btrim(COALESCE(
          v_row.normalized_payload->>'descriptionEl',v_row.normalized_payload->>'supplierDescription'
        )), '');

        INSERT INTO public.canonical_variants(
          market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
          variant_attributes,warranty_basis,platform_price_minor,currency,tax_rate_bps,
          active,suppressed,recalled,price_updated_at,created_at,updated_at
        ) VALUES(
          v_market_id,NULL,v_brand_id,v_row.category_id,v_slug,NULL,NULL,v_row.source_model,'new',
          v_variant_attributes,NULL,NULL,v_currency,p_default_tax_rate_bps,
          false,false,false,now(),now(),now()
        ) RETURNING id INTO v_variant_id;

        INSERT INTO public.product_translations(canonical_variant_id,locale,title,description,specifications)
        VALUES(v_variant_id,v_locale,v_row.title,v_description,v_variant_attributes)
        ON CONFLICT (canonical_variant_id,locale) DO NOTHING;

        INSERT INTO public.catalog_source_product_links(
          source_product_id,canonical_variant_id,link_status,match_method,confidence,reasons,reviewed_at
        ) VALUES(
          v_row.id,v_variant_id,'approved','enrichment',LEAST(v_row.category_confidence,0.99000),
          jsonb_build_array('auto_created_canonical','unique_brand_model','approved_product_category_override'),now()
        );
        v_created:=v_created+1;
      END IF;
    END IF;

    UPDATE public.catalog_price_observations
    SET canonical_variant_id=v_variant_id
    WHERE source_product_id=v_row.id AND canonical_variant_id IS NULL;
    UPDATE public.product_compatibility_claims
    SET subject_canonical_variant_id=v_variant_id
    WHERE source_product_id=v_row.id AND subject_canonical_variant_id IS NULL;

    SELECT vca.id INTO v_existing_assortment
    FROM public.vendor_catalog_assortments vca
    WHERE vca.vendor_id=p_vendor_id AND vca.location_id=p_location_id
      AND vca.canonical_variant_id=v_variant_id AND vca.assortment_status<>'discontinued'
    ORDER BY vca.created_at,vca.id LIMIT 1;

    IF v_existing_assortment IS NULL THEN
      INSERT INTO public.vendor_catalog_assortments(
        market_id,vendor_id,location_id,source_product_id,canonical_variant_id,vendor_sku,
        assortment_status,availability_mode,confirmation_source,metadata,created_at,updated_at
      ) VALUES(
        v_market_id,p_vendor_id,p_location_id,v_row.id,v_variant_id,v_row.supplier_code,
        'candidate','ask_vendor','import',jsonb_build_object(
          'commercialConfirmationRequired',true,'sourceCode',p_source_code,'snapshotId',v_snapshot_id,
          'canonicalization','product_category_override_v1','categoryCode',v_row.category_code
        ),now(),now()
      )
      ON CONFLICT (vendor_id,location_id,source_product_id) WHERE source_product_id IS NOT NULL
      DO UPDATE SET
        canonical_variant_id=EXCLUDED.canonical_variant_id,
        vendor_sku=COALESCE(EXCLUDED.vendor_sku,public.vendor_catalog_assortments.vendor_sku),
        assortment_status=CASE WHEN public.vendor_catalog_assortments.assortment_status IN ('confirmed','paused')
          THEN public.vendor_catalog_assortments.assortment_status ELSE 'candidate' END,
        availability_mode=CASE WHEN public.vendor_catalog_assortments.assortment_status='confirmed'
          THEN public.vendor_catalog_assortments.availability_mode ELSE 'ask_vendor' END,
        metadata=public.vendor_catalog_assortments.metadata||EXCLUDED.metadata,updated_at=now();
      v_assortments:=v_assortments+1;
    ELSE
      UPDATE public.vendor_catalog_assortments
      SET metadata=metadata||jsonb_build_object(
        'sourceCode',p_source_code,'snapshotId',v_snapshot_id,
        'canonicalization','product_category_override_v1','categoryCode',v_row.category_code
      ),updated_at=now()
      WHERE id=v_existing_assortment;
    END IF;

    UPDATE public.catalog_canonicalization_reviews
    SET status='resolved',resolved_at=now(),candidate_category_id=v_row.category_id,
        candidate_variant_id=v_variant_id,updated_at=now()
    WHERE source_product_id=v_row.id AND status='open';
  END LOOP;

  RETURN jsonb_build_object(
    'sourceCode',p_source_code,'sourceId',v_source_id,'snapshotId',v_snapshot_id,
    'vendorId',p_vendor_id,'locationId',p_location_id,'approvedOverrideRows',v_override_rows,
    'canonicalCreated',v_created,'linkedExisting',v_linked,'alreadyLinked',v_already,
    'reviewRequired',v_review,'candidateAssortmentsCreated',v_assortments,
    'vendorOffersCreated',0,'publicationActivated',false
  );
END
$$;

REVOKE ALL ON FUNCTION bls_private.set_catalog_source_product_category_override(uuid,text,numeric,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.apply_catalog_source_product_category_overrides(text,uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_source_product_category_overrides TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.set_catalog_source_product_category_override(uuid,text,numeric,text,jsonb) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.apply_catalog_source_product_category_overrides(text,uuid,uuid,uuid,integer) TO bls_platform_runtime;

COMMIT;
