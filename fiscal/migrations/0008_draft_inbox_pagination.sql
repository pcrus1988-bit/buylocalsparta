-- Bounded merchant draft inbox keyset pagination (organization + timestamp + UUID).
-- Index only; never enables issuance or changes existing document status.
BEGIN;
CREATE INDEX IF NOT EXISTS fiscal_document_intakes_inbox_cursor_idx
  ON fiscal_document_intakes (organization_id, created_at DESC, id DESC)
  WHERE status='draft';
COMMIT;
