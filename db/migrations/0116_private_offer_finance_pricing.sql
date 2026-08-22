-- Preserve accepted Ask Local/private-offer commercial terms in the vendor-finance snapshot.
-- The 0105 trigger intentionally made the approved vendor offer the authoritative catalog
-- price source, but private-offer checkout is a governed exception: the customer has
-- explicitly accepted a lower/different price linked to the same assigned vendor offer.
BEGIN;

CREATE OR REPLACE FUNCTION bls_private.apply_offer_price_and_commission_to_order_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_offer record;
  v_private_offer record;
  v_terms record;
  v_order_at timestamptz;
  v_customer_unit_price_minor bigint;
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

  IF NEW.pricing_source = 'private_offer' THEN
    IF COALESCE(NEW.source_reference,'') = '' THEN
      RAISE EXCEPTION 'Private-offer order line requires a source reference';
    END IF;

    SELECT po.id,
           po.price_minor,
           po.currency,
           po.status::text AS status,
           cr.canonical_variant_id,
           cr.assigned_vendor_id,
           cr.assigned_offer_id,
           cr.requested_quantity
    INTO v_private_offer
    FROM public.private_offers po
    JOIN public.counteroffer_requests cr ON cr.id = po.counteroffer_request_id
    WHERE po.public_id = NEW.source_reference
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Private-offer source reference does not exist';
    END IF;
    IF v_private_offer.status NOT IN ('accepted','converted') THEN
      RAISE EXCEPTION 'Private offer is not accepted for checkout';
    END IF;
    IF v_private_offer.currency <> 'EUR' THEN
      RAISE EXCEPTION 'Private-offer currency is not supported';
    END IF;
    IF v_private_offer.canonical_variant_id IS DISTINCT FROM NEW.canonical_variant_id
       OR v_private_offer.assigned_vendor_id IS DISTINCT FROM NEW.vendor_id
       OR v_private_offer.assigned_offer_id IS DISTINCT FROM NEW.assigned_offer_id THEN
      RAISE EXCEPTION 'Private-offer source does not match order-line assignment';
    END IF;
    IF v_private_offer.requested_quantity <> NEW.quantity THEN
      RAISE EXCEPTION 'Private-offer quantity does not match accepted request';
    END IF;
    IF v_private_offer.price_minor IS NULL OR v_private_offer.price_minor < 30 THEN
      RAISE EXCEPTION 'Private-offer price is not valid for checkout';
    END IF;

    v_customer_unit_price_minor := v_private_offer.price_minor;
  ELSE
    v_customer_unit_price_minor := v_offer.customer_price_minor;
  END IF;

  SELECT COALESCE(o.created_at, now()) INTO v_order_at
  FROM public.customer_orders o WHERE o.id = NEW.order_id;

  SELECT * INTO v_terms
  FROM bls_private.vendor_commission_terms(NEW.vendor_id, COALESCE(v_order_at, now()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An effective individual vendor commercial agreement is required before checkout';
  END IF;

  -- In KONTA MOY's seller-of-record model the vendor merchandise entitlement is the
  -- customer merchandise gross before commission. For private offers that gross is the
  -- accepted negotiated price, not the normal catalog price of the assigned offer.
  NEW.retail_unit_price_minor := v_customer_unit_price_minor;
  NEW.supplier_unit_price_minor := v_customer_unit_price_minor;
  NEW.supplier_tax_rate_bps := v_offer.supplier_tax_rate_bps;

  v_catalog_gross := v_customer_unit_price_minor * NEW.quantity;
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
    'customerUnitPriceMinor', v_customer_unit_price_minor,
    'pricingSource', COALESCE(NEW.pricing_source,'catalog'),
    'sourceReference', NEW.source_reference,
    'vendorFundedDiscountMinor', COALESCE(NEW.vendor_discount_minor,0),
    'platformFundedDiscountMinor', COALESCE(NEW.platform_discount_minor,0)
  );
  NEW.product_snapshot :=
    COALESCE(NEW.product_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'customerUnitPriceMinor', v_customer_unit_price_minor,
      'pricingSource', COALESCE(NEW.pricing_source,'catalog'),
      'commissionAgreementId', v_terms.agreement_public_id
    );
  RETURN NEW;
END
$$;

COMMIT;
