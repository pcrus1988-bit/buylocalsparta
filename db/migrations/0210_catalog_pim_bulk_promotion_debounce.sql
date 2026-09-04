BEGIN;

-- Large catalogue promotions can create tens of thousands of source-product and
-- attribute rows. The catalogue-intelligence debounce triggers previously
-- upserted the same refresh-queue row once per inserted observation, which made
-- otherwise-valid 10k+ product promotions hit the statement timeout.
--
-- During the governed bulk promotion path we now suppress those per-row queue
-- writes and enqueue one refresh after the complete immutable snapshot is built.

ALTER FUNCTION bls_private.promote_catalog_web_crawl_job_v1(uuid)
  RENAME TO promote_catalog_web_crawl_job_legacy_v1;

REVOKE ALL ON FUNCTION bls_private.promote_catalog_web_crawl_job_legacy_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.promote_catalog_web_crawl_job_legacy_v1(uuid) TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.enqueue_catalog_intelligence_from_source_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $$
BEGIN
  IF current_setting('bls.catalog_bulk_promotion', true) = 'on' THEN
    RETURN NEW;
  END IF;
  PERFORM bls_private.enqueue_catalog_intelligence_refresh(NEW.source_id, NEW.snapshot_id, 90);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.enqueue_catalog_intelligence_from_attribute_observation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $$
DECLARE
  v_source_id uuid;
  v_snapshot_id uuid;
BEGIN
  IF current_setting('bls.catalog_bulk_promotion', true) = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT sp.source_id, sp.snapshot_id
  INTO v_source_id, v_snapshot_id
  FROM public.catalog_source_products sp
  WHERE sp.id = NEW.source_product_id;
  IF v_source_id IS NOT NULL AND v_snapshot_id IS NOT NULL THEN
    PERFORM bls_private.enqueue_catalog_intelligence_refresh(v_source_id, v_snapshot_id, 90);
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION bls_private.promote_catalog_web_crawl_job_v1(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'bls_private'
AS $$
DECLARE
  v_result jsonb;
  v_source_id uuid;
  v_snapshot_id uuid;
BEGIN
  PERFORM set_config('bls.catalog_bulk_promotion', 'on', true);
  v_result := bls_private.promote_catalog_web_crawl_job_legacy_v1(p_job_id);
  PERFORM set_config('bls.catalog_bulk_promotion', 'off', true);

  v_source_id := NULLIF(v_result->>'sourceId', '')::uuid;
  v_snapshot_id := NULLIF(v_result->>'snapshotId', '')::uuid;
  IF v_source_id IS NOT NULL AND v_snapshot_id IS NOT NULL THEN
    PERFORM bls_private.enqueue_catalog_intelligence_refresh(v_source_id, v_snapshot_id, 90);
  END IF;

  RETURN v_result || jsonb_build_object(
    'bulkPromotionDebounced', true,
    'intelligenceRefreshEnqueued', v_source_id IS NOT NULL AND v_snapshot_id IS NOT NULL
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('bls.catalog_bulk_promotion', 'off', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.promote_catalog_web_crawl_job_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.promote_catalog_web_crawl_job_v1(uuid) TO bls_platform_runtime;

COMMIT;
