-- Buy Local Sparta — AADE myDATA ERP transmission bridge.
-- Stores accountant-approved tax document snapshots and transport attempts without inventing tax mappings.
BEGIN;

ALTER TABLE tax_documents
  ADD COLUMN IF NOT EXISTS mapping_version text,
  ADD COLUMN IF NOT EXISTS invoice_type_code text,
  ADD COLUMN IF NOT EXISTS document_series text,
  ADD COLUMN IF NOT EXISTS document_aa text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS aade_uid text,
  ADD COLUMN IF NOT EXISTS aade_qr_url text,
  ADD COLUMN IF NOT EXISTS aade_cancellation_mark text,
  ADD COLUMN IF NOT EXISTS transmission_status text NOT NULL DEFAULT 'not_ready'
    CHECK (transmission_status IN ('not_ready','ready','transmitting','accepted','rejected','cancelled','manual_review')),
  ADD COLUMN IF NOT EXISTS last_transmission_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS tax_documents_aade_mark_uidx
  ON tax_documents(aade_mark) WHERE aade_mark IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_documents_aade_uid_uidx
  ON tax_documents(aade_uid) WHERE aade_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS tax_documents_transmission_status_idx
  ON tax_documents(transmission_status, created_at);

CREATE TABLE mydata_transmission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  tax_document_id uuid NOT NULL REFERENCES tax_documents(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('send_invoice','cancel_invoice','income_classification','expense_classification','reconcile')),
  attempt_key text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test','production')),
  spec_version text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','accepted','rejected','failed','manual_review')),
  http_summary text,
  response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(tax_document_id, operation, attempt_key)
);
CREATE INDEX mydata_attempts_document_idx ON mydata_transmission_attempts(tax_document_id, started_at DESC);
CREATE INDEX mydata_attempts_status_idx ON mydata_transmission_attempts(status, started_at DESC);

ALTER TABLE mydata_transmission_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY mydata_attempts_platform_only ON mydata_transmission_attempts
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

COMMIT;
