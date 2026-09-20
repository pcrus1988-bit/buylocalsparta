-- KONTA MOY — fiscal capture for paid 24% single-purpose Gift Card issuance.
BEGIN;

ALTER TABLE public.tax_documents
  DROP CONSTRAINT IF EXISTS tax_documents_type_check;

ALTER TABLE public.tax_documents
  ADD CONSTRAINT tax_documents_type_check
  CHECK (type = ANY (ARRAY[
    'pending_customer_sale'::text,
    'retail_receipt'::text,
    'customer_invoice'::text,
    'retail_credit'::text,
    'supplier_invoice'::text,
    'supplier_credit'::text,
    'platform_service_invoice'::text,
    'dispatch_document'::text,
    'gift_card_spv_issue'::text
  ]));

ALTER TABLE public.tax_documents
  DROP CONSTRAINT IF EXISTS tax_documents_spv_issue_link_check;

ALTER TABLE public.tax_documents
  ADD CONSTRAINT tax_documents_spv_issue_link_check
  CHECK (
    type <> 'gift_card_spv_issue'
    OR (gift_card_id IS NOT NULL AND order_id IS NULL)
  );

CREATE OR REPLACE FUNCTION bls_private.capture_paid_spv_gift_card_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  card record;
  gross_value bigint;
  vat_value bigint;
  net_value bigint;
BEGIN
  IF NEW.entry_type <> 'issue' THEN
    RETURN NEW;
  END IF;

  SELECT gc.id,gc.public_id,gc.market_id,gc.issue_channel,gc.initial_value_minor,
         gc.voucher_type,gc.voucher_vat_rate_bps,gc.voucher_tax_country,gc.code_suffix
    INTO card
    FROM public.gift_cards gc
   WHERE gc.id=NEW.gift_card_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF card.issue_channel <> 'vendor_physical'
     OR card.voucher_type <> 'single_purpose'
     OR card.voucher_tax_country <> 'GR'
     OR card.voucher_vat_rate_bps <> 2400
     OR COALESCE((NEW.metadata->>'cashPaymentConfirmed')::boolean,false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  gross_value := NEW.amount_minor;
  IF gross_value <= 0 OR gross_value <> card.initial_value_minor THEN
    RAISE EXCEPTION 'Paid SPV Gift Card issue amount must equal its initial face value';
  END IF;

  vat_value := round(
    gross_value::numeric * card.voucher_vat_rate_bps::numeric
    / (10000 + card.voucher_vat_rate_bps)::numeric
  )::bigint;
  net_value := gross_value - vat_value;

  INSERT INTO public.tax_documents(
    market_id,gift_card_id,type,document_number,provider,currency,
    net_minor,tax_minor,gross_minor,status,payload_snapshot,
    transmission_status,created_at
  ) VALUES (
    card.market_id,card.id,'gift_card_spv_issue',NULL,'aade_mydata','EUR',
    net_value,vat_value,gross_value,'pending',
    jsonb_build_object(
      'lifecycle','pending_spv_issue_fiscalization',
      'capturedFrom','gift_card_issue_ledger',
      'capturedAt',NEW.created_at,
      'giftCard',jsonb_build_object(
        'id',card.public_id,
        'codeSuffix',card.code_suffix,
        'voucherType',card.voucher_type,
        'vatRateBps',card.voucher_vat_rate_bps,
        'taxCountry',card.voucher_tax_country,
        'issueChannel',card.issue_channel,
        'issueLedgerId',NEW.public_id
      ),
      'payment',jsonb_build_object(
        'processor','OFFLINE',
        'processorMethod','CASH',
        'considerationMinor',gross_value,
        'cashPaymentConfirmed',true
      ),
      'fiscalBasis',jsonb_build_object(
        'rule','single_purpose_voucher_taxed_on_transfer',
        'redemptionCreatesIndependentTaxableTransaction',false
      )
    ),
    'not_ready',NEW.created_at
  )
  ON CONFLICT (gift_card_id) WHERE gift_card_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS gift_card_paid_spv_issue_fiscal_capture_trg
  ON public.gift_card_ledger;

CREATE TRIGGER gift_card_paid_spv_issue_fiscal_capture_trg
AFTER INSERT ON public.gift_card_ledger
FOR EACH ROW
EXECUTE FUNCTION bls_private.capture_paid_spv_gift_card_issue();

WITH candidates AS (
  SELECT gc.id AS gift_card_id,gc.public_id AS gift_card_public_id,gc.market_id,
         gc.initial_value_minor,gc.code_suffix,gc.voucher_type,gc.voucher_vat_rate_bps,
         gc.voucher_tax_country,gc.issue_channel,
         gcl.public_id AS ledger_public_id,gcl.amount_minor,gcl.created_at,
         round(
           gcl.amount_minor::numeric * gc.voucher_vat_rate_bps::numeric
           / (10000 + gc.voucher_vat_rate_bps)::numeric
         )::bigint AS vat_minor
    FROM public.gift_cards gc
    JOIN public.gift_card_ledger gcl
      ON gcl.gift_card_id=gc.id AND gcl.entry_type='issue'
   WHERE gc.issue_channel='vendor_physical'
     AND gc.voucher_type='single_purpose'
     AND gc.voucher_tax_country='GR'
     AND gc.voucher_vat_rate_bps=2400
     AND COALESCE((gcl.metadata->>'cashPaymentConfirmed')::boolean,false) IS TRUE
     AND gcl.amount_minor=gc.initial_value_minor
)
INSERT INTO public.tax_documents(
  market_id,gift_card_id,type,document_number,provider,currency,
  net_minor,tax_minor,gross_minor,status,payload_snapshot,
  transmission_status,created_at
)
SELECT
  c.market_id,c.gift_card_id,'gift_card_spv_issue',NULL,'aade_mydata','EUR',
  c.amount_minor-c.vat_minor,c.vat_minor,c.amount_minor,'pending',
  jsonb_build_object(
    'lifecycle','pending_spv_issue_fiscalization',
    'capturedFrom','gift_card_issue_ledger_backfill',
    'capturedAt',c.created_at,
    'giftCard',jsonb_build_object(
      'id',c.gift_card_public_id,
      'codeSuffix',c.code_suffix,
      'voucherType',c.voucher_type,
      'vatRateBps',c.voucher_vat_rate_bps,
      'taxCountry',c.voucher_tax_country,
      'issueChannel',c.issue_channel,
      'issueLedgerId',c.ledger_public_id
    ),
    'payment',jsonb_build_object(
      'processor','OFFLINE',
      'processorMethod','CASH',
      'considerationMinor',c.amount_minor,
      'cashPaymentConfirmed',true
    ),
    'fiscalBasis',jsonb_build_object(
      'rule','single_purpose_voucher_taxed_on_transfer',
      'redemptionCreatesIndependentTaxableTransaction',false
    )
  ),
  'not_ready',c.created_at
FROM candidates c
ON CONFLICT (gift_card_id) WHERE gift_card_id IS NOT NULL
DO NOTHING;

COMMIT;
