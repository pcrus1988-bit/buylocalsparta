-- KONTA MOU — operational registry for the validated 131-hub Greece expansion master.
--
-- Immutable hub geography, slugs and SEO paths remain version-controlled in the
-- expansion master. This table owns mutable runtime lifecycle/research state and
-- is joined to that master by the stable KM-HUB-xxx identifier. Keeping these
-- responsibilities separate prevents database/code geometry drift while allowing
-- hub activation to become data-driven.

BEGIN;

CREATE TABLE public.expansion_hubs (
  hub_id text PRIMARY KEY,
  lifecycle_state text NOT NULL DEFAULT 'inactive',
  prospect_count integer NOT NULL DEFAULT 0,
  research_status text,
  master_revision date NOT NULL DEFAULT DATE '2026-09-08',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_live boolean GENERATED ALWAYS AS (lifecycle_state = 'active') STORED,
  is_sparta_legacy boolean GENERATED ALWAYS AS (hub_id = 'KM-HUB-015') STORED,
  CONSTRAINT expansion_hubs_id_check
    CHECK (hub_id ~ '^KM-HUB-[0-9]{3}$'),
  CONSTRAINT expansion_hubs_lifecycle_state_check
    CHECK (lifecycle_state IN ('inactive','prospect','active')),
  CONSTRAINT expansion_hubs_prospect_count_check
    CHECK (prospect_count >= 0),
  CONSTRAINT expansion_hubs_research_status_check
    CHECK (research_status IS NULL OR research_status IN ('IN_PROGRESS','ACTIVE_REFERENCE')),
  CONSTRAINT expansion_hubs_state_consistency_check
    CHECK (
      (lifecycle_state = 'inactive' AND prospect_count = 0 AND research_status IS NULL)
      OR
      (lifecycle_state = 'prospect' AND prospect_count > 0 AND research_status = 'IN_PROGRESS')
      OR
      (lifecycle_state = 'active' AND research_status = 'ACTIVE_REFERENCE')
    )
);

CREATE INDEX expansion_hubs_lifecycle_state_idx
  ON public.expansion_hubs(lifecycle_state, hub_id);

COMMENT ON TABLE public.expansion_hubs IS
  'Runtime lifecycle registry for the canonical KONTA MOY 131-hub expansion master. Stable hub_id joins to the version-controlled geographic/SEO master; mutable activation and research state live here.';
COMMENT ON COLUMN public.expansion_hubs.master_revision IS
  'Expansion-master snapshot revision to which this operational registry was initially aligned.';
COMMENT ON COLUMN public.expansion_hubs.is_live IS
  'Generated activation flag. Only lifecycle_state=active is customer-enterable.';
COMMENT ON COLUMN public.expansion_hubs.is_sparta_legacy IS
  'Generated legacy safeguard: KM-HUB-015 is the existing Sparta production market.';

-- Materialise every canonical hub identity before applying mutable research state.
-- The master owns the id-to-place mapping; this registry intentionally cannot
-- invent an out-of-band place or silently omit a numbered hub.
INSERT INTO public.expansion_hubs (hub_id)
SELECT 'KM-HUB-' || lpad(series::text, 3, '0')
FROM generate_series(1, 131) AS series;

-- Current verified research snapshot, aligned with
-- KONTA_MOU_131_HUB_LIVE_VENDOR_RESEARCH / Hub_Research_Coverage (2026-09-08).
UPDATE public.expansion_hubs AS hub
SET lifecycle_state = snapshot.lifecycle_state,
    prospect_count = snapshot.prospect_count,
    research_status = snapshot.research_status,
    updated_at = now()
FROM (VALUES
  ('KM-HUB-001', 'prospect', 301, 'IN_PROGRESS'),
  ('KM-HUB-002', 'prospect', 24, 'IN_PROGRESS'),
  ('KM-HUB-004', 'prospect', 11, 'IN_PROGRESS'),
  ('KM-HUB-006', 'prospect', 3, 'IN_PROGRESS'),
  ('KM-HUB-008', 'prospect', 297, 'IN_PROGRESS'),
  ('KM-HUB-010', 'prospect', 34, 'IN_PROGRESS'),
  ('KM-HUB-012', 'prospect', 44, 'IN_PROGRESS'),
  ('KM-HUB-015', 'active', 0, 'ACTIVE_REFERENCE'),
  ('KM-HUB-019', 'prospect', 17, 'IN_PROGRESS'),
  ('KM-HUB-022', 'prospect', 17, 'IN_PROGRESS'),
  ('KM-HUB-025', 'prospect', 2, 'IN_PROGRESS'),
  ('KM-HUB-027', 'prospect', 4, 'IN_PROGRESS'),
  ('KM-HUB-029', 'prospect', 13, 'IN_PROGRESS'),
  ('KM-HUB-041', 'prospect', 7, 'IN_PROGRESS'),
  ('KM-HUB-042', 'prospect', 3, 'IN_PROGRESS'),
  ('KM-HUB-051', 'prospect', 11, 'IN_PROGRESS'),
  ('KM-HUB-089', 'prospect', 1, 'IN_PROGRESS'),
  ('KM-HUB-115', 'prospect', 3, 'IN_PROGRESS')
) AS snapshot(hub_id, lifecycle_state, prospect_count, research_status)
WHERE hub.hub_id = snapshot.hub_id;

-- Hard migration guardrails: a corrupted/incomplete seed must not commit.
DO $$
DECLARE
  v_count integer;
  v_live_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.expansion_hubs;
  IF v_count <> 131 THEN
    RAISE EXCEPTION 'Expansion hub registry must contain exactly 131 rows; found %', v_count;
  END IF;

  SELECT count(*) INTO v_live_count FROM public.expansion_hubs WHERE is_live;
  IF v_live_count <> 1 THEN
    RAISE EXCEPTION 'Expansion hub registry must have exactly one live hub during foundation rollout; found %', v_live_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.expansion_hubs
    WHERE hub_id = 'KM-HUB-015'
      AND is_sparta_legacy
      AND is_live
      AND lifecycle_state = 'active'
      AND research_status = 'ACTIVE_REFERENCE'
  ) THEN
    RAISE EXCEPTION 'Sparta KM-HUB-015 must remain the active legacy reference hub';
  END IF;
END;
$$;

ALTER TABLE public.expansion_hubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY expansion_hubs_platform_all
  ON public.expansion_hubs
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
