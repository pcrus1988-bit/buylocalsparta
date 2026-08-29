CREATE TABLE IF NOT EXISTS public.vendor_visibility_daily (
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  gsc_impressions bigint NOT NULL DEFAULT 0 CHECK (gsc_impressions >= 0),
  gsc_clicks bigint NOT NULL DEFAULT 0 CHECK (gsc_clicks >= 0),
  gsc_ctr numeric(12,8) NOT NULL DEFAULT 0 CHECK (gsc_ctr >= 0 AND gsc_ctr <= 1),
  gsc_avg_position numeric(12,4) NOT NULL DEFAULT 0 CHECK (gsc_avg_position >= 0),
  ga4_page_views bigint NOT NULL DEFAULT 0 CHECK (ga4_page_views >= 0),
  ga4_active_users bigint NOT NULL DEFAULT 0 CHECK (ga4_active_users >= 0),
  claim_clicks bigint NOT NULL DEFAULT 0 CHECK (claim_clicks >= 0),
  phone_clicks bigint NOT NULL DEFAULT 0 CHECK (phone_clicks >= 0),
  website_clicks bigint NOT NULL DEFAULT 0 CHECK (website_clicks >= 0),
  directions_clicks bigint NOT NULL DEFAULT 0 CHECK (directions_clicks >= 0),
  gsc_synced_at timestamptz,
  ga4_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, metric_date)
);

CREATE INDEX IF NOT EXISTS vendor_visibility_daily_date_idx ON public.vendor_visibility_daily(metric_date DESC);
CREATE INDEX IF NOT EXISTS vendor_visibility_daily_gsc_idx ON public.vendor_visibility_daily(metric_date DESC, gsc_impressions DESC);

ALTER TABLE public.vendor_visibility_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendor_visibility_daily FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_vendor_visibility_daily()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_vendor_visibility_daily() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vendor_visibility_daily_touch ON public.vendor_visibility_daily;
CREATE TRIGGER vendor_visibility_daily_touch
BEFORE UPDATE ON public.vendor_visibility_daily
FOR EACH ROW EXECUTE FUNCTION public.touch_vendor_visibility_daily();
