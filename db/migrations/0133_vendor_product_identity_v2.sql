-- Buy Local Sparta — vendor product submission identity-v2 matching.
-- Vendors may link to an existing canonical identity, including an inactive/draft canonical,
-- but vendor input must never activate/publicize the canonical or create an offer by itself.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.match_submitted_vendor_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  raw_gtin text:=nullif(btrim(NEW.source_identity->>'gtin'),'');
  normalized_gtin text;
  raw_mpn text:=nullif(btrim(coalesce(NEW.source_identity->>'mpn',NEW.source_payload->>'mpn')),'');
  raw_model text:=nullif(btrim(NEW.source_identity->>'model'),'');
  raw_part text;
  raw_brand text:=nullif(btrim(NEW.source_identity->>'brand'),'');
  raw_title text:=nullif(btrim(NEW.source_identity->>'title'),'');
  source_attributes jsonb:='{}'::jsonb;
  exact_variant uuid;
  exact_count integer:=0;
  compatible_count integer:=0;
  conflicting_count integer:=0;
  candidate_count integer:=0;
  candidate record;
  candidate_confidence numeric;
  candidate_level text;
  reasons jsonb;
  conflict_reason text;
BEGIN
  IF NEW.status<>'submitted' THEN RETURN NEW; END IF;

  source_attributes:=
    CASE WHEN jsonb_typeof(NEW.source_payload->'attributes')='object'
      THEN NEW.source_payload->'attributes' ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(NEW.source_payload->'variantAttributes')='object'
      THEN NEW.source_payload->'variantAttributes' ELSE '{}'::jsonb END;
  raw_part:=coalesce(raw_mpn,raw_model);

  -- A supplied GTIN is authoritative enough that an invalid value must never be
  -- silently ignored in favour of weaker title/model matching.
  IF raw_gtin IS NOT NULL THEN
    IF NOT bls_private.catalog_gtin_is_valid(raw_gtin) THEN
      UPDATE public.vendor_product_submissions
      SET status='needs_review',updated_at=now()
      WHERE id=NEW.id;

      INSERT INTO public.catalog_workflow_events(
        id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at
      ) VALUES(
        gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,NEW.created_by,
        'identifier_validation','submitted','needs_review',
        jsonb_build_object(
          'matching_engine','catalog_identity_v2',
          'identifier','gtin','value',raw_gtin,'result','invalid_checksum_or_format'
        ),now()
      );
      RETURN NEW;
    END IF;

    normalized_gtin:=bls_private.catalog_normalize_gtin(raw_gtin);

    SELECT count(DISTINCT cv.id)::integer INTO exact_count
    FROM public.canonical_variants cv
    WHERE cv.market_id=NEW.market_id
      AND cv.suppressed=false
      AND cv.recalled=false
      AND (
        (
          cv.gtin IS NOT NULL
          AND bls_private.catalog_gtin_is_valid(cv.gtin)
          AND bls_private.catalog_normalize_gtin(cv.gtin)=normalized_gtin
        )
        OR EXISTS (
          SELECT 1
          FROM public.product_identifiers pi
          WHERE pi.canonical_variant_id=cv.id
            AND pi.active=true
            AND pi.identifier_scope='trade_item'
            AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
            AND bls_private.catalog_normalize_gtin(pi.normalized_value)=normalized_gtin
        )
      );

    IF exact_count=1 THEN
      SELECT cv.id,
             bls_private.catalog_material_variant_conflict(source_attributes,cv.variant_attributes)
      INTO exact_variant,conflict_reason
      FROM public.canonical_variants cv
      WHERE cv.market_id=NEW.market_id
        AND cv.suppressed=false
        AND cv.recalled=false
        AND (
          (
            cv.gtin IS NOT NULL
            AND bls_private.catalog_gtin_is_valid(cv.gtin)
            AND bls_private.catalog_normalize_gtin(cv.gtin)=normalized_gtin
          )
          OR EXISTS (
            SELECT 1
            FROM public.product_identifiers pi
            WHERE pi.canonical_variant_id=cv.id
              AND pi.active=true
              AND pi.identifier_scope='trade_item'
              AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
              AND bls_private.catalog_normalize_gtin(pi.normalized_value)=normalized_gtin
          )
        )
      LIMIT 1;

      INSERT INTO public.product_merge_candidates(
        id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,
        confidence,match_level,reasons,status,submission_id,created_at
      ) VALUES(
        gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,
        NEW.source_identity||jsonb_build_object('matching_engine','catalog_identity_v2','normalized_gtin',normalized_gtin),
        exact_variant,1.0000,'exact',
        CASE WHEN conflict_reason IS NULL
          THEN jsonb_build_array('exact_valid_gtin','material_variant_compatible','canonical_activation_unchanged')
          ELSE jsonb_build_array('exact_valid_gtin','material_variant_conflict',conflict_reason,'canonical_activation_unchanged')
        END,
        CASE WHEN conflict_reason IS NULL THEN 'auto_linked' ELSE 'pending' END,
        NEW.id,now()
      )
      ON CONFLICT (submission_id,candidate_variant_id)
        WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
      DO UPDATE SET
        confidence=EXCLUDED.confidence,
        match_level=EXCLUDED.match_level,
        reasons=EXCLUDED.reasons,
        status=EXCLUDED.status;

      IF conflict_reason IS NULL THEN
        UPDATE public.vendor_product_submissions
        SET canonical_variant_id=exact_variant,status='linked',updated_at=now()
        WHERE id=NEW.id;

        INSERT INTO public.catalog_workflow_events(
          id,public_id,submission_id,canonical_variant_id,actor_id,action,
          from_status,to_status,metadata,created_at
        ) VALUES(
          gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,exact_variant,NEW.created_by,
          'auto_match','submitted','linked',
          jsonb_build_object(
            'matching_engine','catalog_identity_v2','match_level','exact','confidence',1.0,
            'reason','exact_valid_gtin','gtin',normalized_gtin,'canonical_activation_changed',false
          ),now()
        );
      ELSE
        UPDATE public.vendor_product_submissions
        SET status='needs_review',updated_at=now()
        WHERE id=NEW.id;

        INSERT INTO public.catalog_workflow_events(
          id,public_id,submission_id,canonical_variant_id,actor_id,action,
          from_status,to_status,metadata,created_at
        ) VALUES(
          gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,exact_variant,NEW.created_by,
          'identity_conflict','submitted','needs_review',
          jsonb_build_object(
            'matching_engine','catalog_identity_v2','reason','material_variant_conflict',
            'detail',conflict_reason,'gtin',normalized_gtin,'canonical_activation_changed',false
          ),now()
        );
      END IF;
      RETURN NEW;
    END IF;

    IF exact_count>1 THEN
      FOR candidate IN
        SELECT DISTINCT cv.id AS variant_id
        FROM public.canonical_variants cv
        WHERE cv.market_id=NEW.market_id
          AND cv.suppressed=false
          AND cv.recalled=false
          AND (
            (
              cv.gtin IS NOT NULL
              AND bls_private.catalog_gtin_is_valid(cv.gtin)
              AND bls_private.catalog_normalize_gtin(cv.gtin)=normalized_gtin
            )
            OR EXISTS (
              SELECT 1
              FROM public.product_identifiers pi
              WHERE pi.canonical_variant_id=cv.id
                AND pi.active=true
                AND pi.identifier_scope='trade_item'
                AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
                AND bls_private.catalog_normalize_gtin(pi.normalized_value)=normalized_gtin
            )
          )
        ORDER BY cv.id
        LIMIT 8
      LOOP
        INSERT INTO public.product_merge_candidates(
          id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,
          confidence,match_level,reasons,status,submission_id,created_at
        ) VALUES(
          gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,
          NEW.source_identity||jsonb_build_object('matching_engine','catalog_identity_v2','normalized_gtin',normalized_gtin),
          candidate.variant_id,1.0000,'exact',
          jsonb_build_array('exact_valid_gtin','canonical_identity_ambiguous','canonical_activation_unchanged'),
          'pending',NEW.id,now()
        )
        ON CONFLICT (submission_id,candidate_variant_id)
          WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
        DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='pending';
      END LOOP;

      UPDATE public.vendor_product_submissions SET status='needs_review',updated_at=now() WHERE id=NEW.id;
      INSERT INTO public.catalog_workflow_events(
        id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at
      ) VALUES(
        gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,NEW.created_by,
        'identity_ambiguous','submitted','needs_review',
        jsonb_build_object('matching_engine','catalog_identity_v2','identifier','gtin','value',normalized_gtin,'candidate_count',exact_count),now()
      );
      RETURN NEW;
    END IF;

    -- A valid, previously unseen GTIN is strong evidence for a new canonical identity.
    -- Never fall through to a weaker model/title match that has another trade-item ID.
    RETURN NEW;
  END IF;

  -- Brand + MPN/model is strong only when the material-variant evidence is compatible.
  IF raw_brand IS NOT NULL AND raw_part IS NOT NULL THEN
    SELECT
      count(*) FILTER (
        WHERE bls_private.catalog_material_variant_conflict(source_attributes,cv.variant_attributes) IS NULL
      )::integer,
      count(*) FILTER (
        WHERE bls_private.catalog_material_variant_conflict(source_attributes,cv.variant_attributes) IS NOT NULL
      )::integer
    INTO compatible_count,conflicting_count
    FROM public.canonical_variants cv
    JOIN public.brands b ON b.id=cv.brand_id
    WHERE cv.market_id=NEW.market_id
      AND cv.category_id=NEW.category_id
      AND cv.suppressed=false
      AND cv.recalled=false
      AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(raw_brand)
      AND (
        bls_private.catalog_normalize_text(cv.mpn)=bls_private.catalog_normalize_text(raw_part)
        OR bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(raw_part)
        OR EXISTS (
          SELECT 1
          FROM public.product_identifiers pi
          WHERE pi.canonical_variant_id=cv.id
            AND pi.active=true
            AND pi.identifier_type IN ('mpn','manufacturer_code')
            AND bls_private.catalog_normalize_text(pi.normalized_value)=bls_private.catalog_normalize_text(raw_part)
        )
      );

    IF compatible_count=1 THEN
      SELECT cv.id INTO exact_variant
      FROM public.canonical_variants cv
      JOIN public.brands b ON b.id=cv.brand_id
      WHERE cv.market_id=NEW.market_id
        AND cv.category_id=NEW.category_id
        AND cv.suppressed=false
        AND cv.recalled=false
        AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(raw_brand)
        AND (
          bls_private.catalog_normalize_text(cv.mpn)=bls_private.catalog_normalize_text(raw_part)
          OR bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(raw_part)
          OR EXISTS (
            SELECT 1
            FROM public.product_identifiers pi
            WHERE pi.canonical_variant_id=cv.id
              AND pi.active=true
              AND pi.identifier_type IN ('mpn','manufacturer_code')
              AND bls_private.catalog_normalize_text(pi.normalized_value)=bls_private.catalog_normalize_text(raw_part)
          )
        )
        AND bls_private.catalog_material_variant_conflict(source_attributes,cv.variant_attributes) IS NULL
      ORDER BY cv.created_at,cv.id
      LIMIT 1;

      INSERT INTO public.product_merge_candidates(
        id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,
        confidence,match_level,reasons,status,submission_id,created_at
      ) VALUES(
        gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,
        NEW.source_identity||jsonb_build_object('matching_engine','catalog_identity_v2'),
        exact_variant,0.9850,'high_confidence',
        jsonb_build_array('exact_brand_part','material_variant_compatible','canonical_activation_unchanged'),
        'auto_linked',NEW.id,now()
      )
      ON CONFLICT (submission_id,candidate_variant_id)
        WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
      DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='auto_linked';

      UPDATE public.vendor_product_submissions
      SET canonical_variant_id=exact_variant,status='linked',updated_at=now()
      WHERE id=NEW.id;

      INSERT INTO public.catalog_workflow_events(
        id,public_id,submission_id,canonical_variant_id,actor_id,action,
        from_status,to_status,metadata,created_at
      ) VALUES(
        gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,exact_variant,NEW.created_by,
        'auto_match','submitted','linked',
        jsonb_build_object(
          'matching_engine','catalog_identity_v2','match_level','high_confidence','confidence',0.985,
          'reason','exact_brand_part','canonical_activation_changed',false
        ),now()
      );
      RETURN NEW;
    END IF;

    IF compatible_count>1 OR (compatible_count=0 AND conflicting_count>0) THEN
      FOR candidate IN
        SELECT cv.id AS variant_id,
               bls_private.catalog_material_variant_conflict(source_attributes,cv.variant_attributes) AS conflict_reason
        FROM public.canonical_variants cv
        JOIN public.brands b ON b.id=cv.brand_id
        WHERE cv.market_id=NEW.market_id
          AND cv.category_id=NEW.category_id
          AND cv.suppressed=false
          AND cv.recalled=false
          AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(raw_brand)
          AND (
            bls_private.catalog_normalize_text(cv.mpn)=bls_private.catalog_normalize_text(raw_part)
            OR bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(raw_part)
            OR EXISTS (
              SELECT 1
              FROM public.product_identifiers pi
              WHERE pi.canonical_variant_id=cv.id
                AND pi.active=true
                AND pi.identifier_type IN ('mpn','manufacturer_code')
                AND bls_private.catalog_normalize_text(pi.normalized_value)=bls_private.catalog_normalize_text(raw_part)
            )
          )
        ORDER BY cv.created_at,cv.id
        LIMIT 8
      LOOP
        INSERT INTO public.product_merge_candidates(
          id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,
          confidence,match_level,reasons,status,submission_id,created_at
        ) VALUES(
          gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,
          NEW.source_identity||jsonb_build_object('matching_engine','catalog_identity_v2'),
          candidate.variant_id,0.9850,'high_confidence',
          CASE WHEN candidate.conflict_reason IS NULL
            THEN jsonb_build_array('exact_brand_part','canonical_identity_ambiguous','canonical_activation_unchanged')
            ELSE jsonb_build_array('exact_brand_part','material_variant_conflict',candidate.conflict_reason,'canonical_activation_unchanged')
          END,
          'pending',NEW.id,now()
        )
        ON CONFLICT (submission_id,candidate_variant_id)
          WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
        DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='pending';
      END LOOP;

      UPDATE public.vendor_product_submissions SET status='needs_review',updated_at=now() WHERE id=NEW.id;
      INSERT INTO public.catalog_workflow_events(
        id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at
      ) VALUES(
        gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,NEW.created_by,
        CASE WHEN compatible_count>1 THEN 'identity_ambiguous' ELSE 'identity_conflict' END,
        'submitted','needs_review',
        jsonb_build_object(
          'matching_engine','catalog_identity_v2',
          'reason',CASE WHEN compatible_count>1 THEN 'canonical_identity_ambiguous' ELSE 'material_variant_conflict' END,
          'compatible_candidate_count',compatible_count,'conflicting_candidate_count',conflicting_count,
          'canonical_activation_changed',false
        ),now()
      );
      RETURN NEW;
    END IF;
  END IF;

  -- Weaker model/title candidates remain review-only and never activate canonicals.
  FOR candidate IN
    SELECT cv.id AS variant_id,cv.model,b.name AS brand_name,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title
    FROM public.canonical_variants cv
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE cv.market_id=NEW.market_id
      AND cv.category_id=NEW.category_id
      AND cv.suppressed=false
      AND cv.recalled=false
      AND bls_private.catalog_material_variant_conflict(source_attributes,cv.variant_attributes) IS NULL
      AND (
        (raw_model IS NOT NULL AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(raw_model))
        OR (raw_title IS NOT NULL AND bls_private.catalog_normalize_text(COALESCE(el.title,en.title,cv.model,cv.slug))=bls_private.catalog_normalize_text(raw_title))
      )
    ORDER BY cv.created_at,cv.id
    LIMIT 8
  LOOP
    reasons:='[]'::jsonb;
    candidate_confidence:=0.70;
    candidate_level:='possible';
    IF raw_model IS NOT NULL AND bls_private.catalog_normalize_text(candidate.model)=bls_private.catalog_normalize_text(raw_model) THEN
      candidate_confidence:=0.82;
      reasons:=reasons||jsonb_build_array('exact_normalized_model');
    END IF;
    IF raw_title IS NOT NULL AND bls_private.catalog_normalize_text(candidate.title)=bls_private.catalog_normalize_text(raw_title) THEN
      candidate_confidence:=greatest(candidate_confidence,0.80);
      reasons:=reasons||jsonb_build_array('exact_normalized_title');
    END IF;
    IF raw_brand IS NOT NULL AND candidate.brand_name IS NOT NULL
       AND bls_private.catalog_normalize_text(candidate.brand_name)=bls_private.catalog_normalize_text(raw_brand) THEN
      candidate_confidence:=candidate_confidence+0.08;
      reasons:=reasons||jsonb_build_array('exact_normalized_brand');
    END IF;
    IF candidate_confidence>=0.90 THEN candidate_level:='high_confidence'; END IF;
    reasons:=reasons||jsonb_build_array('material_variant_compatible','canonical_activation_unchanged');

    INSERT INTO public.product_merge_candidates(
      id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,
      confidence,match_level,reasons,status,submission_id,created_at
    ) VALUES(
      gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,
      NEW.source_identity||jsonb_build_object('matching_engine','catalog_identity_v2'),
      candidate.variant_id,candidate_confidence,candidate_level,reasons,'pending',NEW.id,now()
    )
    ON CONFLICT (submission_id,candidate_variant_id)
      WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
    DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='pending';
    candidate_count:=candidate_count+1;
  END LOOP;

  IF candidate_count>0 THEN
    UPDATE public.vendor_product_submissions SET status='needs_review',updated_at=now() WHERE id=NEW.id;
    INSERT INTO public.catalog_workflow_events(
      id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at
    ) VALUES(
      gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,NEW.created_by,
      'match_candidates','submitted','needs_review',
      jsonb_build_object(
        'matching_engine','catalog_identity_v2','candidate_count',candidate_count,
        'canonical_activation_changed',false
      ),now()
    );
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION bls_private.match_submitted_vendor_product()
  TO bls_app_runtime,bls_platform_runtime;

COMMENT ON FUNCTION bls_private.match_submitted_vendor_product() IS
  'Vendor submission identity-v2 matcher. Valid GTIN and compatible brand+MPN/model may link to existing active or inactive canonical identities; invalid, ambiguous, or material-variant-conflicting evidence routes to review. It never activates canonicals or creates offers.';

COMMIT;
