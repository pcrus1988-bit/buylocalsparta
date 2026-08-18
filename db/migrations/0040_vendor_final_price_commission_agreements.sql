-- Buy Local Sparta — vendor-defined retail price and individual commission agreements.
-- A vendor offer price is the final customer-facing price. Buy Local Sparta never adds
-- a product markup; commission is resolved from the vendor's effective signed agreement
-- and deducted during settlement. Legacy supplier price columns remain mirrored during
-- the compatibility window so older runtime code cannot expose a different price.

ALTER TABLE public.vendor_offers
  ADD COLUMN IF NOT EXISTS customer_price_minor bigint,
  ADD COLUMN IF NOT EXISTS customer_price_updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.vendor_offers
SET customer_price_minor = supplier_unit_price_minor
WHERE customer_price_minor IS NULL;

ALTER TABLE public.vendor_offers
  ALTER COLUMN customer_price_minor SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='vendor_offers_customer_price_minor_check'
      AND conrelid='public.vendor_offers'::regclass
  ) THEN
    ALTER TABLE public.vendor_offers
      ADD CONSTRAINT vendor_offers_customer_price_minor_check
      CHECK (customer_price_minor >= 0);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.vendor_commercial_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  subscription_id uuid NULL REFERENCES public.vendor_subscriptions(id),
  agreement_code text NOT NULL,
  agreement_version integer NOT NULL DEFAULT 1 CHECK (agreement_version > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','suspended','expired','terminated')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NULL,
  signed_at timestamptz NULL,
  commission_rate_bps integer NOT NULL CHECK (commission_rate_bps BETWEEN 0 AND 10000),
  commission_basis text NOT NULL DEFAULT 'merchandise_gross'
    CHECK (commission_basis IN ('merchandise_gross')),
  commission_tax_mode text NOT NULL DEFAULT 'included'
    CHECK (commission_tax_mode IN ('included','plus_vat','none')),
  commission_tax_rate_bps integer NOT NULL DEFAULT 2400
    CHECK (commission_tax_rate_bps BETWEEN 0 AND 10000),
  commission_applies_to_shipping boolean NOT NULL DEFAULT false,
  listing_fee_minor bigint NULL CHECK (listing_fee_minor IS NULL OR listing_fee_minor >= 0),
  recurring_fee_minor bigint NULL CHECK (recurring_fee_minor IS NULL OR recurring_fee_minor >= 0),
  recurring_fee_period text NULL
    CHECK (recurring_fee_period IS NULL OR recurring_fee_period IN ('month','year','term')),
  source_document_reference text NULL,
  terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_commercial_agreements_dates_check
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT vendor_commercial_agreements_code_version_key
    UNIQUE (vendor_id, agreement_code, agreement_version)
);

CREATE INDEX IF NOT EXISTS vendor_commercial_agreements_effective_idx
  ON public.vendor_commercial_agreements(vendor_id, status, starts_at DESC, ends_at);

ALTER TABLE public.vendor_commercial_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_commercial_agreements;
CREATE POLICY bls_platform_runtime_all ON public.vendor_commercial_agreements
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.vendor_commercial_agreements
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.vendor_commission_terms(
  p_vendor_id uuid,
  p_at timestamptz
)
RETURNS TABLE(
  agreement_id uuid,
  agreement_public_id text,
  commission_rate_bps integer,
  commission_tax_mode text,
  commission_tax_rate_bps integer,
  commission_applies_to_shipping boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
  SELECT a.id,
         a.public_id,
         a.commission_rate_bps,
         a.commission_tax_mode,
         a.commission_tax_rate_bps,
         a.commission_applies_to_shipping
  FROM public.vendor_commercial_agreements a
  WHERE a.vendor_id = p_vendor_id
    AND a.status = 'active'
    AND a.starts_at <= p_at
    AND (a.ends_at IS NULL OR a.ends_at > p_at)
  ORDER BY a.starts_at DESC, a.agreement_version DESC, a.created_at DESC
  LIMIT 1
$$;

GRANT EXECUTE
  ON FUNCTION bls_private.vendor_commission_terms(uuid,timestamptz)
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.prevent_overlapping_vendor_agreements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1
    FROM public.vendor_commercial_agreements a
    WHERE a.vendor_id = NEW.vendor_id
      AND a.id <> NEW.id
      AND a.status = 'active'
      AND tstzrange(a.starts_at, COALESCE(a.ends_at, 'infinity'::timestamptz), '[)')
          && tstzrange(NEW.starts_at, COALESCE(NEW.ends_at, 'infinity'::timestamptz), '[)')
  ) THEN
    RAISE EXCEPTION 'Overlapping active vendor commercial agreements are not allowed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_commercial_agreements_no_overlap
  ON public.vendor_commercial_agreements;
CREATE TRIGGER vendor_commercial_agreements_no_overlap
BEFORE INSERT OR UPDATE ON public.vendor_commercial_agreements
FOR EACH ROW
EXECUTE FUNCTION bls_private.prevent_overlapping_vendor_agreements();

CREATE OR REPLACE FUNCTION bls_private.sync_vendor_offer_customer_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.customer_price_minor := COALESCE(NEW.customer_price_minor, NEW.supplier_unit_price_minor);
    NEW.supplier_unit_price_minor := NEW.customer_price_minor;
  ELSE
    IF NEW.customer_price_minor IS DISTINCT FROM OLD.customer_price_minor THEN
      NEW.supplier_unit_price_minor := NEW.customer_price_minor;
      NEW.customer_price_updated_at := now();
    ELSIF NEW.supplier_unit_price_minor IS DISTINCT FROM OLD.supplier_unit_price_minor THEN
      NEW.customer_price_minor := NEW.supplier_unit_price_minor;
      NEW.customer_price_updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS vendor_offers_sync_customer_price ON public.vendor_offers;
CREATE TRIGGER vendor_offers_sync_customer_price
BEFORE INSERT OR UPDATE OF customer_price_minor, supplier_unit_price_minor
ON public.vendor_offers
FOR EACH ROW
EXECUTE FUNCTION bls_private.sync_vendor_offer_customer_price();

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS commission_agreement_id uuid NULL
    REFERENCES public.vendor_commercial_agreements(id),
  ADD COLUMN IF NOT EXISTS commission_agreement_public_id_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS commission_rate_bps integer NULL,
  ADD COLUMN IF NOT EXISTS commission_tax_mode text NULL,
  ADD COLUMN IF NOT EXISTS commission_tax_rate_bps integer NULL,
  ADD COLUMN IF NOT EXISTS commission_net_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_tax_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_total_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_proceeds_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='order_lines_commission_rate_bps_check'
      AND conrelid='public.order_lines'::regclass
  ) THEN
    ALTER TABLE public.order_lines
      ADD CONSTRAINT order_lines_commission_rate_bps_check
      CHECK (commission_rate_bps IS NULL OR commission_rate_bps BETWEEN 0 AND 10000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='order_lines_commission_amounts_check'
      AND conrelid='public.order_lines'::regclass
  ) THEN
    ALTER TABLE public.order_lines
      ADD CONSTRAINT order_lines_commission_amounts_check
      CHECK (
        commission_net_minor >= 0
        AND commission_tax_minor >= 0
        AND commission_total_minor >= 0
        AND vendor_proceeds_minor >= 0
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.apply_offer_price_and_commission_to_order_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_offer record;
  v_terms record;
  v_order_at timestamptz;
  v_gross bigint;
  v_commission_basis_minor bigint;
  v_commission_net bigint;
  v_commission_tax bigint;
  v_commission_total bigint;
  v_product_tax bigint;
BEGIN
  SELECT vo.id,
         vo.vendor_id,
         vo.location_id,
         vo.canonical_variant_id,
         vo.customer_price_minor,
         vo.supplier_tax_rate_bps,
         vo.status
  INTO v_offer
  FROM public.vendor_offers vo
  WHERE vo.id = NEW.assigned_offer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assigned vendor offer does not exist';
  END IF;
  IF v_offer.status::text <> 'approved' THEN
    RAISE EXCEPTION 'Assigned vendor offer is not approved';
  END IF;
  IF v_offer.vendor_id <> NEW.vendor_id
     OR v_offer.location_id <> NEW.location_id
     OR v_offer.canonical_variant_id <> NEW.canonical_variant_id THEN
    RAISE EXCEPTION 'Order line assignment does not match vendor offer';
  END IF;

  SELECT COALESCE(o.created_at, now())
  INTO v_order_at
  FROM public.customer_orders o
  WHERE o.id = NEW.order_id;

  SELECT *
  INTO v_terms
  FROM bls_private.vendor_commission_terms(
    NEW.vendor_id,
    COALESCE(v_order_at, now())
  );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active individual vendor commercial agreement is required before checkout';
  END IF;

  NEW.retail_unit_price_minor := v_offer.customer_price_minor;
  NEW.supplier_unit_price_minor := v_offer.customer_price_minor;
  NEW.supplier_tax_rate_bps := v_offer.supplier_tax_rate_bps;
  v_gross := v_offer.customer_price_minor * NEW.quantity;

  v_product_tax :=
    v_gross
    - round((v_gross::numeric * 10000) / (10000 + NEW.tax_rate_bps))::bigint;
  NEW.tax_minor := GREATEST(0, v_product_tax);

  v_commission_basis_minor :=
    round((v_gross::numeric * v_terms.commission_rate_bps) / 10000)::bigint;

  IF v_terms.commission_tax_mode = 'plus_vat' THEN
    v_commission_net := v_commission_basis_minor;
    v_commission_tax :=
      round((v_commission_net::numeric * v_terms.commission_tax_rate_bps) / 10000)::bigint;
    v_commission_total := v_commission_net + v_commission_tax;
  ELSIF v_terms.commission_tax_mode = 'included'
        AND v_terms.commission_tax_rate_bps > 0 THEN
    v_commission_total := v_commission_basis_minor;
    v_commission_net :=
      round((v_commission_total::numeric * 10000)
            / (10000 + v_terms.commission_tax_rate_bps))::bigint;
    v_commission_tax := v_commission_total - v_commission_net;
  ELSE
    v_commission_net := v_commission_basis_minor;
    v_commission_tax := 0;
    v_commission_total := v_commission_basis_minor;
  END IF;

  IF v_commission_total > v_gross THEN
    RAISE EXCEPTION 'Vendor commission exceeds merchandise gross';
  END IF;

  NEW.commission_agreement_id := v_terms.agreement_id;
  NEW.commission_agreement_public_id_snapshot := v_terms.agreement_public_id;
  NEW.commission_rate_bps := v_terms.commission_rate_bps;
  NEW.commission_tax_mode := v_terms.commission_tax_mode;
  NEW.commission_tax_rate_bps := v_terms.commission_tax_rate_bps;
  NEW.commission_net_minor := v_commission_net;
  NEW.commission_tax_minor := v_commission_tax;
  NEW.commission_total_minor := v_commission_total;
  NEW.vendor_proceeds_minor := v_gross - v_commission_total;
  NEW.commission_terms_snapshot := jsonb_build_object(
    'agreementId', v_terms.agreement_public_id,
    'commissionRateBps', v_terms.commission_rate_bps,
    'commissionTaxMode', v_terms.commission_tax_mode,
    'commissionTaxRateBps', v_terms.commission_tax_rate_bps,
    'basis', 'merchandise_gross',
    'customerUnitPriceMinor', v_offer.customer_price_minor
  );
  NEW.product_snapshot :=
    COALESCE(NEW.product_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'customerUnitPriceMinor', v_offer.customer_price_minor,
      'commissionAgreementId', v_terms.agreement_public_id
    );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS order_lines_apply_offer_price_commission ON public.order_lines;
CREATE TRIGGER order_lines_apply_offer_price_commission
BEFORE INSERT OR UPDATE OF
  assigned_offer_id, vendor_id, location_id, canonical_variant_id, quantity, tax_rate_bps
ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION bls_private.apply_offer_price_and_commission_to_order_line();

CREATE OR REPLACE FUNCTION bls_private.recalculate_order_financials(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_subtotal bigint;
  v_tax bigint;
  v_shipping bigint;
  v_discount bigint;
BEGIN
  SELECT COALESCE(sum(retail_unit_price_minor * quantity),0),
         COALESCE(sum(tax_minor),0)
  INTO v_subtotal, v_tax
  FROM public.order_lines
  WHERE order_id = p_order_id;

  SELECT COALESCE(sum(delivery_charge_minor),0)
  INTO v_shipping
  FROM public.fulfilment_orders
  WHERE order_id = p_order_id
    AND status <> 'cancelled';

  SELECT COALESCE(discount_minor,0)
  INTO v_discount
  FROM public.customer_orders
  WHERE id = p_order_id;

  UPDATE public.customer_orders
  SET subtotal_minor = v_subtotal,
      shipping_minor = v_shipping,
      tax_minor = v_tax,
      total_minor = GREATEST(0, v_subtotal + v_shipping - v_discount),
      updated_at = now()
  WHERE id = p_order_id;
END
$$;

CREATE OR REPLACE FUNCTION bls_private.order_line_recalculate_order_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  PERFORM bls_private.recalculate_order_financials(COALESCE(NEW.order_id, OLD.order_id));
  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS order_lines_recalculate_order_financials ON public.order_lines;
CREATE TRIGGER order_lines_recalculate_order_financials
AFTER INSERT OR UPDATE OR DELETE ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION bls_private.order_line_recalculate_order_financials();

CREATE OR REPLACE FUNCTION bls_private.recalculate_fulfilment_financials(
  p_fulfilment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_fo record;
  v_merchandise bigint;
  v_postcode text;
  v_rule record;
  v_charge bigint := 0;
  v_waived bigint := 0;
BEGIN
  SELECT fo.*,
         o.market_id AS order_market_id,
         o.shipping_address_snapshot,
         o.billing_address_snapshot
  INTO v_fo
  FROM public.fulfilment_orders fo
  JOIN public.customer_orders o ON o.id = fo.order_id
  WHERE fo.id = p_fulfilment_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(sum(ol.retail_unit_price_minor * ol.quantity),0)
  INTO v_merchandise
  FROM public.fulfilment_order_lines fol
  JOIN public.order_lines ol ON ol.id = fol.order_line_id
  WHERE fol.fulfilment_order_id = p_fulfilment_id;

  v_postcode := COALESCE(
    v_fo.shipping_address_snapshot->>'postcode',
    v_fo.billing_address_snapshot->>'postcode',
    '23100'
  );

  IF v_fo.mode::text <> 'pickup' THEN
    SELECT dr.*
    INTO v_rule
    FROM public.delivery_rules dr
    WHERE dr.market_id = v_fo.order_market_id
      AND dr.mode = v_fo.mode
      AND dr.active = true
      AND dr.starts_at <= now()
      AND (dr.ends_at IS NULL OR dr.ends_at > now())
      AND (dr.vendor_id IS NULL OR dr.vendor_id = v_fo.vendor_id)
      AND (
        cardinality(dr.postcode_prefixes) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(dr.postcode_prefixes) p
          WHERE v_postcode LIKE p || '%'
        )
      )
    ORDER BY
      (
        CASE WHEN dr.vendor_id IS NOT NULL THEN 4 ELSE 0 END
        + CASE WHEN cardinality(dr.postcode_prefixes) > 0 THEN 2 ELSE 0 END
      ) DESC,
      dr.priority DESC,
      dr.version DESC,
      dr.public_id
    LIMIT 1;

    IF FOUND THEN
      IF v_rule.minimum_subtotal_minor IS NOT NULL
         AND v_merchandise < v_rule.minimum_subtotal_minor THEN
        RAISE EXCEPTION 'Delivery subtotal is below the vendor delivery minimum';
      END IF;

      IF v_rule.free_above_subtotal_minor IS NOT NULL
         AND v_merchandise >= v_rule.free_above_subtotal_minor THEN
        v_charge := 0;
        v_waived := v_rule.base_charge_minor;
      ELSE
        v_charge := v_rule.base_charge_minor;
        v_waived := 0;
      END IF;
    END IF;
  END IF;

  UPDATE public.fulfilment_orders
  SET merchandise_subtotal_minor = v_merchandise,
      delivery_charge_minor = v_charge,
      waived_delivery_minor = v_waived,
      delivery_rule_id =
        CASE
          WHEN v_fo.mode::text = 'pickup' OR v_rule.id IS NULL THEN NULL
          ELSE v_rule.id
        END,
      delivery_rule_version =
        CASE
          WHEN v_fo.mode::text = 'pickup' OR v_rule.id IS NULL THEN NULL
          ELSE v_rule.version
        END,
      updated_at = now()
  WHERE id = p_fulfilment_id;

  PERFORM bls_private.recalculate_order_financials(v_fo.order_id);
END
$$;

CREATE OR REPLACE FUNCTION bls_private.fulfilment_line_recalculate_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  PERFORM bls_private.recalculate_fulfilment_financials(
    COALESCE(NEW.fulfilment_order_id, OLD.fulfilment_order_id)
  );
  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS fulfilment_order_lines_recalculate_financials
  ON public.fulfilment_order_lines;
CREATE TRIGGER fulfilment_order_lines_recalculate_financials
AFTER INSERT OR UPDATE OR DELETE ON public.fulfilment_order_lines
FOR EACH ROW
EXECUTE FUNCTION bls_private.fulfilment_line_recalculate_financials();

CREATE OR REPLACE FUNCTION bls_private.payment_insert_use_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT total_minor
  INTO v_total
  FROM public.customer_orders
  WHERE id = NEW.order_id;

  IF NEW.status::text = 'authorised' THEN
    NEW.authorised_minor := v_total;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payments_use_order_total ON public.payments;
CREATE TRIGGER payments_use_order_total
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION bls_private.payment_insert_use_order_total();

CREATE OR REPLACE FUNCTION bls_private.procurement_apply_commission_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_gross bigint;
  v_tax bigint;
  v_commission_net bigint;
  v_commission_tax bigint;
  v_commission_total bigint;
BEGIN
  IF NEW.fulfilment_order_id IS NOT NULL THEN
    SELECT COALESCE(sum(ol.retail_unit_price_minor * ol.quantity),0),
           COALESCE(sum(ol.tax_minor),0),
           COALESCE(sum(ol.commission_net_minor),0),
           COALESCE(sum(ol.commission_tax_minor),0),
           COALESCE(sum(ol.commission_total_minor),0)
    INTO v_gross, v_tax, v_commission_net, v_commission_tax, v_commission_total
    FROM public.fulfilment_order_lines fol
    JOIN public.order_lines ol ON ol.id = fol.order_line_id
    WHERE fol.fulfilment_order_id = NEW.fulfilment_order_id
      AND ol.vendor_id = NEW.vendor_id;
  ELSE
    SELECT COALESCE(sum(ol.retail_unit_price_minor * ol.quantity),0),
           COALESCE(sum(ol.tax_minor),0),
           COALESCE(sum(ol.commission_net_minor),0),
           COALESCE(sum(ol.commission_tax_minor),0),
           COALESCE(sum(ol.commission_total_minor),0)
    INTO v_gross, v_tax, v_commission_net, v_commission_tax, v_commission_total
    FROM public.order_lines ol
    WHERE ol.order_id = NEW.order_id
      AND ol.vendor_id = NEW.vendor_id;
  END IF;

  IF v_gross > 0 THEN
    NEW.supplier_tax_minor := v_tax;
    NEW.supplier_net_minor := v_gross - v_tax;
    NEW.service_fee_net_minor := v_commission_net;
    NEW.service_fee_tax_minor := v_commission_tax;
    NEW.service_fee_minor := v_commission_total;
    NEW.payable_minor :=
      GREATEST(
        0,
        v_gross
        + COALESCE(NEW.shipping_reimbursement_minor,0)
        - v_commission_total
        + COALESCE(NEW.adjustment_minor,0)
      );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS procurements_apply_commission_settlement ON public.procurements;
CREATE TRIGGER procurements_apply_commission_settlement
BEFORE INSERT OR UPDATE OF
  order_id, fulfilment_order_id, vendor_id, shipping_reimbursement_minor, adjustment_minor
ON public.procurements
FOR EACH ROW
EXECUTE FUNCTION bls_private.procurement_apply_commission_settlement();

GRANT EXECUTE
  ON FUNCTION bls_private.recalculate_order_financials(uuid)
  TO bls_app_runtime, bls_platform_runtime;
GRANT EXECUTE
  ON FUNCTION bls_private.recalculate_fulfilment_financials(uuid)
  TO bls_app_runtime, bls_platform_runtime;
