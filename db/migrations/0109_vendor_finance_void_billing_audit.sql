-- KONTA MOY — preserve void draft invoice history while freeing commission sources for re-billing.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_vendor_invoice_void_item_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_item_id uuid NOT NULL,
  original_item_public_id text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.platform_vendor_invoices(id),
  invoice_public_id text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  source_kind text NOT NULL,
  source_public_id text NOT NULL,
  procurement_id uuid NULL REFERENCES public.procurements(id),
  agreement_id uuid NULL REFERENCES public.vendor_commercial_agreements(id),
  service_date date NULL,
  service_period_start date NULL,
  service_period_end date NULL,
  description text NOT NULL,
  vat_rate_bps integer NOT NULL,
  net_minor bigint NOT NULL,
  tax_minor bigint NOT NULL,
  gross_minor bigint NOT NULL,
  settlement_offset_minor bigint NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  original_created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(original_item_id)
);
CREATE INDEX IF NOT EXISTS platform_vendor_invoice_void_archive_invoice_idx
  ON public.platform_vendor_invoice_void_item_archive(invoice_id,archived_at);
CREATE INDEX IF NOT EXISTS platform_vendor_invoice_void_archive_source_idx
  ON public.platform_vendor_invoice_void_item_archive(source_kind,source_public_id);

ALTER TABLE public.platform_vendor_invoice_void_item_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_vendor_invoice_void_archive_platform_scope
  ON public.platform_vendor_invoice_void_item_archive;
CREATE POLICY platform_vendor_invoice_void_archive_platform_scope
  ON public.platform_vendor_invoice_void_item_archive
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
GRANT SELECT,INSERT ON public.platform_vendor_invoice_void_item_archive TO bls_platform_runtime;

-- An invoice already issued to AADE cannot be converted into an internal 'void' draft.
-- It must follow the governed cancellation / credit-document process.
CREATE OR REPLACE FUNCTION bls_private.guard_platform_vendor_invoice_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status='void' AND OLD.status IS DISTINCT FROM NEW.status AND OLD.status='issued' THEN
    RAISE EXCEPTION 'Issued KONTA MOY invoice cannot be voided internally; use fiscal cancellation or credit note';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS platform_vendor_invoice_void_guard ON public.platform_vendor_invoices;
CREATE TRIGGER platform_vendor_invoice_void_guard
BEFORE UPDATE OF status ON public.platform_vendor_invoices
FOR EACH ROW EXECUTE FUNCTION bls_private.guard_platform_vendor_invoice_void();

-- Draft/prepared invoice items are archived before their live source reservation is
-- released. This preserves the full audit snapshot while allowing a corrected invoice
-- draft to reuse the unique source_kind/source_public_id pair.
CREATE OR REPLACE FUNCTION bls_private.archive_void_platform_vendor_invoice_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.status='void' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.platform_vendor_invoice_void_item_archive(
      original_item_id,original_item_public_id,invoice_id,invoice_public_id,vendor_id,
      source_kind,source_public_id,procurement_id,agreement_id,service_date,
      service_period_start,service_period_end,description,vat_rate_bps,
      net_minor,tax_minor,gross_minor,settlement_offset_minor,source_snapshot,
      original_created_at,archived_at
    )
    SELECT i.id,i.public_id,NEW.id,NEW.public_id,NEW.vendor_id,
      i.source_kind,i.source_public_id,i.procurement_id,i.agreement_id,i.service_date,
      i.service_period_start,i.service_period_end,i.description,i.vat_rate_bps,
      i.net_minor,i.tax_minor,i.gross_minor,i.settlement_offset_minor,i.source_snapshot,
      i.created_at,now()
    FROM public.platform_vendor_invoice_items i
    WHERE i.invoice_id=NEW.id
    ON CONFLICT (original_item_id) DO NOTHING;

    DELETE FROM public.platform_vendor_invoice_items WHERE invoice_id=NEW.id;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS platform_vendor_invoice_void_item_archive ON public.platform_vendor_invoices;
CREATE TRIGGER platform_vendor_invoice_void_item_archive
AFTER UPDATE OF status ON public.platform_vendor_invoices
FOR EACH ROW EXECUTE FUNCTION bls_private.archive_void_platform_vendor_invoice_items();

-- Backfill any previously voided internal invoices so their source reservations no longer
-- block re-drafting. No issued invoice is changed.
INSERT INTO public.platform_vendor_invoice_void_item_archive(
  original_item_id,original_item_public_id,invoice_id,invoice_public_id,vendor_id,
  source_kind,source_public_id,procurement_id,agreement_id,service_date,
  service_period_start,service_period_end,description,vat_rate_bps,
  net_minor,tax_minor,gross_minor,settlement_offset_minor,source_snapshot,
  original_created_at,archived_at
)
SELECT i.id,i.public_id,pvi.id,pvi.public_id,pvi.vendor_id,
  i.source_kind,i.source_public_id,i.procurement_id,i.agreement_id,i.service_date,
  i.service_period_start,i.service_period_end,i.description,i.vat_rate_bps,
  i.net_minor,i.tax_minor,i.gross_minor,i.settlement_offset_minor,i.source_snapshot,
  i.created_at,now()
FROM public.platform_vendor_invoice_items i
JOIN public.platform_vendor_invoices pvi ON pvi.id=i.invoice_id
WHERE pvi.status='void'
ON CONFLICT (original_item_id) DO NOTHING;

DELETE FROM public.platform_vendor_invoice_items i
USING public.platform_vendor_invoices pvi
WHERE pvi.id=i.invoice_id AND pvi.status='void';

-- Strengthen the commission-reversal approval guard: the supporting fiscal credit must
-- be AADE accepted, belong to the same vendor, and use a B2B credit-note invoice type.
CREATE OR REPLACE FUNCTION bls_private.guard_vendor_finance_adjustment_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_doc_status text;
  v_transmission_status text;
  v_doc_vendor_id uuid;
  v_invoice_type_code text;
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.requires_platform_credit_document THEN
    IF NEW.platform_credit_tax_document_id IS NULL THEN
      RAISE EXCEPTION 'Platform credit document is required before approving commission reversal';
    END IF;
    SELECT td.status::text,td.transmission_status::text,td.vendor_id,td.invoice_type_code
    INTO v_doc_status,v_transmission_status,v_doc_vendor_id,v_invoice_type_code
    FROM public.tax_documents td WHERE td.id=NEW.platform_credit_tax_document_id;
    IF NOT FOUND OR v_doc_status <> 'issued' OR v_transmission_status <> 'accepted' THEN
      RAISE EXCEPTION 'Platform credit document must be issued and accepted before approval';
    END IF;
    IF v_doc_vendor_id IS DISTINCT FROM NEW.vendor_id THEN
      RAISE EXCEPTION 'Platform credit document vendor does not match finance adjustment vendor';
    END IF;
    IF COALESCE(v_invoice_type_code,'') NOT IN ('5.1','5.2') THEN
      RAISE EXCEPTION 'Commission reversal requires B2B credit note invoice type 5.1 or 5.2';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

COMMIT;
