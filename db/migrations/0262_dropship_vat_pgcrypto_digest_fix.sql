-- Fix pgcrypto schema qualification in the governed dropship VAT trigger.
-- Supabase installs pgcrypto in the extensions schema in production, so an
-- unqualified digest() call can fail inside the trigger's restricted search_path.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.ensure_governed_dropship_vat_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  supplier_code text;
  offer_market_id uuid;
  canonical_id uuid;
  policy_version text;
  policy_effective_from date;
  profile_note text;
BEGIN
  SELECT ds.code,vo.market_id,vo.canonical_variant_id
    INTO supplier_code,offer_market_id,canonical_id
    FROM public.dropship_suppliers ds
    JOIN public.vendor_offers vo ON vo.id=NEW.vendor_offer_id
   WHERE ds.id=NEW.supplier_id;

  IF supplier_code NOT IN ('nova_brandsgateway','symphonya') THEN
    RETURN NEW;
  END IF;

  SELECT p.version,COALESCE(p.effective_from,current_date)
    INTO policy_version,policy_effective_from
    FROM public.accounting_tax_policies p
   WHERE p.market_id=offer_market_id
     AND p.status='approved'
   ORDER BY p.approved_at DESC NULLS LAST,p.created_at DESC
   LIMIT 1;

  IF policy_version IS NULL THEN
    RAISE EXCEPTION 'Approved accounting policy required before automatic dropship VAT profile assignment';
  END IF;

  UPDATE public.vendor_offers
     SET supplier_tax_rate_bps=2400,
         updated_at=CASE WHEN supplier_tax_rate_bps IS DISTINCT FROM 2400 THEN now() ELSE updated_at END
   WHERE id=NEW.vendor_offer_id;

  UPDATE public.canonical_variants
     SET tax_rate_bps=2400,
         updated_at=CASE WHEN tax_rate_bps IS DISTINCT FROM 2400 THEN now() ELSE updated_at END
   WHERE id=canonical_id;

  profile_note := 'Automatic governed supplier VAT rule: ' || supplier_code ||
    ' products are configured at Greek VAT 24%. Source: platform-owner tax classification 2026-09-20.';

  INSERT INTO public.product_tax_profiles(
    market_id,vendor_offer_id,vat_category,vat_rate_bps,vat_exemption_category,
    effective_from,effective_until,accountant_approved,approval_version,
    approved_at,approval_notes,profile_hash
  ) VALUES(
    offer_market_id,NEW.vendor_offer_id,1,2400,NULL,
    policy_effective_from,NULL,true,policy_version,
    now(),profile_note,
    encode(extensions.digest(
      'dropship24|' || NEW.vendor_offer_id::text || '|' || policy_version || '|' || policy_effective_from::text,
      'sha256'
    ),'hex')
  )
  ON CONFLICT (vendor_offer_id,effective_from)
    WHERE vendor_offer_id IS NOT NULL
  DO UPDATE SET
    vat_category=1,
    vat_rate_bps=2400,
    vat_exemption_category=NULL,
    effective_until=NULL,
    accountant_approved=true,
    approval_version=EXCLUDED.approval_version,
    approved_at=EXCLUDED.approved_at,
    approval_notes=EXCLUDED.approval_notes,
    profile_hash=EXCLUDED.profile_hash;

  RETURN NEW;
END
$$;

COMMIT;
