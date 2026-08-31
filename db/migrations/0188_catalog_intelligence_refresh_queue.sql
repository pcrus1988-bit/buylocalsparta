-- Buy Local Sparta — autonomous catalogue intelligence refresh queue.
-- Import evidence schedules a debounced refresh. Repeated writes move the same
-- snapshot forward instead of classifying partial supplier or Icecat payloads.

BEGIN;

CREATE TABLE public.catalog_intelligence_refresh_queue (
  snapshot_id uuid PRIMARY KEY REFERENCES public.catalog_source_snapshots(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  not_before timestamptz NOT NULL DEFAULT (now() + interval '90 seconds'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (lease_owner IS NULL AND lease_until IS NULL)
    OR
    (lease_owner IS NOT NULL AND lease_until IS NOT NULL)
  )
);

CREATE INDEX catalog_intelligence_refresh_queue_ready_idx
  ON public.catalog_intelligence_refresh_queue(not_before,updated_at,snapshot_id);

COMMENT ON TABLE public.catalog_intelligence_refresh_queue IS
  'Debounced, lease-safe queue that runs catalogue intelligence only after source evidence for a snapshot has gone quiet. One row per snapshot makes repeated supplier and Icecat writes converge idempotently.';

ALTER TABLE public.catalog_intelligence_refresh_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON public.catalog_intelligence_refresh_queue
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_intelligence_refresh_queue FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.catalog_intelligence_refresh_queue TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.enqueue_catalog_intelligence_refresh(
  p_source_id uuid,
  p_snapshot_id uuid,
  p_delay_seconds integer DEFAULT 90
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF p_source_id IS NULL OR p_snapshot_id IS NULL THEN
    RETURN;
  END IF;

  IF p_delay_seconds IS NULL OR p_delay_seconds < 0 OR p_delay_seconds > 3600 THEN
    RAISE EXCEPTION 'Catalogue intelligence debounce must be between 0 and 3600 seconds';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_snapshots s
    WHERE s.id=p_snapshot_id
      AND s.source_id=p_source_id
  ) THEN
    RAISE EXCEPTION 'Catalogue snapshot % does not belong to source %',p_snapshot_id,p_source_id;
  END IF;

  INSERT INTO public.catalog_intelligence_refresh_queue(
    snapshot_id,source_id,not_before,attempt_count,last_error,created_at,updated_at
  )
  VALUES (
    p_snapshot_id,p_source_id,
    now()+make_interval(secs=>p_delay_seconds),
    0,NULL,now(),now()
  )
  ON CONFLICT (snapshot_id) DO UPDATE
  SET source_id=EXCLUDED.source_id,
      not_before=GREATEST(
        public.catalog_intelligence_refresh_queue.not_before,
        EXCLUDED.not_before
      ),
      last_error=NULL,
      updated_at=now();
END
$$;

REVOKE ALL ON FUNCTION bls_private.enqueue_catalog_intelligence_refresh(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.enqueue_catalog_intelligence_refresh(uuid,uuid,integer) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.enqueue_catalog_intelligence_refresh(uuid,uuid,integer) IS
  'Schedules one debounced intelligence refresh per source snapshot. Repeated evidence writes extend not_before and never discard an active lease.';

CREATE OR REPLACE FUNCTION bls_private.enqueue_catalog_intelligence_from_source_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  PERFORM bls_private.enqueue_catalog_intelligence_refresh(NEW.source_id,NEW.snapshot_id,90);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.enqueue_catalog_intelligence_from_attribute_observation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  v_source_id uuid;
  v_snapshot_id uuid;
BEGIN
  SELECT sp.source_id,sp.snapshot_id
    INTO v_source_id,v_snapshot_id
  FROM public.catalog_source_products sp
  WHERE sp.id=NEW.source_product_id;

  IF v_source_id IS NOT NULL AND v_snapshot_id IS NOT NULL THEN
    PERFORM bls_private.enqueue_catalog_intelligence_refresh(v_source_id,v_snapshot_id,90);
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION bls_private.enqueue_catalog_intelligence_from_source_product() FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.enqueue_catalog_intelligence_from_attribute_observation() FROM PUBLIC;

CREATE TRIGGER catalog_source_products_schedule_intelligence
AFTER INSERT OR UPDATE OF snapshot_id,source_taxonomy_node_id,source_identity,normalized_payload
ON public.catalog_source_products
FOR EACH ROW
EXECUTE FUNCTION bls_private.enqueue_catalog_intelligence_from_source_product();

CREATE TRIGGER catalog_source_attribute_observations_schedule_intelligence
AFTER INSERT OR UPDATE OF source_attribute_key,source_unit,raw_value,normalized_value
ON public.catalog_source_attribute_observations
FOR EACH ROW
EXECUTE FUNCTION bls_private.enqueue_catalog_intelligence_from_attribute_observation();

-- Seed the queue for existing unresolved catalogue evidence so the first worker
-- deployment immediately picks up sources such as Poshmarket without requiring
-- a new import to occur.
WITH unresolved_snapshots AS (
  SELECT DISTINCT s.source_id,s.id AS snapshot_id,s.observed_at,s.created_at
  FROM public.catalog_source_snapshots s
  JOIN public.catalog_sources src
    ON src.id=s.source_id
   AND src.active=true
  WHERE EXISTS (
    SELECT 1
    FROM public.catalog_source_products sp
    WHERE sp.snapshot_id=s.id
      AND sp.source_id=s.source_id
      AND sp.classification_status='raw'
  )
  OR EXISTS (
    SELECT 1
    FROM public.catalog_source_attribute_observations a
    JOIN public.catalog_source_products sp ON sp.id=a.source_product_id
    WHERE sp.snapshot_id=s.id
      AND sp.source_id=s.source_id
      AND a.mapping_status='unmapped'
  )
),
latest_per_source AS (
  SELECT DISTINCT ON (source_id)
    source_id,snapshot_id
  FROM unresolved_snapshots
  ORDER BY source_id,COALESCE(observed_at,created_at) DESC,created_at DESC,snapshot_id DESC
)
INSERT INTO public.catalog_intelligence_refresh_queue(
  snapshot_id,source_id,not_before,attempt_count,created_at,updated_at
)
SELECT snapshot_id,source_id,now(),0,now(),now()
FROM latest_per_source
ON CONFLICT (snapshot_id) DO UPDATE
SET not_before=LEAST(public.catalog_intelligence_refresh_queue.not_before,now()),
    updated_at=now();

COMMIT;
