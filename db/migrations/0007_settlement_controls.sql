-- Buy Local Sparta — settlement maker/checker and payout reconciliation controls

ALTER TABLE settlement_batches
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_reference text,
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE settlement_batches
  ADD CONSTRAINT settlement_maker_checker_separation
  CHECK (approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by);

CREATE UNIQUE INDEX IF NOT EXISTS settlement_lines_procurement_once_idx
  ON settlement_lines(procurement_id)
  WHERE procurement_id IS NOT NULL;

ALTER TABLE settlement_lines
  ADD CONSTRAINT settlement_line_final_nonnegative CHECK (final_minor >= 0);

CREATE OR REPLACE FUNCTION enforce_settlement_paid_state() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('paid','closed') THEN
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'paid settlement requires checker approval';
    END IF;
    IF NEW.paid_by IS NULL OR NEW.paid_at IS NULL OR NULLIF(BTRIM(NEW.payout_reference), '') IS NULL THEN
      RAISE EXCEPTION 'paid settlement requires operator, time and payout reference';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlement_batches_paid_guard
  BEFORE INSERT OR UPDATE ON settlement_batches
  FOR EACH ROW EXECUTE FUNCTION enforce_settlement_paid_state();

