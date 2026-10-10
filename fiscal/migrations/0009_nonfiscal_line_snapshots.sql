-- Milestone 10: append-only, tenant-bound NON-FISCAL test line snapshots.
-- Contains user-supplied simulated rates, NOT approved tax classifications.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_document_intakes_org_id_unique
 ON fiscal_document_intakes(organization_id,id);
CREATE TABLE IF NOT EXISTS fiscal_document_intake_lines (
 organization_id uuid NOT NULL,
 draft_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 30),
 description text NOT NULL CHECK (length(description) BETWEEN 1 AND 160),
 quantity_milli integer NOT NULL CHECK(quantity_milli BETWEEN 1 AND 1000000),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor BETWEEN 0 AND 1000000000),
 vat_rate_bps integer NOT NULL CHECK(vat_rate_bps BETWEEN 0 AND 10000),
 discount_bps integer NOT NULL CHECK(discount_bps BETWEEN 0 AND 10000),
 before_discount_minor bigint NOT NULL CHECK(before_discount_minor BETWEEN 0 AND 1000000000000),
 discount_minor bigint NOT NULL CHECK(discount_minor BETWEEN 0 AND 1000000000000),
 net_minor bigint NOT NULL CHECK(net_minor BETWEEN 0 AND 1000000000000),
 vat_minor bigint NOT NULL CHECK(vat_minor BETWEEN 0 AND 1000000000000),
 gross_minor bigint NOT NULL CHECK(gross_minor BETWEEN 0 AND 1000000000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,draft_id,line_no),
 FOREIGN KEY(organization_id,draft_id)
  REFERENCES fiscal_document_intakes(organization_id,id) ON DELETE RESTRICT,
 CHECK(before_discount_minor - discount_minor = net_minor),
 CHECK(net_minor + vat_minor = gross_minor)
);
CREATE INDEX IF NOT EXISTS fiscal_intake_lines_draft_idx
 ON fiscal_document_intake_lines(draft_id,line_no);
-- Snapshots can only be inserted in the original draft creation transaction.
CREATE OR REPLACE FUNCTION fiscal_intake_lines_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fiscal test draft lines are append-only'; END; $$;
DROP TRIGGER IF EXISTS fiscal_intake_lines_immutable_trigger ON fiscal_document_intake_lines;
CREATE TRIGGER fiscal_intake_lines_immutable_trigger BEFORE UPDATE OR DELETE
 ON fiscal_document_intake_lines FOR EACH ROW EXECUTE FUNCTION fiscal_intake_lines_immutable();
ALTER TABLE fiscal_document_intake_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fiscal_document_intake_lines FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON TABLE fiscal_document_intake_lines FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON TABLE fiscal_document_intake_lines FROM authenticated;
 END IF;
END; $$;
COMMIT;
