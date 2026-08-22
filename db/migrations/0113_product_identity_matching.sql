-- Buy Local Sparta product identity pipeline.
-- Strong identifiers auto-link only when exact and valid; weaker fingerprints remain reviewable.

CREATE OR REPLACE FUNCTION bls_private.catalog_normalize_text(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$ SELECT lower(regexp_replace(btrim(coalesce(p_value,'')), '[[:space:][:punct:]]+', '', 'g')) $$;

CREATE OR REPLACE FUNCTION bls_private.catalog_normalize_gtin(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$ SELECT regexp_replace(coalesce(p_value,''), '[^0-9]', '', 'g') $$;

CREATE OR REPLACE FUNCTION bls_private.catalog_gtin_is_valid(p_value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE cleaned text; compact text; i integer; weight integer:=3; checksum_sum integer:=0; expected_digit integer;
BEGIN
  compact:=regexp_replace(coalesce(p_value,''),'[[:space:]-]','','g');
  IF compact !~ '^[0-9]+$' THEN RETURN false; END IF;
  cleaned:=bls_private.catalog_normalize_gtin(p_value);
  IF length(cleaned) NOT IN (8,12,13,14) THEN RETURN false; END IF;
  i:=length(cleaned)-1;
  WHILE i>=1 LOOP
    checksum_sum:=checksum_sum+substring(cleaned FROM i FOR 1)::integer*weight;
    weight:=CASE WHEN weight=3 THEN 1 ELSE 3 END;
    i:=i-1;
  END LOOP;
  expected_digit:=(10-(checksum_sum%10))%10;
  RETURN expected_digit=right(cleaned,1)::integer;
END $$;

GRANT EXECUTE ON FUNCTION bls_private.catalog_normalize_text(text) TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_normalize_gtin(text) TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.catalog_gtin_is_valid(text) TO bls_app_runtime,bls_platform_runtime;

CREATE UNIQUE INDEX IF NOT EXISTS product_merge_candidates_submission_variant_uidx
ON public.product_merge_candidates(submission_id,candidate_variant_id)
WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION bls_private.match_submitted_vendor_product()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  raw_gtin text:=nullif(btrim(NEW.source_identity->>'gtin'),'');
  normalized_gtin text;
  raw_mpn text:=nullif(btrim(coalesce(NEW.source_identity->>'mpn',NEW.source_payload->>'mpn')),'');
  raw_model text:=nullif(btrim(NEW.source_identity->>'model'),'');
  raw_brand text:=nullif(btrim(NEW.source_identity->>'brand'),'');
  raw_title text:=nullif(btrim(NEW.source_identity->>'title'),'');
  exact_variant uuid;
  exact_count integer:=0;
  candidate_count integer:=0;
  candidate record;
  candidate_confidence numeric;
  candidate_level text;
  reasons jsonb;
BEGIN
  IF NEW.status<>'submitted' THEN RETURN NEW; END IF;

  IF raw_gtin IS NOT NULL THEN
    IF NOT bls_private.catalog_gtin_is_valid(raw_gtin) THEN
      UPDATE public.vendor_product_submissions SET status='needs_review',updated_at=now() WHERE id=NEW.id;
      INSERT INTO public.catalog_workflow_events(id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at)
      VALUES(gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,NEW.created_by,'identifier_validation','submitted','needs_review',jsonb_build_object('identifier','gtin','value',raw_gtin,'result','invalid_checksum_or_format'),now());
      RETURN NEW;
    END IF;

    normalized_gtin:=bls_private.catalog_normalize_gtin(raw_gtin);
    SELECT cv.id INTO exact_variant
    FROM public.canonical_variants cv
    WHERE cv.market_id=NEW.market_id AND cv.gtin=normalized_gtin
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
    LIMIT 1;

    IF exact_variant IS NOT NULL THEN
      INSERT INTO public.product_merge_candidates(id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,confidence,match_level,reasons,status,submission_id,created_at)
      VALUES(gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,NEW.source_identity||jsonb_build_object('matching_engine','catalog_v1','normalized_gtin',normalized_gtin),exact_variant,1.0000,'exact',jsonb_build_array('exact_valid_gtin'),'auto_linked',NEW.id,now())
      ON CONFLICT (submission_id,candidate_variant_id) WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
      DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='auto_linked';

      UPDATE public.vendor_product_submissions
      SET canonical_variant_id=exact_variant,status='linked',updated_at=now()
      WHERE id=NEW.id;

      INSERT INTO public.catalog_workflow_events(id,public_id,submission_id,canonical_variant_id,actor_id,action,from_status,to_status,metadata,created_at)
      VALUES(gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,exact_variant,NEW.created_by,'auto_match','submitted','linked',jsonb_build_object('match_level','exact','confidence',1.0,'reason','exact_valid_gtin','gtin',normalized_gtin),now());
      RETURN NEW;
    END IF;

    -- A valid GTIN that is new to the catalog is a strong signal for a new canonical.
    -- Do not fuzzy-match it to a different known identifier.
    RETURN NEW;
  END IF;

  IF raw_mpn IS NOT NULL AND raw_brand IS NOT NULL THEN
    SELECT count(*) INTO exact_count
    FROM public.canonical_variants cv JOIN public.brands b ON b.id=cv.brand_id
    WHERE cv.market_id=NEW.market_id AND cv.category_id=NEW.category_id
      AND bls_private.catalog_normalize_text(cv.mpn)=bls_private.catalog_normalize_text(raw_mpn)
      AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(raw_brand)
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false;

    IF exact_count=1 THEN
      SELECT cv.id INTO exact_variant
      FROM public.canonical_variants cv JOIN public.brands b ON b.id=cv.brand_id
      WHERE cv.market_id=NEW.market_id AND cv.category_id=NEW.category_id
        AND bls_private.catalog_normalize_text(cv.mpn)=bls_private.catalog_normalize_text(raw_mpn)
        AND bls_private.catalog_normalize_text(b.name)=bls_private.catalog_normalize_text(raw_brand)
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      LIMIT 1;

      INSERT INTO public.product_merge_candidates(id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,confidence,match_level,reasons,status,submission_id,created_at)
      VALUES(gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,NEW.source_identity||jsonb_build_object('matching_engine','catalog_v1'),exact_variant,0.9700,'high_confidence',jsonb_build_array('exact_mpn','exact_brand'),'pending',NEW.id,now())
      ON CONFLICT (submission_id,candidate_variant_id) WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
      DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='pending';
      candidate_count:=candidate_count+1;
    END IF;
  END IF;

  FOR candidate IN
    SELECT cv.id AS variant_id,cv.model,b.name AS brand_name,COALESCE(el.title,en.title,cv.model,cv.slug) AS title
    FROM public.canonical_variants cv
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE cv.market_id=NEW.market_id AND cv.category_id=NEW.category_id
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND ((raw_model IS NOT NULL AND bls_private.catalog_normalize_text(cv.model)=bls_private.catalog_normalize_text(raw_model))
        OR (raw_title IS NOT NULL AND bls_private.catalog_normalize_text(COALESCE(el.title,en.title,cv.model,cv.slug))=bls_private.catalog_normalize_text(raw_title)))
    ORDER BY cv.created_at LIMIT 8
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
    IF raw_brand IS NOT NULL AND candidate.brand_name IS NOT NULL AND bls_private.catalog_normalize_text(candidate.brand_name)=bls_private.catalog_normalize_text(raw_brand) THEN
      candidate_confidence:=candidate_confidence+0.08;
      reasons:=reasons||jsonb_build_array('exact_normalized_brand');
    END IF;
    IF candidate_confidence>=0.90 THEN candidate_level:='high_confidence'; END IF;

    INSERT INTO public.product_merge_candidates(id,public_id,market_id,source_vendor_id,source_payload,candidate_variant_id,confidence,match_level,reasons,status,submission_id,created_at)
    VALUES(gen_random_uuid(),'pmc_'||gen_random_uuid()::text,NEW.market_id,NEW.vendor_id,NEW.source_identity||jsonb_build_object('matching_engine','catalog_v1'),candidate.variant_id,candidate_confidence,candidate_level,reasons,'pending',NEW.id,now())
    ON CONFLICT (submission_id,candidate_variant_id) WHERE submission_id IS NOT NULL AND candidate_variant_id IS NOT NULL
    DO UPDATE SET confidence=EXCLUDED.confidence,match_level=EXCLUDED.match_level,reasons=EXCLUDED.reasons,status='pending';
    candidate_count:=candidate_count+1;
  END LOOP;

  IF candidate_count>0 THEN
    UPDATE public.vendor_product_submissions SET status='needs_review',updated_at=now() WHERE id=NEW.id;
    INSERT INTO public.catalog_workflow_events(id,public_id,submission_id,actor_id,action,from_status,to_status,metadata,created_at)
    VALUES(gen_random_uuid(),'cwe_'||gen_random_uuid()::text,NEW.id,NEW.created_by,'match_candidates','submitted','needs_review',jsonb_build_object('matching_engine','catalog_v1','candidate_count',candidate_count),now());
  END IF;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION bls_private.match_submitted_vendor_product() TO bls_app_runtime,bls_platform_runtime;
DROP TRIGGER IF EXISTS vendor_product_submission_match_trigger ON public.vendor_product_submissions;
CREATE TRIGGER vendor_product_submission_match_trigger
AFTER UPDATE OF status ON public.vendor_product_submissions
FOR EACH ROW WHEN (NEW.status='submitted' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION bls_private.match_submitted_vendor_product();

CREATE OR REPLACE FUNCTION bls_private.ensure_canonical_variant_family()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF NEW.family_id IS NULL THEN
    IF NEW.model IS NOT NULL OR NEW.brand_id IS NOT NULL THEN
      SELECT pf.id INTO NEW.family_id
      FROM public.product_families pf
      WHERE pf.market_id=NEW.market_id AND pf.category_id=NEW.category_id
        AND pf.brand_id IS NOT DISTINCT FROM NEW.brand_id
        AND bls_private.catalog_normalize_text(pf.model)=bls_private.catalog_normalize_text(NEW.model)
        AND pf.active=true
      ORDER BY pf.created_at LIMIT 1;
    END IF;
    IF NEW.family_id IS NULL THEN
      INSERT INTO public.product_families(id,public_id,market_id,brand_id,category_id,model,active,created_at,updated_at)
      VALUES(gen_random_uuid(),'pf_'||gen_random_uuid()::text,NEW.market_id,NEW.brand_id,NEW.category_id,NEW.model,true,now(),now())
      RETURNING id INTO NEW.family_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION bls_private.ensure_canonical_variant_family() TO bls_app_runtime,bls_platform_runtime;
DROP TRIGGER IF EXISTS canonical_variant_family_trigger ON public.canonical_variants;
CREATE TRIGGER canonical_variant_family_trigger BEFORE INSERT ON public.canonical_variants
FOR EACH ROW WHEN (NEW.family_id IS NULL)
EXECUTE FUNCTION bls_private.ensure_canonical_variant_family();

DO $$
DECLARE r record; new_family uuid;
BEGIN
  FOR r IN SELECT id,market_id,brand_id,category_id,model FROM public.canonical_variants WHERE family_id IS NULL LOOP
    INSERT INTO public.product_families(id,public_id,market_id,brand_id,category_id,model,active,created_at,updated_at)
    VALUES(gen_random_uuid(),'pf_'||gen_random_uuid()::text,r.market_id,r.brand_id,r.category_id,r.model,true,now(),now())
    RETURNING id INTO new_family;
    UPDATE public.canonical_variants SET family_id=new_family WHERE id=r.id;
  END LOOP;
END $$;
ALTER TABLE public.canonical_variants ALTER COLUMN family_id SET NOT NULL;

CREATE OR REPLACE FUNCTION bls_private.normalize_canonical_gtin()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF NEW.gtin IS NOT NULL AND btrim(NEW.gtin)<>'' THEN
    IF NOT bls_private.catalog_gtin_is_valid(NEW.gtin) THEN RAISE EXCEPTION 'Invalid GTIN checksum or format'; END IF;
    NEW.gtin:=bls_private.catalog_normalize_gtin(NEW.gtin);
  ELSE
    NEW.gtin:=NULL;
  END IF;
  RETURN NEW;
END $$;

GRANT EXECUTE ON FUNCTION bls_private.normalize_canonical_gtin() TO bls_app_runtime,bls_platform_runtime;
DROP TRIGGER IF EXISTS canonical_variant_gtin_normalize_trigger ON public.canonical_variants;
CREATE TRIGGER canonical_variant_gtin_normalize_trigger
BEFORE INSERT OR UPDATE OF gtin ON public.canonical_variants
FOR EACH ROW EXECUTE FUNCTION bls_private.normalize_canonical_gtin();

-- Public catalog adviser lookup uses vendor_id directly. Materialize and maintain it from vendor_user_id.
ALTER TABLE public.adviser_profiles
  ADD COLUMN IF NOT EXISTS vendor_id uuid NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS job_title text NULL;

UPDATE public.adviser_profiles ap SET vendor_id=vu.vendor_id
FROM public.vendor_users vu
WHERE vu.id=ap.vendor_user_id AND ap.vendor_id IS DISTINCT FROM vu.vendor_id;

CREATE INDEX IF NOT EXISTS adviser_profiles_vendor_active_idx ON public.adviser_profiles(vendor_id,active,created_at);

CREATE OR REPLACE FUNCTION bls_private.sync_adviser_profile_vendor()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE resolved_vendor uuid;
BEGIN
  SELECT vu.vendor_id INTO resolved_vendor FROM public.vendor_users vu WHERE vu.id=NEW.vendor_user_id;
  IF resolved_vendor IS NULL THEN RAISE EXCEPTION 'Adviser profile vendor user does not exist'; END IF;
  NEW.vendor_id:=resolved_vendor;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS adviser_profiles_sync_vendor ON public.adviser_profiles;
CREATE TRIGGER adviser_profiles_sync_vendor
BEFORE INSERT OR UPDATE OF vendor_user_id ON public.adviser_profiles
FOR EACH ROW EXECUTE FUNCTION bls_private.sync_adviser_profile_vendor();
GRANT EXECUTE ON FUNCTION bls_private.sync_adviser_profile_vendor() TO bls_app_runtime,bls_platform_runtime;