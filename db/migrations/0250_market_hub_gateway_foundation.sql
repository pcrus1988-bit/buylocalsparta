-- KONTA MOY expansion foundation — bind the existing Sparta market to the 131-HUB gateway registry.
-- Additive only: this migration does not rename markets.code='sparta', change live-delivery
-- eligibility, alter catalog scope, or enforce /choose-location redirects.

BEGIN;

CREATE TABLE public.market_hub_config (
  market_id uuid PRIMARY KEY REFERENCES public.markets(id) ON DELETE RESTRICT,
  hub_code text NOT NULL UNIQUE,
  gateway_slug text NOT NULL UNIQUE,
  expansion_radius_meters integer NOT NULL DEFAULT 25000
    CHECK (expansion_radius_meters > 0),
  is_operational boolean NOT NULL DEFAULT false,
  prospecting_enabled boolean NOT NULL DEFAULT false,
  gateway_visible boolean NOT NULL DEFAULT false,
  shopping_enabled boolean NOT NULL DEFAULT false,
  search_indexable boolean NOT NULL DEFAULT false,
  is_default_fallback boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_hub_config_hub_code_check
    CHECK (hub_code ~ '^KM-HUB-[0-9]{3}$'),
  CONSTRAINT market_hub_config_gateway_slug_check
    CHECK (gateway_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT market_hub_config_shopping_requires_operational_check
    CHECK (NOT shopping_enabled OR is_operational),
  CONSTRAINT market_hub_config_indexing_requires_gateway_visibility_check
    CHECK (NOT search_indexable OR gateway_visible)
);

CREATE UNIQUE INDEX market_hub_config_single_default_fallback_idx
  ON public.market_hub_config ((1))
  WHERE is_default_fallback;

COMMENT ON TABLE public.market_hub_config IS
  'Expansion metadata layered 1:1 on markets. markets.id remains the authoritative operational boundary for vendors, offers, orders, fulfilment and reporting.';
COMMENT ON COLUMN public.market_hub_config.hub_code IS
  'Stable identifier from the 131-HUB expansion master (for example KM-HUB-015). It does not replace markets.code in existing routes or integrations.';
COMMENT ON COLUMN public.market_hub_config.gateway_slug IS
  'Canonical /choose-location and km_locality identifier (for example sparti). Resolves gateway selection to markets.id.';
COMMENT ON COLUMN public.market_hub_config.expansion_radius_meters IS
  'Planning/discovery coverage radius for HUB expansion. It does not alter checkout or live-delivery eligibility.';
COMMENT ON COLUMN public.market_hub_config.is_default_fallback IS
  'Compatibility fallback market when no explicit HUB is resolved internally. Gateway enforcement may still require /choose-location before shopping.';

INSERT INTO public.market_hub_config (
  market_id,
  hub_code,
  gateway_slug,
  expansion_radius_meters,
  is_operational,
  prospecting_enabled,
  gateway_visible,
  shopping_enabled,
  search_indexable,
  is_default_fallback,
  metadata
)
SELECT
  id,
  'KM-HUB-015',
  'sparti',
  25000,
  true,
  false,
  true,
  true,
  true,
  true,
  jsonb_build_object(
    'coverage_kind', 'expansion_planning',
    'live_delivery_unchanged', true,
    'compatibility_market_code', 'sparta',
    'gateway_path', '/choose-location',
    'gateway_cookie', 'km_locality'
  )
FROM public.markets
WHERE code = 'sparta'
ON CONFLICT (market_id) DO UPDATE
SET hub_code = EXCLUDED.hub_code,
    gateway_slug = EXCLUDED.gateway_slug,
    expansion_radius_meters = EXCLUDED.expansion_radius_meters,
    is_operational = EXCLUDED.is_operational,
    prospecting_enabled = EXCLUDED.prospecting_enabled,
    gateway_visible = EXCLUDED.gateway_visible,
    shopping_enabled = EXCLUDED.shopping_enabled,
    search_indexable = EXCLUDED.search_indexable,
    is_default_fallback = EXCLUDED.is_default_fallback,
    metadata = public.market_hub_config.metadata || EXCLUDED.metadata,
    updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.market_hub_config h
    JOIN public.markets m ON m.id = h.market_id
    WHERE m.code = 'sparta'
      AND h.hub_code = 'KM-HUB-015'
      AND h.gateway_slug = 'sparti'
      AND h.is_operational
      AND h.gateway_visible
      AND h.shopping_enabled
      AND h.is_default_fallback
  ) THEN
    RAISE EXCEPTION 'Sparta market must exist and be registered as KM-HUB-015 / sparti before expansion can proceed';
  END IF;
END
$$;

ALTER TABLE public.market_hub_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.market_hub_config FROM anon, authenticated;
GRANT SELECT ON TABLE public.market_hub_config TO bls_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.market_hub_config TO bls_platform_runtime;

CREATE POLICY market_hub_config_runtime_read
  ON public.market_hub_config
  FOR SELECT
  TO bls_app_runtime, bls_platform_runtime
  USING (true);

CREATE POLICY market_hub_config_platform_write
  ON public.market_hub_config
  FOR ALL
  TO bls_platform_runtime
  USING (true)
  WITH CHECK (true);

COMMIT;
