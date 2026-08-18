CREATE TABLE IF NOT EXISTS public.vendor_research_profiles (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('census','online_only')),
  primary_census_id integer,
  major_branch text,
  sub_branch text,
  marketplace_scope text,
  distance_km numeric(8,2),
  outreach_priority text,
  outreach_score integer,
  regulation_flag text,
  recommended_commerce_mode text,
  storefront_status text,
  gemi_research text,
  candidate_legal_name text,
  candidate_gemi text,
  candidate_vat text,
  verification_action text,
  directory_categories text,
  listing_source text,
  directory_profile text,
  checked_at date,
  online_shop_active text,
  online_shop_url text,
  primary_phone text,
  primary_email text,
  latest_issue_severity text,
  latest_issue_type text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_research_profiles_census_uidx
  ON public.vendor_research_profiles(primary_census_id)
  WHERE primary_census_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendor_research_profiles_priority_idx
  ON public.vendor_research_profiles(outreach_priority, outreach_score DESC);
CREATE INDEX IF NOT EXISTS vendor_research_profiles_branch_idx
  ON public.vendor_research_profiles(major_branch, sub_branch);
CREATE INDEX IF NOT EXISTS vendor_research_profiles_scope_idx
  ON public.vendor_research_profiles(marketplace_scope);

CREATE TABLE IF NOT EXISTS public.vendor_research_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('merchant_census','gemi_sample','active_online_shop','eshop_issue')),
  source_key text NOT NULL,
  title text NOT NULL,
  checked_at date,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, source_type, source_key)
);

CREATE INDEX IF NOT EXISTS vendor_research_source_records_type_idx
  ON public.vendor_research_source_records(market_id, source_type, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.vendor_research_source_links (
  source_id uuid NOT NULL REFERENCES public.vendor_research_source_records(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  link_role text NOT NULL DEFAULT 'evidence',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS vendor_research_source_links_vendor_idx
  ON public.vendor_research_source_links(vendor_id, source_id);

ALTER TABLE public.vendor_research_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_research_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_research_source_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_research_profiles;
CREATE POLICY bls_platform_runtime_all ON public.vendor_research_profiles
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_research_source_records;
CREATE POLICY bls_platform_runtime_all ON public.vendor_research_source_records
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_research_source_links;
CREATE POLICY bls_platform_runtime_all ON public.vendor_research_source_links
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.vendor_research_profiles FROM anon, authenticated;
REVOKE ALL ON public.vendor_research_source_records FROM anon, authenticated;
REVOKE ALL ON public.vendor_research_source_links FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_research_profiles TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_research_source_records TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_research_source_links TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.vendor_research_profiles IS
  'Admin acquisition-research profile distilled from the 2026 Sparta research workbook. Not merchant verification.';
COMMENT ON TABLE public.vendor_research_source_records IS
  'Immutable-in-origin research source rows imported from the Sparta research workbook; payload preserves every source column.';
COMMENT ON TABLE public.vendor_research_source_links IS
  'Many-to-many links between workbook research source rows and invited vendor identities.';
