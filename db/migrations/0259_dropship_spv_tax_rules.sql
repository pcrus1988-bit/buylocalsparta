-- KONTA MOY — governed 24% VAT rule for approved dropship suppliers and SPV gift-card fiscal linkage.
BEGIN;

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS voucher_type text NOT NULL DEFAULT 'single_purpose',
  ADD COLUMN IF NOT EXISTS voucher_vat_rate_bps integer NOT NULL DEFAULT 2400,
  ADD COLUMN IF NOT EXISTS voucher_tax_country char(2) NOT NULL DEFAULT 'GR';

ALTER TABLE public.gift_cards
  DROP CONSTRAINT IF EXISTS gift_cards_voucher_type_check,
  DROP CONSTRAINT IF EXISTS gift_cards_voucher_vat_rate_check,
  DROP CONSTRAINT IF EXISTS gift_cards_voucher_country_check;

ALTER TABLE public.gift_cards
  ADD CONSTRAINT gift_cards_voucher_type_check
    CHECK (voucher_type IN ('single_purpose','multi_purpose')),
  ADD CONSTRAINT gift_cards_voucher_vat_rate_check
    CHECK (voucher_vat_rate_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT gift_cards_voucher_country_check
    CHECK (voucher_tax_country ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.gift_cards.voucher_type IS
  'VAT voucher classification. KONTA MOY cards are currently governed as single-purpose vouchers.';
COMMENT ON COLUMN public.gift_cards.voucher_vat_rate_bps IS
  'VAT rate known at SPV issue time. Current KONTA MOY SPV scope is 24% (2400 bps).';
COMMENT ON COLUMN public.gift_cards.voucher_tax_country IS
  'Place-of-taxation country known at SPV issue time; current SPV scope is Greece (GR).';

ALTER TABLE public.tax_documents
  ADD COLUMN IF NOT EXISTS gift_card_id uuid REFERENCES public.gift_cards(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS tax_documents_gift_card_issue_uidx
  ON public.tax_documents(gift_card_id)
  WHERE gift_card_id IS NOT NULL;

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
    encode(digest(
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

DROP TRIGGER IF EXISTS dropship_supplier_offer_vat_profile_trg
  ON public.dropship_supplier_offers;

CREATE TRIGGER dropship_supplier_offer_vat_profile_trg
AFTER INSERT OR UPDATE OF supplier_id,vendor_offer_id
ON public.dropship_supplier_offers
FOR EACH ROW
EXECUTE FUNCTION bls_private.ensure_governed_dropship_vat_profile();

WITH approved_policy AS (
  SELECT DISTINCT ON (p.market_id)
         p.market_id,p.version,COALESCE(p.effective_from,current_date) AS effective_from
    FROM public.accounting_tax_policies p
   WHERE p.status='approved'
   ORDER BY p.market_id,p.approved_at DESC NULLS LAST,p.created_at DESC
),
target AS (
  SELECT dso.vendor_offer_id,vo.market_id,vo.canonical_variant_id,ds.code,
         ap.version,ap.effective_from
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN approved_policy ap ON ap.market_id=vo.market_id
   WHERE ds.code IN ('nova_brandsgateway','symphonya')
)
UPDATE public.vendor_offers vo
   SET supplier_tax_rate_bps=2400,
       updated_at=CASE WHEN vo.supplier_tax_rate_bps IS DISTINCT FROM 2400 THEN now() ELSE vo.updated_at END
  FROM target t
 WHERE vo.id=t.vendor_offer_id
   AND vo.supplier_tax_rate_bps IS DISTINCT FROM 2400;

WITH target AS (
  SELECT DISTINCT vo.canonical_variant_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
   WHERE ds.code IN ('nova_brandsgateway','symphonya')
)
UPDATE public.canonical_variants cv
   SET tax_rate_bps=2400,
       updated_at=now()
  FROM target t
 WHERE cv.id=t.canonical_variant_id
   AND cv.tax_rate_bps IS DISTINCT FROM 2400;

WITH approved_policy AS (
  SELECT DISTINCT ON (p.market_id)
         p.market_id,p.version,COALESCE(p.effective_from,current_date) AS effective_from
    FROM public.accounting_tax_policies p
   WHERE p.status='approved'
   ORDER BY p.market_id,p.approved_at DESC NULLS LAST,p.created_at DESC
),
target AS (
  SELECT DISTINCT dso.vendor_offer_id,vo.market_id,ds.code,ap.version,ap.effective_from
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN approved_policy ap ON ap.market_id=vo.market_id
   WHERE ds.code IN ('nova_brandsgateway','symphonya')
)
INSERT INTO public.product_tax_profiles(
  market_id,vendor_offer_id,vat_category,vat_rate_bps,vat_exemption_category,
  effective_from,effective_until,accountant_approved,approval_version,
  approved_at,approval_notes,profile_hash
)
SELECT
  t.market_id,t.vendor_offer_id,1,2400,NULL,
  t.effective_from,NULL,true,t.version,
  now(),
  'Automatic governed supplier VAT rule: ' || t.code ||
    ' products are configured at Greek VAT 24%. Source: platform-owner tax classification 2026-09-20.',
  encode(digest(
    'dropship24|' || t.vendor_offer_id::text || '|' || t.version || '|' || t.effective_from::text,
    'sha256'
  ),'hex')
FROM target t
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

COMMIT;
