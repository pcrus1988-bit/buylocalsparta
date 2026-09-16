-- KONTA MOY Flash Sale — daily account-bound swipe sessions and checkout entitlements.
-- The catalogue remains authoritative; Flash Sale stores only immutable price snapshots and one-unit claims.

BEGIN;

CREATE TABLE public.flash_sale_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  item_count smallint NOT NULL DEFAULT 10 CHECK (item_count BETWEEN 1 AND 25),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flash_sale_sessions_daily_user UNIQUE (user_id, market_id, sale_date)
);

CREATE TABLE public.flash_sale_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES public.flash_sale_sessions(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.vendor_offers(id) ON DELETE RESTRICT,
  family_id uuid REFERENCES public.product_families(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 25),
  listed_price_minor bigint NOT NULL CHECK (listed_price_minor BETWEEN 0 AND 1000000000),
  msrp_minor bigint NOT NULL CHECK (msrp_minor > 0),
  flash_price_minor bigint NOT NULL CHECK (flash_price_minor >= 0),
  flash_discount_minor bigint NOT NULL CHECK (flash_discount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  decision text CHECK (decision IS NULL OR decision IN ('skipped','selected')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flash_sale_session_items_position UNIQUE (session_id, position),
  CONSTRAINT flash_sale_session_items_variant UNIQUE (session_id, canonical_variant_id),
  CONSTRAINT flash_sale_session_items_price_math CHECK (flash_price_minor + flash_discount_minor = listed_price_minor)
);

CREATE TABLE public.flash_sale_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES public.flash_sale_sessions(id) ON DELETE CASCADE,
  session_item_id uuid NOT NULL UNIQUE REFERENCES public.flash_sale_session_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.vendor_offers(id) ON DELETE RESTRICT,
  sale_date date NOT NULL,
  listed_price_minor bigint NOT NULL CHECK (listed_price_minor >= 0),
  flash_price_minor bigint NOT NULL CHECK (flash_price_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  quantity_cap smallint NOT NULL DEFAULT 1 CHECK (quantity_cap = 1),
  expires_at timestamptz NOT NULL,
  redeemed_order_id uuid REFERENCES public.customer_orders(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flash_sale_claim_price_math CHECK (flash_price_minor + discount_minor = listed_price_minor),
  CONSTRAINT flash_sale_claim_redeem_pair CHECK (
    (redeemed_order_id IS NULL AND redeemed_at IS NULL) OR
    (redeemed_order_id IS NOT NULL AND redeemed_at IS NOT NULL)
  )
);

CREATE INDEX flash_sale_sessions_user_day_idx
  ON public.flash_sale_sessions(user_id, market_id, sale_date DESC);

CREATE INDEX flash_sale_session_items_session_decision_idx
  ON public.flash_sale_session_items(session_id, decision, position);

CREATE INDEX flash_sale_claims_active_idx
  ON public.flash_sale_claims(user_id, market_id, expires_at)
  WHERE redeemed_order_id IS NULL;

CREATE INDEX flash_sale_claims_variant_history_idx
  ON public.flash_sale_claims(user_id, canonical_variant_id, sale_date DESC);

COMMENT ON TABLE public.flash_sale_sessions IS
  'One server-authoritative KONTA MOY Flash Sale play per customer, market and Athens calendar day.';
COMMENT ON TABLE public.flash_sale_session_items IS
  'Ten server-selected exact canonical variants/offers with immutable price snapshots; client swipes cannot replace these products.';
COMMENT ON TABLE public.flash_sale_claims IS
  'One-unit, exact-variant Flash Sale checkout entitlements. Claims expire at the next Athens midnight and are consumed atomically by an order.';

ALTER TABLE public.flash_sale_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sale_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sale_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.flash_sale_sessions
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY bls_platform_runtime_all ON public.flash_sale_session_items
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY bls_platform_runtime_all ON public.flash_sale_claims
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
