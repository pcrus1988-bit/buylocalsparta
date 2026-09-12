-- Profitability & margin intelligence.
-- Historical margin must use the buying cost that existed when the order line was created.
-- We deliberately do not backfill old order lines from today's vendor pricing.

CREATE TABLE order_line_profitability_private (
  order_line_id uuid PRIMARY KEY REFERENCES order_lines(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE RESTRICT,
  assigned_offer_id uuid REFERENCES vendor_offers(id) ON DELETE SET NULL,
  buying_unit_price_minor bigint NOT NULL CHECK (buying_unit_price_minor >= 0),
  source text NOT NULL DEFAULT 'offer_pricing_snapshot' CHECK (source IN ('offer_pricing_snapshot')),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_line_profitability_private_vendor
  ON order_line_profitability_private(vendor_id, captured_at DESC);

ALTER TABLE order_line_profitability_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_profitability_private FORCE ROW LEVEL SECURITY;

CREATE POLICY order_line_profitability_private_vendor_read
ON order_line_profitability_private
FOR SELECT
USING (
  vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
);

REVOKE ALL ON order_line_profitability_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION bls_private.capture_order_line_profitability_private()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  captured_cost bigint;
BEGIN
  IF NEW.assigned_offer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.buying_price_minor
  INTO captured_cost
  FROM public.vendor_offer_pricing_private p
  WHERE p.offer_id = NEW.assigned_offer_id
    AND p.vendor_id = NEW.vendor_id
    AND p.buying_price_minor IS NOT NULL
  LIMIT 1;

  IF captured_cost IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_line_profitability_private(
    order_line_id,
    vendor_id,
    assigned_offer_id,
    buying_unit_price_minor,
    source,
    captured_at
  ) VALUES (
    NEW.id,
    NEW.vendor_id,
    NEW.assigned_offer_id,
    captured_cost,
    'offer_pricing_snapshot',
    now()
  )
  ON CONFLICT (order_line_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.capture_order_line_profitability_private() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_capture_order_line_profitability_private ON order_lines;
CREATE TRIGGER trg_capture_order_line_profitability_private
AFTER INSERT ON order_lines
FOR EACH ROW EXECUTE FUNCTION bls_private.capture_order_line_profitability_private();

-- Admin-only server projections. They keep the private snapshot table out of browser/public APIs
-- while allowing platform operators to aggregate profitability across vendors.
CREATE OR REPLACE FUNCTION bls_private.admin_profitability_lines(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  vendor_id text,
  vendor_name text,
  product_id text,
  product_title text,
  category_code text,
  category_name text,
  ordered_quantity integer,
  fulfilled_quantity integer,
  refunded_quantity integer,
  retail_unit_price_minor bigint,
  vendor_proceeds_minor bigint,
  buying_unit_price_minor bigint,
  adjustment_refunded_minor bigint,
  vendor_discount_minor bigint,
  coupon_vendor_funding_minor bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
  SELECT
    vb.public_id,
    COALESCE(vb.trading_name, vb.legal_name, vb.public_id),
    cv.public_id,
    COALESCE(pt_el.title, pt_en.title, cv.model, cv.public_id),
    c.code,
    COALESCE(ct_el.name, ct_en.name, c.code, 'Uncategorised'),
    ol.quantity,
    ol.fulfilled_quantity,
    ol.refunded_quantity,
    ol.retail_unit_price_minor,
    ol.vendor_proceeds_minor,
    ps.buying_unit_price_minor,
    ol.adjustment_refunded_minor,
    ol.vendor_discount_minor,
    ol.coupon_vendor_funding_minor,
    ol.created_at
  FROM public.order_lines ol
  JOIN public.vendor_businesses vb ON vb.id = ol.vendor_id
  JOIN public.canonical_variants cv ON cv.id = ol.canonical_variant_id
  LEFT JOIN public.product_translations pt_el ON pt_el.canonical_variant_id = cv.id AND pt_el.locale = 'el'
  LEFT JOIN public.product_translations pt_en ON pt_en.canonical_variant_id = cv.id AND pt_en.locale = 'en'
  LEFT JOIN public.product_families pf ON pf.id = cv.family_id
  LEFT JOIN public.categories c ON c.id = COALESCE(cv.category_id, pf.category_id)
  LEFT JOIN public.category_translations ct_el ON ct_el.category_id = c.id AND ct_el.locale = 'el'
  LEFT JOIN public.category_translations ct_en ON ct_en.category_id = c.id AND ct_en.locale = 'en'
  LEFT JOIN public.order_line_profitability_private ps ON ps.order_line_id = ol.id
  WHERE (p_from IS NULL OR ol.created_at >= p_from)
    AND (p_to IS NULL OR ol.created_at < p_to)
  ORDER BY ol.created_at DESC, ol.public_id;
$$;

CREATE OR REPLACE FUNCTION bls_private.admin_current_catalogue_margin()
RETURNS TABLE (
  vendor_id text,
  vendor_name text,
  offer_id text,
  product_id text,
  product_title text,
  category_code text,
  category_name text,
  retail_price_minor bigint,
  buying_price_minor bigint,
  offer_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
  SELECT
    vb.public_id,
    COALESCE(vb.trading_name, vb.legal_name, vb.public_id),
    vo.public_id,
    cv.public_id,
    COALESCE(pt_el.title, pt_en.title, cv.model, cv.public_id),
    c.code,
    COALESCE(ct_el.name, ct_en.name, c.code, 'Uncategorised'),
    vo.customer_price_minor,
    pp.buying_price_minor,
    vo.status::text
  FROM public.vendor_offers vo
  JOIN public.vendor_businesses vb ON vb.id = vo.vendor_id
  JOIN public.canonical_variants cv ON cv.id = vo.canonical_variant_id
  LEFT JOIN public.product_translations pt_el ON pt_el.canonical_variant_id = cv.id AND pt_el.locale = 'el'
  LEFT JOIN public.product_translations pt_en ON pt_en.canonical_variant_id = cv.id AND pt_en.locale = 'en'
  LEFT JOIN public.product_families pf ON pf.id = cv.family_id
  LEFT JOIN public.categories c ON c.id = COALESCE(cv.category_id, pf.category_id)
  LEFT JOIN public.category_translations ct_el ON ct_el.category_id = c.id AND ct_el.locale = 'el'
  LEFT JOIN public.category_translations ct_en ON ct_en.category_id = c.id AND ct_en.locale = 'en'
  LEFT JOIN public.vendor_offer_pricing_private pp ON pp.offer_id = vo.id
  WHERE vo.customer_price_minor IS NOT NULL
  ORDER BY vb.public_id, product_title, vo.public_id;
$$;

REVOKE ALL ON FUNCTION bls_private.admin_profitability_lines(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.admin_current_catalogue_margin() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_service') THEN
    GRANT SELECT ON order_line_profitability_private TO platform_service;
    GRANT EXECUTE ON FUNCTION bls_private.admin_profitability_lines(timestamptz, timestamptz) TO platform_service;
    GRANT EXECUTE ON FUNCTION bls_private.admin_current_catalogue_margin() TO platform_service;
    GRANT EXECUTE ON FUNCTION bls_private.capture_order_line_profitability_private() TO platform_service;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendor_user') THEN
    GRANT SELECT ON order_line_profitability_private TO vendor_user;
  END IF;
END $$;
