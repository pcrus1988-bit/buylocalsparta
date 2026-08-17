-- Build 0.21: auditable platform retail prices, announced price reductions and customer coupons.
-- Public retail price is platform-controlled and intentionally independent from supplier-selection fairness.
BEGIN;

CREATE TABLE platform_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  currency char(3) NOT NULL DEFAULT 'EUR',
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  source text NOT NULL CHECK (source IN ('initial','manual')),
  CHECK (effective_at >= recorded_at),
  UNIQUE(canonical_variant_id, effective_at)
);
CREATE INDEX platform_price_history_lookup_idx ON platform_price_history(canonical_variant_id, effective_at DESC);
CREATE INDEX platform_price_history_market_idx ON platform_price_history(market_id, recorded_at DESC);
CREATE TRIGGER platform_price_history_append_only BEFORE UPDATE OR DELETE ON platform_price_history
  FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

CREATE TABLE product_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  promotional_price_minor bigint NOT NULL CHECK (promotional_price_minor >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by uuid REFERENCES users(id),
  created_by_public_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  prior_price_snapshot_minor bigint CHECK (prior_price_snapshot_minor IS NULL OR prior_price_snapshot_minor >= 0),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancelled_by_public_id text,
  cancellation_reason text,
  CHECK (ends_at > starts_at),
  CHECK (starts_at >= created_at),
  CHECK ((cancelled_at IS NULL AND cancelled_by_public_id IS NULL AND cancellation_reason IS NULL)
      OR (cancelled_at IS NOT NULL AND cancelled_by_public_id IS NOT NULL AND length(trim(cancellation_reason)) > 0))
);
CREATE INDEX product_promotions_lookup_idx ON product_promotions(canonical_variant_id, starts_at, ends_at) WHERE cancelled_at IS NULL;
CREATE INDEX product_promotions_market_idx ON product_promotions(market_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_overlapping_product_promotions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_base_price bigint;
  v_currency char(3);
BEGIN
  -- Lock the canonical product to serialize concurrent campaign creation for the same product.
  PERFORM id FROM canonical_variants WHERE id=NEW.canonical_variant_id FOR UPDATE;
  SELECT h.price_minor,h.currency INTO v_base_price,v_currency
    FROM platform_price_history h
    WHERE h.canonical_variant_id=NEW.canonical_variant_id AND h.effective_at<=NEW.starts_at
    ORDER BY h.effective_at DESC,h.recorded_at DESC LIMIT 1;
  IF v_base_price IS NULL THEN RAISE EXCEPTION 'platform base price history is required before creating a promotion'; END IF;
  IF v_currency<>NEW.currency THEN RAISE EXCEPTION 'promotion currency differs from platform base price'; END IF;
  IF NEW.promotional_price_minor>=v_base_price THEN RAISE EXCEPTION 'price-reduction promotion must be below platform base price at start'; END IF;
  IF EXISTS (
    SELECT 1 FROM product_promotions p
    WHERE p.canonical_variant_id=NEW.canonical_variant_id
      AND p.id<>NEW.id
      AND p.cancelled_at IS NULL
      AND NEW.cancelled_at IS NULL
      AND NEW.starts_at < p.ends_at
      AND NEW.ends_at > p.starts_at
  ) THEN
    RAISE EXCEPTION 'overlapping public price promotions are not allowed for one canonical product';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_promotions_no_overlap BEFORE INSERT OR UPDATE OF starts_at,ends_at,cancelled_at,promotional_price_minor ON product_promotions
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_product_promotions();

CREATE OR REPLACE FUNCTION guard_platform_price_against_promotions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM canonical_variants WHERE id=NEW.canonical_variant_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM product_promotions p
    WHERE p.canonical_variant_id=NEW.canonical_variant_id
      AND p.cancelled_at IS NULL
      AND p.ends_at>NEW.effective_at
      AND (p.currency<>NEW.currency OR p.promotional_price_minor>=NEW.price_minor)
  ) THEN
    RAISE EXCEPTION 'base price would invalidate an active or scheduled price-reduction promotion';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_price_history_promotion_guard BEFORE INSERT ON platform_price_history
  FOR EACH ROW EXECUTE FUNCTION guard_platform_price_against_promotions();

CREATE TABLE coupon_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  code text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  discount_type text NOT NULL CHECK (discount_type IN ('fixed','percentage')),
  currency char(3) NOT NULL DEFAULT 'EUR',
  fixed_amount_minor bigint CHECK (fixed_amount_minor IS NULL OR fixed_amount_minor > 0),
  rate_bps integer CHECK (rate_bps IS NULL OR (rate_bps > 0 AND rate_bps <= 10000)),
  min_subtotal_minor bigint CHECK (min_subtotal_minor IS NULL OR min_subtotal_minor >= 0),
  max_discount_minor bigint CHECK (max_discount_minor IS NULL OR max_discount_minor >= 0),
  exclude_private_offers boolean NOT NULL DEFAULT true,
  exclude_promotional_prices boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  max_per_subject integer CHECK (max_per_subject IS NULL OR max_per_subject > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_by_public_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code = upper(regexp_replace(code, '\s+', '', 'g')) AND length(code) > 0),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK ((discount_type='fixed' AND fixed_amount_minor IS NOT NULL AND rate_bps IS NULL)
      OR (discount_type='percentage' AND rate_bps IS NOT NULL AND fixed_amount_minor IS NULL)),
  UNIQUE(market_id, code, version)
);
CREATE INDEX coupon_rules_lookup_idx ON coupon_rules(market_id, code, active, starts_at, ends_at);

CREATE TABLE coupon_product_eligibility (
  coupon_id uuid NOT NULL REFERENCES coupon_rules(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  PRIMARY KEY(coupon_id, canonical_variant_id)
);
CREATE TABLE coupon_category_eligibility (
  coupon_id uuid NOT NULL REFERENCES coupon_rules(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  PRIMARY KEY(coupon_id, category_id)
);

CREATE TABLE coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  coupon_id uuid NOT NULL REFERENCES coupon_rules(id),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  subject_hash text NOT NULL CHECK (length(subject_hash) >= 32),
  rule_version integer NOT NULL CHECK (rule_version > 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  discount_minor bigint NOT NULL CHECK (discount_minor > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions(coupon_id, redeemed_at DESC);
CREATE INDEX coupon_redemptions_subject_idx ON coupon_redemptions(coupon_id, subject_hash, redeemed_at DESC);
CREATE TRIGGER coupon_redemptions_append_only BEFORE UPDATE OR DELETE ON coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

CREATE TABLE coupon_redemption_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  redemption_id uuid NOT NULL UNIQUE REFERENCES coupon_redemptions(id),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  reversed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupon_redemption_reversals_order_idx ON coupon_redemption_reversals(redemption_id, reversed_at DESC);
CREATE TRIGGER coupon_redemption_reversals_append_only BEFORE UPDATE OR DELETE ON coupon_redemption_reversals
  FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

CREATE OR REPLACE FUNCTION enforce_coupon_redemption_caps() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max integer;
  v_per_subject integer;
  v_active boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_version integer;
BEGIN
  SELECT max_redemptions,max_per_subject,active,starts_at,ends_at,version
    INTO v_max,v_per_subject,v_active,v_start,v_end,v_version
    FROM coupon_rules WHERE id=NEW.coupon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon rule not found'; END IF;
  IF NOT v_active OR NEW.redeemed_at < v_start OR (v_end IS NOT NULL AND NEW.redeemed_at >= v_end) THEN
    RAISE EXCEPTION 'coupon is not redeemable at this time';
  END IF;
  IF NEW.rule_version <> v_version THEN RAISE EXCEPTION 'coupon rule version changed before redemption'; END IF;
  IF v_max IS NOT NULL AND (SELECT count(*) FROM coupon_redemptions r LEFT JOIN coupon_redemption_reversals x ON x.redemption_id=r.id WHERE r.coupon_id=NEW.coupon_id AND x.id IS NULL) >= v_max THEN
    RAISE EXCEPTION 'coupon redemption limit reached';
  END IF;
  IF v_per_subject IS NOT NULL AND (SELECT count(*) FROM coupon_redemptions r LEFT JOIN coupon_redemption_reversals x ON x.redemption_id=r.id WHERE r.coupon_id=NEW.coupon_id AND r.subject_hash=NEW.subject_hash AND x.id IS NULL) >= v_per_subject THEN
    RAISE EXCEPTION 'coupon per-subject redemption limit reached';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER coupon_redemptions_cap_guard BEFORE INSERT ON coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION enforce_coupon_redemption_caps();

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS discount_source_reference text;

ALTER TABLE order_lines
  DROP CONSTRAINT IF EXISTS order_lines_pricing_source_check;
ALTER TABLE order_lines
  ADD CONSTRAINT order_lines_pricing_source_check CHECK (pricing_source IN ('catalog','promotion','private_offer','substitution'));
ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS prior_price_minor bigint CHECK (prior_price_minor IS NULL OR prior_price_minor >= 0),
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES product_promotions(id),
  ADD COLUMN IF NOT EXISTS discount_allocation_minor bigint NOT NULL DEFAULT 0 CHECK (discount_allocation_minor >= 0);

ALTER TABLE platform_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_product_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_category_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemption_reversals ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_price_history_platform_only ON platform_price_history FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY product_promotions_platform_only ON product_promotions FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY coupon_rules_platform_only ON coupon_rules FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY coupon_product_eligibility_platform_only ON coupon_product_eligibility FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY coupon_category_eligibility_platform_only ON coupon_category_eligibility FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY coupon_redemptions_platform_only ON coupon_redemptions FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY coupon_redemption_reversals_platform_only ON coupon_redemption_reversals FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
