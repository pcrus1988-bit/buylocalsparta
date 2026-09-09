BEGIN;

-- KONTA MOY Partner Network foundation.
-- The program is deliberately sales-derived: there is no recruitment commission event.
-- Commercial amounts are stored in cents and rates in basis points (10,000 = 100%).

CREATE TABLE IF NOT EXISTS public.partner_program_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  attribution_days INTEGER NOT NULL DEFAULT 180 CHECK (attribution_days BETWEEN 1 AND 730),
  max_levels SMALLINT NOT NULL DEFAULT 3 CHECK (max_levels BETWEEN 1 AND 3),
  subscription_residual_months INTEGER NOT NULL DEFAULT 24 CHECK (subscription_residual_months BETWEEN 1 AND 120),
  payout_hold_days INTEGER NOT NULL DEFAULT 14 CHECK (payout_hold_days BETWEEN 0 AND 120),
  recruitment_commission_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (recruitment_commission_enabled = FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.partner_program_config (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  partner_code TEXT NOT NULL UNIQUE CHECK (partner_code ~ '^[A-Z0-9][A-Z0-9_-]{3,31}$'),
  sponsor_partner_id UUID REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  home_market_id UUID REFERENCES public.markets(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
  rank TEXT NOT NULL DEFAULT 'PARTNER' CHECK (rank IN ('PARTNER','TEAM_PARTNER','AREA_PARTNER','HUB_PARTNER')),
  terms_version TEXT,
  terms_accepted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sponsor_partner_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS idx_partner_accounts_sponsor ON public.partner_accounts(sponsor_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_home_market ON public.partner_accounts(home_market_id);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_status_rank ON public.partner_accounts(status, rank);

CREATE TABLE IF NOT EXISTS public.partner_market_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  assignment_type TEXT NOT NULL DEFAULT 'SECONDARY' CHECK (assignment_type IN ('PRIMARY','SECONDARY','HUB')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_market_assignment_active
  ON public.partner_market_assignments(partner_id, market_id)
  WHERE active;
CREATE INDEX IF NOT EXISTS idx_partner_market_assignments_market
  ON public.partner_market_assignments(market_id, active);

CREATE TABLE IF NOT EXISTS public.partner_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  vendor_business_id UUID REFERENCES public.vendor_businesses(id) ON DELETE RESTRICT,
  external_subject_key TEXT,
  referral_code TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'REFERRAL_LINK',
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED','CONVERTED','EXPIRED','VOID')),
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  locked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  level_1_partner_id UUID REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  level_2_partner_id UUID REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  level_3_partner_id UUID REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (vendor_business_id IS NOT NULL OR external_subject_key IS NOT NULL),
  CHECK (expires_at > attributed_at),
  CHECK (level_1_partner_id IS NULL OR level_1_partner_id = partner_id),
  CHECK (level_2_partner_id IS NULL OR level_2_partner_id IS DISTINCT FROM level_1_partner_id),
  CHECK (level_3_partner_id IS NULL OR level_3_partner_id IS DISTINCT FROM level_1_partner_id),
  CHECK (level_3_partner_id IS NULL OR level_2_partner_id IS NULL OR level_3_partner_id IS DISTINCT FROM level_2_partner_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_attribution_vendor_active
  ON public.partner_attributions(vendor_business_id)
  WHERE vendor_business_id IS NOT NULL AND status IN ('OPEN','LOCKED','CONVERTED');
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_attribution_external_active
  ON public.partner_attributions(external_subject_key)
  WHERE external_subject_key IS NOT NULL AND status IN ('OPEN','LOCKED','CONVERTED');
CREATE INDEX IF NOT EXISTS idx_partner_attributions_partner_status
  ON public.partner_attributions(partner_id, status, attributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_attributions_expiry
  ON public.partner_attributions(status, expires_at);

CREATE TABLE IF NOT EXISTS public.partner_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('ACTIVATION','SUBSCRIPTION','PLATFORM_COMMISSION','DIRECT_RENEWAL')),
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  residual_month_start INTEGER,
  residual_month_end INTEGER,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (residual_month_start IS NULL OR residual_month_start >= 1),
  CHECK (residual_month_end IS NULL OR residual_month_end >= COALESCE(residual_month_start, 1))
);

INSERT INTO public.partner_commission_rules (rule_code, event_type, level, rate_bps, residual_month_start, residual_month_end)
VALUES
  ('activation-l1-v1', 'ACTIVATION', 1, 3000, NULL, NULL),
  ('activation-l2-v1', 'ACTIVATION', 2, 700, NULL, NULL),
  ('activation-l3-v1', 'ACTIVATION', 3, 300, NULL, NULL),
  ('subscription-l1-v1', 'SUBSCRIPTION', 1, 1800, 1, 24),
  ('subscription-l2-v1', 'SUBSCRIPTION', 2, 500, 1, 24),
  ('subscription-l3-v1', 'SUBSCRIPTION', 3, 200, 1, 24),
  ('platform-commission-l1-v1', 'PLATFORM_COMMISSION', 1, 500, NULL, NULL),
  ('platform-commission-l2-v1', 'PLATFORM_COMMISSION', 2, 150, NULL, NULL),
  ('platform-commission-l3-v1', 'PLATFORM_COMMISSION', 3, 50, NULL, NULL),
  ('direct-renewal-l1-after-24-v1', 'DIRECT_RENEWAL', 1, 500, 25, NULL)
ON CONFLICT (rule_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_bonus_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_code TEXT NOT NULL UNIQUE,
  paid_new_vendors INTEGER NOT NULL CHECK (paid_new_vendors > 0),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.partner_bonus_tiers (tier_code, paid_new_vendors, amount_cents)
VALUES
  ('monthly-5-v1', 5, 5000),
  ('monthly-10-v1', 10, 15000),
  ('monthly-25-v1', 25, 40000),
  ('monthly-50-v1', 50, 100000),
  ('monthly-100-v1', 100, 250000)
ON CONFLICT (tier_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_rank_rules (
  rank TEXT PRIMARY KEY CHECK (rank IN ('PARTNER','TEAM_PARTNER','AREA_PARTNER','HUB_PARTNER')),
  min_personal_active_paid_vendors INTEGER NOT NULL DEFAULT 0 CHECK (min_personal_active_paid_vendors >= 0),
  min_team_active_paid_vendors INTEGER NOT NULL DEFAULT 0 CHECK (min_team_active_paid_vendors >= 0),
  min_retention_bps INTEGER CHECK (min_retention_bps BETWEEN 0 AND 10000),
  unlocked_levels SMALLINT NOT NULL CHECK (unlocked_levels BETWEEN 1 AND 3),
  manual_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.partner_rank_rules (rank, min_personal_active_paid_vendors, min_team_active_paid_vendors, min_retention_bps, unlocked_levels, manual_review_required)
VALUES
  ('PARTNER', 0, 0, NULL, 1, FALSE),
  ('TEAM_PARTNER', 5, 0, NULL, 2, FALSE),
  ('AREA_PARTNER', 15, 50, 8000, 3, FALSE),
  ('HUB_PARTNER', 15, 50, 8000, 3, TRUE)
ON CONFLICT (rank) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.partner_rank_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  previous_rank TEXT CHECK (previous_rank IS NULL OR previous_rank IN ('PARTNER','TEAM_PARTNER','AREA_PARTNER','HUB_PARTNER')),
  new_rank TEXT NOT NULL CHECK (new_rank IN ('PARTNER','TEAM_PARTNER','AREA_PARTNER','HUB_PARTNER')),
  reason TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_rank_history_partner
  ON public.partner_rank_history(partner_id, effective_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_commission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  vendor_business_id UUID REFERENCES public.vendor_businesses(id) ON DELETE RESTRICT,
  attribution_id UUID REFERENCES public.partner_attributions(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('ACTIVATION','SUBSCRIPTION','PLATFORM_COMMISSION','DIRECT_RENEWAL','PERFORMANCE_BONUS','ADJUSTMENT','CLAWBACK')),
  source_reference TEXT NOT NULL,
  level SMALLINT CHECK (level BETWEEN 1 AND 3),
  base_amount_cents BIGINT NOT NULL CHECK (base_amount_cents >= 0),
  rate_bps INTEGER CHECK (rate_bps BETWEEN 0 AND 10000),
  commission_amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'HOLD' CHECK (status IN ('PENDING','HOLD','PAYABLE','PAID','REVERSED')),
  plan_code_snapshot TEXT,
  plan_name_snapshot TEXT,
  billing_cadence_snapshot TEXT CHECK (billing_cadence_snapshot IS NULL OR billing_cadence_snapshot IN ('MONTHLY','ANNUAL','ONE_OFF','TRANSACTION')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hold_until TIMESTAMPTZ,
  payable_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  reversal_of_event_id UUID REFERENCES public.partner_commission_events(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((source_type IN ('PERFORMANCE_BONUS','ADJUSTMENT','CLAWBACK')) OR level IS NOT NULL),
  CHECK ((source_type = 'CLAWBACK' AND commission_amount_cents <= 0) OR (source_type <> 'CLAWBACK' AND commission_amount_cents >= 0)),
  CHECK ((rate_bps IS NULL) OR commission_amount_cents = ROUND((base_amount_cents::numeric * rate_bps::numeric) / 10000)::bigint)
);

CREATE INDEX IF NOT EXISTS idx_partner_commission_events_partner_status
  ON public.partner_commission_events(partner_id, status, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_commission_events_vendor
  ON public.partner_commission_events(vendor_business_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_commission_events_source
  ON public.partner_commission_events(source_type, source_reference);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount_cents BIGINT NOT NULL DEFAULT 0,
  adjustment_amount_cents BIGINT NOT NULL DEFAULT 0,
  net_amount_cents BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PROCESSING','PAID','FAILED','VOID')),
  payout_reference TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (net_amount_cents = gross_amount_cents + adjustment_amount_cents)
);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_status
  ON public.partner_payouts(partner_id, status, period_end DESC);

CREATE TABLE IF NOT EXISTS public.partner_payout_items (
  payout_id UUID NOT NULL REFERENCES public.partner_payouts(id) ON DELETE RESTRICT,
  commission_event_id UUID NOT NULL UNIQUE REFERENCES public.partner_commission_events(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (payout_id, commission_event_id)
);

CREATE OR REPLACE FUNCTION public.guard_partner_commission_event_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'partner commission events are append-only; use a clawback event';
  END IF;

  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.vendor_business_id IS DISTINCT FROM OLD.vendor_business_id
     OR NEW.attribution_id IS DISTINCT FROM OLD.attribution_id
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.base_amount_cents IS DISTINCT FROM OLD.base_amount_cents
     OR NEW.rate_bps IS DISTINCT FROM OLD.rate_bps
     OR NEW.commission_amount_cents IS DISTINCT FROM OLD.commission_amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.plan_code_snapshot IS DISTINCT FROM OLD.plan_code_snapshot
     OR NEW.plan_name_snapshot IS DISTINCT FROM OLD.plan_name_snapshot
     OR NEW.billing_cadence_snapshot IS DISTINCT FROM OLD.billing_cadence_snapshot
     OR NEW.event_at IS DISTINCT FROM OLD.event_at
     OR NEW.reversal_of_event_id IS DISTINCT FROM OLD.reversal_of_event_id
     OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'financial fields on partner commission events are immutable; create an adjustment or clawback';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_partner_commission_event_financial_fields ON public.partner_commission_events;
CREATE TRIGGER trg_guard_partner_commission_event_financial_fields
BEFORE UPDATE OR DELETE ON public.partner_commission_events
FOR EACH ROW EXECUTE FUNCTION public.guard_partner_commission_event_financial_fields();

CREATE OR REPLACE VIEW public.partner_earnings_summary AS
SELECT
  pa.id AS partner_id,
  pa.partner_code,
  pa.rank,
  COUNT(pce.id) FILTER (WHERE pce.status IN ('HOLD','PAYABLE','PAID')) AS earning_event_count,
  COALESCE(SUM(pce.commission_amount_cents) FILTER (WHERE pce.status = 'HOLD'), 0) AS held_amount_cents,
  COALESCE(SUM(pce.commission_amount_cents) FILTER (WHERE pce.status = 'PAYABLE'), 0) AS payable_amount_cents,
  COALESCE(SUM(pce.commission_amount_cents) FILTER (WHERE pce.status = 'PAID'), 0) AS paid_amount_cents
FROM public.partner_accounts pa
LEFT JOIN public.partner_commission_events pce ON pce.partner_id = pa.id
GROUP BY pa.id, pa.partner_code, pa.rank;

COMMENT ON TABLE public.partner_accounts IS 'Free-to-join KONTA MOY Partner Network accounts. Sponsor relationships alone never create commission.';
COMMENT ON TABLE public.partner_attributions IS '180-day referral attribution records. Conversion snapshots up to three eligible earning levels.';
COMMENT ON TABLE public.partner_commission_events IS 'Auditable partner earnings ledger. PLATFORM_COMMISSION base_amount_cents is KONTA MOY platform fee revenue, never vendor GMV.';
COMMENT ON COLUMN public.partner_commission_events.base_amount_cents IS 'For PLATFORM_COMMISSION this MUST be KONTA MOY platform commission revenue, not gross merchandise value.';

COMMIT;
