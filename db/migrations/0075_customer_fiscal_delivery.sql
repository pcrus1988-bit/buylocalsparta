-- Buy Local Sparta — durable customer fiscal capture and delivery state.
-- A successful payment may create a pending_customer_sale record, but it cannot be
-- promoted to a fiscal type or transmitted until an accountant-approved myDATA mapping exists.
BEGIN;

ALTER TABLE tax_documents DROP CONSTRAINT IF EXISTS tax_documents_type_check;
ALTER TABLE tax_documents
  ADD CONSTRAINT tax_documents_type_check CHECK (type = ANY (ARRAY[
    'pending_customer_sale'::text,
    'retail_receipt'::text,
    'customer_invoice'::text,
    'retail_credit'::text,
    'supplier_invoice'::text,
    'supplier_credit'::text,
    'platform_service_invoice'::text,
    'dispatch_document'::text
  ]));

ALTER TABLE tax_documents
  ADD COLUMN IF NOT EXISTS customer_email_status text NOT NULL DEFAULT 'not_sent'
    CHECK (customer_email_status IN ('not_sent','sending','sent','failed')),
  ADD COLUMN IF NOT EXISTS customer_email_provider_id text,
  ADD COLUMN IF NOT EXISTS customer_emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_email_error text;

-- Exactly one primary customer-sale fiscal lifecycle per order. Credit documents are separate.
CREATE UNIQUE INDEX IF NOT EXISTS tax_documents_customer_sale_order_uidx
  ON tax_documents(order_id)
  WHERE order_id IS NOT NULL
    AND type IN ('pending_customer_sale','retail_receipt','customer_invoice');

COMMIT;
