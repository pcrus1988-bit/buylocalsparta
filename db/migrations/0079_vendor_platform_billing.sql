-- Buy Local Sparta — outbound vendor commission and fee invoicing.
-- Creates an auditable platform->vendor billing ledger without reusing incoming vendor_invoices.
BEGIN;

ALTER TABLE public.vendor_commercial_agreements
  ADD COLUMN IF NOT EXISTS fee_tax_mode text NOT NULL DEFAULT 'included',
  ADD COLUMN IF NOT EXISTS fee_tax_rate_bps integer NOT NULL DEFAULT 2400;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='vendor_commercial_agreements_fee_tax_mode_check'
      AND conrelid='public.vendor_commercial_agreements'::regclass
  ) THEN
    ALTER TABLE public.vendor_commercial_agreements
      ADD CONSTRAINT vendor_commercial_agreements_fee_tax_mode_check
      CHECK (fee_tax_mode IN ('included','plus_vat','none'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='vendor_commercial_agreements_fee_tax_rate_bps_check'
      AND conrelid='public.vendor_commercial_agreements'::regclass
  ) THEN
    ALTER TABLE public.vendor_commercial_agreements
      ADD CONSTRAINT vendor_commercial_agreements_fee_tax_rate_bps_check
      CHECK (fee_tax_rate_bps BETWEEN 0 AND 10000);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.platform_vendor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('pvinv_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  agreement_id uuid NULL REFERENCES public.vendor_commercial_agreements(id),
  tax_document_id uuid NULL UNIQUE REFERENCES public.tax_documents(id),
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  net_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  gross_minor bigint NOT NULL DEFAULT 0,
  settlement_offset_minor bigint NOT NULL DEFAULT 0,
  collection_method text NOT NULL DEFAULT 'settlement_offset',
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_minor bigint NOT NULL DEFAULT 0,
  due_date date NULL,
  status text NOT NULL DEFAULT 'draft',
  vendor_email_status text NOT NULL DEFAULT 'not_sent',
  vendor_email_provider_id text NULL,
  vendor_emailed_at timestamptz NULL,
  vendor_email_error text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (billing_period_end >= billing_period_start),
  CHECK (net_minor >= 0 AND tax_minor >= 0 AND gross_minor >= 0),
  CHECK (gross_minor = net_minor + tax_minor),
  CHECK (settlement_offset_minor >= 0 AND settlement_offset_minor <= gross_minor),
  CHECK (paid_minor >= 0 AND paid_minor <= gross_minor),
  CHECK (collection_method IN ('settlement_offset','external_payment','mixed')),
  CHECK (payment_status IN ('unpaid','partially_paid','paid','offset')),
  CHECK (status IN ('draft','prepared','issued','void')),
  CHECK (vendor_email_status IN ('not_sent','sending','sent','failed'))
);

CREATE INDEX IF NOT EXISTS platform_vendor_invoices_vendor_period_idx
  ON public.platform_vendor_invoices(vendor_id,billing_period_end DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_vendor_invoices_status_idx
  ON public.platform_vendor_invoices(status,payment_status,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_vendor_invoices_tax_document_idx
  ON public.platform_vendor_invoices(tax_document_id) WHERE tax_document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_vendor_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('pvitem_' || replace(gen_random_uuid()::text,'-','')),
  invoice_id uuid NOT NULL REFERENCES public.platform_vendor_invoices(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_public_id text NOT NULL,
  procurement_id uuid NULL REFERENCES public.procurements(id),
  agreement_id uuid NULL REFERENCES public.vendor_commercial_agreements(id),
  service_date date NULL,
  service_period_start date NULL,
  service_period_end date NULL,
  description text NOT NULL,
  vat_rate_bps integer NOT NULL DEFAULT 2400,
  net_minor bigint NOT NULL,
  tax_minor bigint NOT NULL,
  gross_minor bigint NOT NULL,
  settlement_offset_minor bigint NOT NULL DEFAULT 0,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_kind IN ('commission','listing_fee','recurring_fee')),
  CHECK (vat_rate_bps BETWEEN 0 AND 10000),
  CHECK (net_minor >= 0 AND tax_minor >= 0 AND gross_minor >= 0),
  CHECK (gross_minor = net_minor + tax_minor),
  CHECK (settlement_offset_minor >= 0 AND settlement_offset_minor <= gross_minor),
  CHECK (service_period_end IS NULL OR service_period_start IS NOT NULL),
  CHECK (service_period_end IS NULL OR service_period_end >= service_period_start),
  UNIQUE(source_kind,source_public_id)
);

CREATE INDEX IF NOT EXISTS platform_vendor_invoice_items_invoice_idx
  ON public.platform_vendor_invoice_items(invoice_id,created_at);
CREATE INDEX IF NOT EXISTS platform_vendor_invoice_items_procurement_idx
  ON public.platform_vendor_invoice_items(procurement_id) WHERE procurement_id IS NOT NULL;

ALTER TABLE public.platform_vendor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_vendor_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.platform_vendor_invoices;
CREATE POLICY bls_platform_runtime_all ON public.platform_vendor_invoices
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.platform_vendor_invoice_items;
CREATE POLICY bls_platform_runtime_all ON public.platform_vendor_invoice_items
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT,INSERT,UPDATE,DELETE
  ON public.platform_vendor_invoices,public.platform_vendor_invoice_items
  TO bls_platform_runtime;

COMMIT;
