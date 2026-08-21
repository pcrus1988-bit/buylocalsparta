-- KONTA MOY — vendor finance operating model.
-- Keeps customer sales, vendor merchandise entitlement, platform service revenue,
-- delivery clearing and payout execution as distinct audited money streams.
BEGIN;

-- 1) Discount funding is immutable at order-line level. Platform-funded discounts do
-- not reduce vendor entitlement; vendor-funded discounts do.
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS platform_discount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_discount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_funding_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='order_lines_discount_funding_nonnegative'
      AND conrelid='public.order_lines'::regclass
  ) THEN
    ALTER TABLE public.order_lines
      ADD CONSTRAINT order_lines_discount_funding_nonnegative
      CHECK (platform_discount_minor >= 0 AND vendor_discount_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='order_lines_discount_funding_matches_allocation'
      AND conrelid='public.order_lines'::regclass
  ) THEN
    ALTER TABLE public.order_lines
      ADD CONSTRAINT order_lines_discount_funding_matches_allocation
      CHECK (
        discount_allocation_minor = 0
        OR discount_allocation_minor = platform_discount_minor + vendor_discount_minor
      ) NOT VALID;
  END IF;
END
$$;

-- Existing rows predate funding ownership. Zero-discount rows are already exact.
-- Existing discounted rows are conservatively classified as platform funded until
-- explicitly reclassified before this constraint is validated.
UPDATE public.order_lines
SET platform_discount_minor = discount_allocation_minor,
    discount_funding_snapshot = jsonb_build_object(
      'fundingOwner','platform',
      'classification','legacy-safe-default',
      'classifiedAt',now()
    )
WHERE discount_allocation_minor > 0
  AND platform_discount_minor = 0
  AND vendor_discount_minor = 0;

ALTER TABLE public.order_lines
  VALIDATE CONSTRAINT order_lines_discount_funding_matches_allocation;

-- Commission remains snapshotted at checkout. Vendor-funded discounts reduce the
-- commission basis and vendor merchandise entitlement; platform-funded discounts do not.
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
  v_catalog_gross bigint;
  v_vendor_gross bigint;
  v_commission_basis_minor bigint;
  v_commission_net bigint;
  v_commission_tax bigint;
  v_commission_total bigint;
  v_product_tax bigint;
BEGIN
  SELECT vo.id, vo.vendor_id, vo.location_id, vo.canonical_variant_id,
         vo.customer_price_minor, vo.supplier_tax_rate_bps, vo.status
  INTO v_offer
  FROM public.vendor_offers vo
  WHERE vo.id = NEW.assigned_offer_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Assigned vendor offer does not exist'; END IF;
  IF v_offer.status::text <> 'approved' THEN RAISE EXCEPTION 'Assigned vendor offer is not approved'; END IF;
  IF v_offer.vendor_id <> NEW.vendor_id
     OR v_offer.location_id <> NEW.location_id
     OR v_offer.canonical_variant_id <> NEW.canonical_variant_id THEN
    RAISE EXCEPTION 'Order line assignment does not match vendor offer';
  END IF;

  SELECT COALESCE(o.created_at, now()) INTO v_order_at
  FROM public.customer_orders o WHERE o.id = NEW.order_id;

  SELECT * INTO v_terms
  FROM bls_private.vendor_commission_terms(NEW.vendor_id, COALESCE(v_order_at, now()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An effective individual vendor commercial agreement is required before checkout';
  END IF;

  NEW.retail_unit_price_minor := v_offer.customer_price_minor;
  NEW.supplier_unit_price_minor := v_offer.customer_price_minor;
  NEW.supplier_tax_rate_bps := v_offer.supplier_tax_rate_bps;

  v_catalog_gross := v_offer.customer_price_minor * NEW.quantity;
  IF COALESCE(NEW.vendor_discount_minor,0) > v_catalog_gross THEN
    RAISE EXCEPTION 'Vendor-funded discount exceeds merchandise gross';
  END IF;
  v_vendor_gross := v_catalog_gross - COALESCE(NEW.vendor_discount_minor,0);

  v_product_tax :=
    v_catalog_gross
    - round((v_catalog_gross::numeric * 10000) / (10000 + NEW.tax_rate_bps))::bigint;
  NEW.tax_minor := GREATEST(0, v_product_tax);

  v_commission_basis_minor :=
    round((v_vendor_gross::numeric * v_terms.commission_rate_bps) / 10000)::bigint;

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

  IF v_commission_total > v_vendor_gross THEN
    RAISE EXCEPTION 'Vendor commission exceeds vendor merchandise entitlement';
  END IF;

  NEW.commission_agreement_id := v_terms.agreement_id;
  NEW.commission_agreement_public_id_snapshot := v_terms.agreement_public_id;
  NEW.commission_rate_bps := v_terms.commission_rate_bps;
  NEW.commission_tax_mode := v_terms.commission_tax_mode;
  NEW.commission_tax_rate_bps := v_terms.commission_tax_rate_bps;
  NEW.commission_net_minor := v_commission_net;
  NEW.commission_tax_minor := v_commission_tax;
  NEW.commission_total_minor := v_commission_total;
  NEW.vendor_proceeds_minor := v_vendor_gross - v_commission_total;
  NEW.commission_terms_snapshot := jsonb_build_object(
    'agreementId', v_terms.agreement_public_id,
    'commissionRateBps', v_terms.commission_rate_bps,
    'commissionTaxMode', v_terms.commission_tax_mode,
    'commissionTaxRateBps', v_terms.commission_tax_rate_bps,
    'basis', 'merchandise_gross_after_vendor_funded_discount',
    'customerUnitPriceMinor', v_offer.customer_price_minor,
    'vendorFundedDiscountMinor', COALESCE(NEW.vendor_discount_minor,0),
    'platformFundedDiscountMinor', COALESCE(NEW.platform_discount_minor,0)
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
  assigned_offer_id, vendor_id, location_id, canonical_variant_id, quantity,
  tax_rate_bps, vendor_discount_minor, platform_discount_minor
ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION bls_private.apply_offer_price_and_commission_to_order_line();

-- 2) Effective commercial state. Stored lifecycle status alone is not enough.
CREATE OR REPLACE FUNCTION bls_private.vendor_agreement_effective_state(
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status = 'terminated' THEN 'terminated'
    WHEN p_status = 'suspended' THEN 'suspended'
    WHEN p_status = 'draft' THEN 'draft'
    WHEN p_starts_at > p_at THEN 'upcoming'
    WHEN p_ends_at IS NOT NULL AND p_ends_at <= p_at THEN 'expired'
    WHEN p_status = 'active' THEN 'effective'
    WHEN p_status = 'expired' THEN 'expired'
    ELSE p_status
  END
$$;

REVOKE ALL ON FUNCTION bls_private.vendor_agreement_effective_state(text,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.vendor_agreement_effective_state(text,timestamptz,timestamptz,timestamptz)
  TO bls_app_runtime, bls_platform_runtime;

-- 3) Vendor payout destination master data. Never store a full bank account number here;
-- provider_reference points to the encrypted/tokenized record in the payout provider/vault.
CREATE TABLE IF NOT EXISTS public.vendor_payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vpayout_' || replace(gen_random_uuid()::text,'-','')),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  provider text NOT NULL DEFAULT 'bank_transfer',
  provider_reference text NOT NULL,
  display_label text NOT NULL,
  masked_account text NOT NULL,
  account_holder text NOT NULL,
  bic text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','disabled')),
  verified_by uuid NULL REFERENCES public.users(id),
  verified_at timestamptz NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_reference <> ''),
  CHECK (masked_account <> ''),
  CHECK ((status <> 'verified') OR (verified_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_payout_destination_active_provider_ref
  ON public.vendor_payout_destinations(vendor_id, provider_reference)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS vendor_payout_destination_verified_idx
  ON public.vendor_payout_destinations(vendor_id,effective_at DESC)
  WHERE status='verified' AND superseded_at IS NULL;

ALTER TABLE public.vendor_payout_destinations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_payout_destinations_scope ON public.vendor_payout_destinations;
CREATE POLICY vendor_payout_destinations_scope ON public.vendor_payout_destinations
  FOR SELECT
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );
DROP POLICY IF EXISTS vendor_payout_destinations_platform_write ON public.vendor_payout_destinations;
CREATE POLICY vendor_payout_destinations_platform_write ON public.vendor_payout_destinations
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT ON public.vendor_payout_destinations TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_payout_destinations TO bls_platform_runtime;

-- 4) Procurement is the supplier merchandise payable before KONTA MOY invoice set-off.
-- Customer delivery never belongs in this number. Vendor-performed delivery is explicit.
ALTER TABLE public.procurements
  ADD COLUMN IF NOT EXISTS vendor_delivery_compensation_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_discount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_discount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchandise_gross_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS accrued_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='procurements_vendor_delivery_comp_nonnegative'
      AND conrelid='public.procurements'::regclass
  ) THEN
    ALTER TABLE public.procurements ADD CONSTRAINT procurements_vendor_delivery_comp_nonnegative
      CHECK (vendor_delivery_compensation_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='procurements_discount_nonnegative'
      AND conrelid='public.procurements'::regclass
  ) THEN
    ALTER TABLE public.procurements ADD CONSTRAINT procurements_discount_nonnegative
      CHECK (vendor_discount_minor >= 0 AND platform_discount_minor >= 0);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS procurements_one_per_fulfilment
  ON public.procurements(fulfilment_order_id)
  WHERE fulfilment_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION bls_private.procurement_apply_commission_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_catalog_gross bigint;
  v_vendor_gross bigint;
  v_tax bigint;
  v_commission_net bigint;
  v_commission_tax bigint;
  v_commission_total bigint;
  v_vendor_discount bigint;
  v_platform_discount bigint;
BEGIN
  IF NEW.fulfilment_order_id IS NOT NULL THEN
    SELECT
      COALESCE(sum(ol.retail_unit_price_minor * ol.quantity),0),
      COALESCE(sum(
        CASE
          WHEN (ol.retail_unit_price_minor * ol.quantity) > 0
          THEN round(
            ol.tax_minor::numeric
            * GREATEST(0,(ol.retail_unit_price_minor * ol.quantity)-ol.vendor_discount_minor)
            / (ol.retail_unit_price_minor * ol.quantity)
          )::bigint
          ELSE 0
        END
      ),0),
      COALESCE(sum(ol.commission_net_minor),0),
      COALESCE(sum(ol.commission_tax_minor),0),
      COALESCE(sum(ol.commission_total_minor),0),
      COALESCE(sum(ol.vendor_discount_minor),0),
      COALESCE(sum(ol.platform_discount_minor),0)
    INTO v_catalog_gross, v_tax, v_commission_net, v_commission_tax,
         v_commission_total, v_vendor_discount, v_platform_discount
    FROM public.fulfilment_order_lines fol
    JOIN public.order_lines ol ON ol.id = fol.order_line_id
    WHERE fol.fulfilment_order_id = NEW.fulfilment_order_id
      AND ol.vendor_id = NEW.vendor_id;
  ELSE
    SELECT
      COALESCE(sum(ol.retail_unit_price_minor * ol.quantity),0),
      COALESCE(sum(
        CASE
          WHEN (ol.retail_unit_price_minor * ol.quantity) > 0
          THEN round(
            ol.tax_minor::numeric
            * GREATEST(0,(ol.retail_unit_price_minor * ol.quantity)-ol.vendor_discount_minor)
            / (ol.retail_unit_price_minor * ol.quantity)
          )::bigint
          ELSE 0
        END
      ),0),
      COALESCE(sum(ol.commission_net_minor),0),
      COALESCE(sum(ol.commission_tax_minor),0),
      COALESCE(sum(ol.commission_total_minor),0),
      COALESCE(sum(ol.vendor_discount_minor),0),
      COALESCE(sum(ol.platform_discount_minor),0)
    INTO v_catalog_gross, v_tax, v_commission_net, v_commission_tax,
         v_commission_total, v_vendor_discount, v_platform_discount
    FROM public.order_lines ol
    WHERE ol.order_id = NEW.order_id AND ol.vendor_id = NEW.vendor_id;
  END IF;

  v_vendor_gross := GREATEST(0, v_catalog_gross - v_vendor_discount);
  IF v_vendor_gross > 0 THEN
    NEW.merchandise_gross_minor := v_vendor_gross;
    NEW.vendor_discount_minor := v_vendor_discount;
    NEW.platform_discount_minor := v_platform_discount;
    NEW.supplier_tax_minor := LEAST(v_tax, v_vendor_gross);
    NEW.supplier_net_minor := v_vendor_gross - NEW.supplier_tax_minor;
    NEW.service_fee_net_minor := v_commission_net;
    NEW.service_fee_tax_minor := v_commission_tax;
    NEW.service_fee_minor := v_commission_total;

    -- Supplier liability is merchandise + explicitly contracted vendor delivery
    -- compensation +/- approved adjustments. Platform commission is collected by
    -- a separate KONTA MOY invoice and offset at settlement.
    NEW.shipping_reimbursement_minor := 0;
    NEW.payable_minor := GREATEST(
      0,
      v_vendor_gross
      + COALESCE(NEW.vendor_delivery_compensation_minor,0)
      + COALESCE(NEW.adjustment_minor,0)
    );
    NEW.financial_snapshot := jsonb_build_object(
      'catalogMerchandiseGrossMinor',v_catalog_gross,
      'vendorMerchandiseGrossMinor',v_vendor_gross,
      'vendorFundedDiscountMinor',v_vendor_discount,
      'platformFundedDiscountMinor',v_platform_discount,
      'expectedPlatformFeeGrossMinor',v_commission_total,
      'vendorDeliveryCompensationMinor',COALESCE(NEW.vendor_delivery_compensation_minor,0),
      'legacyShippingReimbursementMinor',0,
      'calculatedAt',now()
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS procurements_apply_commission_settlement ON public.procurements;
CREATE TRIGGER procurements_apply_commission_settlement
BEFORE INSERT OR UPDATE OF
  order_id, fulfilment_order_id, vendor_id, vendor_delivery_compensation_minor, adjustment_minor
ON public.procurements
FOR EACH ROW
EXECUTE FUNCTION bls_private.procurement_apply_commission_settlement();

-- 5) Delivery clearing is separate from vendor merchandise.
CREATE TABLE IF NOT EXISTS public.delivery_clearing_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('dclr_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  order_id uuid NOT NULL REFERENCES public.customer_orders(id),
  fulfilment_order_id uuid NOT NULL UNIQUE REFERENCES public.fulfilment_orders(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  mode fulfilment_mode NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  customer_delivery_charge_minor bigint NOT NULL DEFAULT 0,
  waived_delivery_minor bigint NOT NULL DEFAULT 0,
  provider_payable_minor bigint NOT NULL DEFAULT 0,
  vendor_delivery_compensation_minor bigint NOT NULL DEFAULT 0,
  platform_subsidy_minor bigint NOT NULL DEFAULT 0,
  refunded_minor bigint NOT NULL DEFAULT 0,
  variance_minor bigint NOT NULL DEFAULT 0,
  reconciliation_status text NOT NULL DEFAULT 'open'
    CHECK (reconciliation_status IN ('open','matched','reconciled','disputed')),
  provider_reference text NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    customer_delivery_charge_minor >= 0 AND waived_delivery_minor >= 0
    AND provider_payable_minor >= 0 AND vendor_delivery_compensation_minor >= 0
    AND platform_subsidy_minor >= 0 AND refunded_minor >= 0
  )
);
CREATE INDEX IF NOT EXISTS delivery_clearing_reconciliation_idx
  ON public.delivery_clearing_entries(reconciliation_status,created_at);

ALTER TABLE public.delivery_clearing_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_clearing_platform_scope ON public.delivery_clearing_entries;
CREATE POLICY delivery_clearing_platform_scope ON public.delivery_clearing_entries
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.delivery_clearing_entries TO bls_platform_runtime;

-- 6) PSP/payment clearing and chargeback classification. Provider fees are platform
-- expenses by default and cannot reduce vendor payout without an explicit adjustment.
CREATE TABLE IF NOT EXISTS public.payment_clearing_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('pclr_' || replace(gen_random_uuid()::text,'-','')),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  order_id uuid NULL REFERENCES public.customer_orders(id),
  event_kind text NOT NULL
    CHECK (event_kind IN ('capture','provider_fee','refund','chargeback','chargeback_reversal','bank_settlement')),
  currency char(3) NOT NULL DEFAULT 'EUR',
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  platform_expense_minor bigint NOT NULL DEFAULT 0 CHECK (platform_expense_minor >= 0),
  vendor_responsibility_minor bigint NOT NULL DEFAULT 0 CHECK (vendor_responsibility_minor >= 0),
  responsibility_reason text NULL,
  provider_reference text NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciliation_status text NOT NULL DEFAULT 'open'
    CHECK (reconciliation_status IN ('open','matched','reconciled','disputed')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id,event_kind,provider_reference)
);
ALTER TABLE public.payment_clearing_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_clearing_platform_scope ON public.payment_clearing_entries;
CREATE POLICY payment_clearing_platform_scope ON public.payment_clearing_entries
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payment_clearing_entries TO bls_platform_runtime;

-- 7) Audited vendor adjustments / receivables (returns, chargebacks, corrections).
CREATE TABLE IF NOT EXISTS public.vendor_finance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vadj_' || replace(gen_random_uuid()::text,'-','')),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  order_id uuid NULL REFERENCES public.customer_orders(id),
  procurement_id uuid NULL REFERENCES public.procurements(id),
  source_kind text NOT NULL
    CHECK (source_kind IN ('return','refund','chargeback','delivery','manual_correction','promotion')),
  source_public_id text NULL,
  direction text NOT NULL CHECK (direction IN ('credit_vendor','debit_vendor')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  reason_code text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','applied','rejected','reversed')),
  approved_by uuid NULL REFERENCES public.users(id),
  approved_at timestamptz NULL,
  settlement_line_id uuid NULL REFERENCES public.settlement_lines(id),
  created_by uuid NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_kind,source_public_id,vendor_id,direction)
);
CREATE INDEX IF NOT EXISTS vendor_finance_adjustments_vendor_status_idx
  ON public.vendor_finance_adjustments(vendor_id,status,created_at);

ALTER TABLE public.vendor_finance_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_finance_adjustments_scope ON public.vendor_finance_adjustments;
CREATE POLICY vendor_finance_adjustments_scope ON public.vendor_finance_adjustments
  FOR SELECT
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );
DROP POLICY IF EXISTS vendor_finance_adjustments_platform_write ON public.vendor_finance_adjustments;
CREATE POLICY vendor_finance_adjustments_platform_write ON public.vendor_finance_adjustments
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT ON public.vendor_finance_adjustments TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_finance_adjustments TO bls_platform_runtime;

-- 8) Idempotent event-driven supplier accrual.
CREATE OR REPLACE FUNCTION bls_private.ensure_procurement_for_fulfilment(p_fulfilment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_f public.fulfilment_orders%ROWTYPE;
  v_order public.customer_orders%ROWTYPE;
  v_payment_ok boolean;
  v_existing uuid;
  v_id uuid;
BEGIN
  SELECT * INTO v_f FROM public.fulfilment_orders WHERE id=p_fulfilment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_f.status::text NOT IN ('handed_over','delivered') THEN RETURN NULL; END IF;

  SELECT * INTO v_order FROM public.customer_orders WHERE id=v_f.order_id;
  SELECT EXISTS(
    SELECT 1 FROM public.payments p
    WHERE p.order_id=v_f.order_id
      AND p.status::text IN ('captured','partially_refunded','refunded','chargeback')
      AND p.captured_minor > 0
  ) INTO v_payment_ok;
  IF NOT v_payment_ok THEN RETURN NULL; END IF;

  SELECT p.id INTO v_existing
  FROM public.procurements p
  WHERE p.fulfilment_order_id=p_fulfilment_id;
  IF FOUND THEN RETURN v_existing; END IF;

  v_id := gen_random_uuid();
  INSERT INTO public.procurements(
    id,public_id,procurement_number,market_id,order_id,fulfilment_order_id,vendor_id,
    status,currency,supplier_net_minor,supplier_tax_minor,shipping_reimbursement_minor,
    service_fee_minor,service_fee_net_minor,service_fee_tax_minor,adjustment_minor,
    payable_minor,accrued_at,created_at,updated_at
  )
  VALUES(
    v_id,
    'proc_' || replace(v_id::text,'-',''),
    'KM-PROC-' || upper(replace(p_fulfilment_id::text,'-','')),
    v_order.market_id,v_f.order_id,v_f.id,v_f.vendor_id,
    'vendor_invoice_required','EUR',0,0,0,0,0,0,0,0,now(),now(),now()
  )
  ON CONFLICT (fulfilment_order_id) WHERE fulfilment_order_id IS NOT NULL
  DO UPDATE SET updated_at=EXCLUDED.updated_at
  RETURNING id INTO v_id;

  INSERT INTO public.delivery_clearing_entries(
    market_id,order_id,fulfilment_order_id,vendor_id,mode,
    customer_delivery_charge_minor,waived_delivery_minor,
    vendor_delivery_compensation_minor,platform_subsidy_minor,variance_minor,snapshot
  )
  VALUES(
    v_order.market_id,v_f.order_id,v_f.id,v_f.vendor_id,v_f.mode,
    v_f.delivery_charge_minor,v_f.waived_delivery_minor,
    0,v_f.waived_delivery_minor,v_f.delivery_charge_minor,
    jsonb_build_object('source','fulfilment_finalisation','recordedAt',now())
  )
  ON CONFLICT (fulfilment_order_id) DO NOTHING;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION bls_private.ensure_procurement_for_fulfilment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.ensure_procurement_for_fulfilment(uuid)
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.finance_accrue_on_fulfilment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status::text IN ('handed_over','delivered')
     AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM bls_private.ensure_procurement_for_fulfilment(NEW.id);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS finance_accrue_fulfilment ON public.fulfilment_orders;
CREATE TRIGGER finance_accrue_fulfilment
AFTER INSERT OR UPDATE OF status ON public.fulfilment_orders
FOR EACH ROW EXECUTE FUNCTION bls_private.finance_accrue_on_fulfilment();

CREATE OR REPLACE FUNCTION bls_private.finance_accrue_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_f record;
BEGIN
  IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status::text IN ('captured','partially_refunded','refunded','chargeback')
     AND NEW.captured_minor > 0
     AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.captured_minor IS DISTINCT FROM NEW.captured_minor) THEN
    FOR v_f IN
      SELECT fo.id FROM public.fulfilment_orders fo
      WHERE fo.order_id=NEW.order_id AND fo.status::text IN ('handed_over','delivered')
    LOOP
      PERFORM bls_private.ensure_procurement_for_fulfilment(v_f.id);
    END LOOP;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS finance_accrue_payment ON public.payments;
CREATE TRIGGER finance_accrue_payment
AFTER INSERT OR UPDATE OF status,captured_minor ON public.payments
FOR EACH ROW EXECUTE FUNCTION bls_private.finance_accrue_on_payment();

-- Explicit backfill function for controlled migration/testing. It is never executed by
-- this migration; an operator must call it deliberately after validation.
CREATE OR REPLACE FUNCTION bls_private.backfill_missing_procurements(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_f record;
  v_count integer := 0;
  v_before uuid;
BEGIN
  IF NOT bls_private.is_platform_runtime() THEN
    RAISE EXCEPTION 'Platform runtime required';
  END IF;
  FOR v_f IN
    SELECT fo.id
    FROM public.fulfilment_orders fo
    WHERE fo.status::text IN ('handed_over','delivered')
      AND NOT EXISTS(SELECT 1 FROM public.procurements p WHERE p.fulfilment_order_id=fo.id)
      AND EXISTS(
        SELECT 1 FROM public.payments pay
        WHERE pay.order_id=fo.order_id
          AND pay.status::text IN ('captured','partially_refunded','refunded','chargeback')
          AND pay.captured_minor > 0
      )
    ORDER BY fo.created_at
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,500),5000))
  LOOP
    v_before := bls_private.ensure_procurement_for_fulfilment(v_f.id);
    IF v_before IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION bls_private.backfill_missing_procurements(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.backfill_missing_procurements(integer) TO bls_platform_runtime;

-- 9) Settlement is the only place where KONTA MOY invoices are offset.
ALTER TABLE public.settlement_lines
  ADD COLUMN IF NOT EXISTS platform_invoice_offset_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_receivable_offset_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_destination_id uuid NULL REFERENCES public.vendor_payout_destinations(id),
  ADD COLUMN IF NOT EXISTS payout_destination_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION bls_private.prepare_settlement_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_proc public.procurements%ROWTYPE;
  v_destination record;
  v_invoice_offset bigint := 0;
  v_expected_fee bigint := 0;
  v_receivable_offset bigint := 0;
BEGIN
  IF NEW.procurement_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_proc FROM public.procurements WHERE id=NEW.procurement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement procurement does not exist'; END IF;

  SELECT COALESCE(sum(pvii.settlement_offset_minor),0)
  INTO v_invoice_offset
  FROM public.platform_vendor_invoice_items pvii
  JOIN public.platform_vendor_invoices pvi ON pvi.id=pvii.invoice_id
  WHERE pvii.procurement_id=v_proc.id
    AND pvi.status='issued'
    AND pvi.payment_status IN ('unpaid','partially_paid')
    AND pvii.source_kind='commission';

  v_expected_fee := COALESCE(v_proc.service_fee_minor,0);
  IF v_expected_fee > 0 AND v_invoice_offset < v_expected_fee THEN
    RAISE EXCEPTION 'KONTA MOY commission invoice must be issued before settlement';
  END IF;

  SELECT COALESCE(sum(a.amount_minor),0)
  INTO v_receivable_offset
  FROM public.vendor_finance_adjustments a
  WHERE a.vendor_id=NEW.vendor_id
    AND a.direction='debit_vendor'
    AND a.status='approved'
    AND a.settlement_line_id IS NULL;

  SELECT d.*
  INTO v_destination
  FROM public.vendor_payout_destinations d
  WHERE d.vendor_id=NEW.vendor_id
    AND d.status='verified'
    AND d.superseded_at IS NULL
    AND d.effective_at <= now()
  ORDER BY d.effective_at DESC,d.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified vendor payout destination is required before settlement';
  END IF;

  NEW.payable_minor := v_proc.payable_minor;
  NEW.platform_invoice_offset_minor := LEAST(v_invoice_offset, NEW.payable_minor);
  NEW.vendor_receivable_offset_minor :=
    LEAST(v_receivable_offset, GREATEST(0,NEW.payable_minor-NEW.platform_invoice_offset_minor));
  NEW.final_minor := GREATEST(
    0,
    NEW.payable_minor
    + COALESCE(NEW.adjustment_minor,0)
    - NEW.platform_invoice_offset_minor
    - NEW.vendor_receivable_offset_minor
  );
  NEW.payout_destination_id := v_destination.id;
  NEW.payout_destination_snapshot := jsonb_build_object(
    'publicId',v_destination.public_id,
    'provider',v_destination.provider,
    'providerReference',v_destination.provider_reference,
    'displayLabel',v_destination.display_label,
    'maskedAccount',v_destination.masked_account,
    'accountHolder',v_destination.account_holder,
    'verifiedAt',v_destination.verified_at
  );
  NEW.calculation_snapshot := jsonb_build_object(
    'supplierPayableMinor',NEW.payable_minor,
    'platformInvoiceOffsetMinor',NEW.platform_invoice_offset_minor,
    'vendorReceivableOffsetMinor',NEW.vendor_receivable_offset_minor,
    'lineAdjustmentMinor',COALESCE(NEW.adjustment_minor,0),
    'finalPayoutMinor',NEW.final_minor,
    'calculatedAt',now()
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS settlement_line_prepare_finance ON public.settlement_lines;
CREATE TRIGGER settlement_line_prepare_finance
BEFORE INSERT ON public.settlement_lines
FOR EACH ROW EXECUTE FUNCTION bls_private.prepare_settlement_line();

-- Apply offsets only when a batch is actually marked paid.
CREATE OR REPLACE FUNCTION bls_private.apply_paid_settlement_offsets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.platform_vendor_invoices pvi
    SET paid_minor = LEAST(
          pvi.gross_minor,
          pvi.paid_minor + x.offset_minor
        ),
        payment_status = CASE
          WHEN pvi.paid_minor + x.offset_minor >= pvi.gross_minor THEN 'offset'
          ELSE 'partially_paid'
        END,
        updated_at=now()
    FROM (
      SELECT pvii.invoice_id,COALESCE(sum(pvii.settlement_offset_minor),0) AS offset_minor
      FROM public.settlement_lines sl
      JOIN public.platform_vendor_invoice_items pvii
        ON pvii.procurement_id=sl.procurement_id AND pvii.source_kind='commission'
      WHERE sl.batch_id=NEW.id
      GROUP BY pvii.invoice_id
    ) x
    WHERE pvi.id=x.invoice_id;

    UPDATE public.vendor_finance_adjustments a
    SET status='applied',updated_at=now()
    FROM public.settlement_lines sl
    WHERE sl.batch_id=NEW.id
      AND a.vendor_id=sl.vendor_id
      AND a.direction='debit_vendor'
      AND a.status='approved'
      AND a.settlement_line_id IS NULL
      AND sl.vendor_receivable_offset_minor > 0;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS settlement_apply_paid_offsets ON public.settlement_batches;
CREATE TRIGGER settlement_apply_paid_offsets
AFTER UPDATE OF status ON public.settlement_batches
FOR EACH ROW EXECUTE FUNCTION bls_private.apply_paid_settlement_offsets();

-- 10) A finance summary view for vendor/admin dashboards. Customer delivery is shown
-- separately and is never included in vendor merchandise payable.
CREATE OR REPLACE VIEW public.vendor_finance_summary_v1
WITH (security_invoker=true)
AS
SELECT
  v.id AS vendor_id,
  v.public_id AS vendor_public_id,
  COALESCE(sum(p.merchandise_gross_minor) FILTER (WHERE p.status::text <> 'reversed'),0)::bigint AS merchandise_gross_minor,
  COALESCE(sum(p.service_fee_minor) FILTER (WHERE p.status::text <> 'reversed'),0)::bigint AS expected_platform_fee_minor,
  COALESCE(sum(p.vendor_delivery_compensation_minor) FILTER (WHERE p.status::text <> 'reversed'),0)::bigint AS vendor_delivery_compensation_minor,
  COALESCE(sum(p.adjustment_minor) FILTER (WHERE p.status::text <> 'reversed'),0)::bigint AS procurement_adjustment_minor,
  COALESCE(sum(p.payable_minor) FILTER (WHERE p.status::text IN ('approved','payable')),0)::bigint AS supplier_payable_minor,
  COALESCE((
    SELECT sum(sl.final_minor)
    FROM public.settlement_lines sl
    JOIN public.settlement_batches sb ON sb.id=sl.batch_id
    WHERE sl.vendor_id=v.id AND sb.status IN ('draft','approval_required','approved')
  ),0)::bigint AS scheduled_payout_minor,
  COALESCE((
    SELECT sum(sl.final_minor)
    FROM public.settlement_lines sl
    JOIN public.settlement_batches sb ON sb.id=sl.batch_id
    WHERE sl.vendor_id=v.id AND sb.status='paid'
  ),0)::bigint AS paid_minor
FROM public.vendor_businesses v
LEFT JOIN public.procurements p ON p.vendor_id=v.id
GROUP BY v.id,v.public_id;

GRANT SELECT ON public.vendor_finance_summary_v1 TO bls_app_runtime,bls_platform_runtime;

COMMIT;
