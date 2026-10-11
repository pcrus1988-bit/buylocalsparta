-- Milestone 16: immutable, tenant-bound accounting SIMULATIONS ONLY.
-- Neither legal books nor posting engine. No official tax figures or real bank accounts.
BEGIN;

CREATE TABLE fiscal_sandbox_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES fiscal_organizations(id) ON DELETE RESTRICT,
 external_id text NOT NULL CHECK (external_id ~ '^[A-Za-z0-9._:-]{8,120}$'),
 digest char(64) NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL DEFAULT 'non_fiscal_test_journal' CHECK (kind='non_fiscal_test_journal'),
 currency text NOT NULL DEFAULT 'EUR' CHECK (currency='EUR'),
 status text NOT NULL DEFAULT 'saved_test' CHECK (status='saved_test'),
 entry_count integer NOT NULL CHECK (entry_count BETWEEN 2 AND 40),
 total_debit_minor bigint NOT NULL CHECK (total_debit_minor BETWEEN 1 AND 1000000000000),
 total_credit_minor bigint NOT NULL CHECK (total_credit_minor BETWEEN 1 AND 1000000000000),
 created_by uuid NOT NULL REFERENCES fiscal_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (total_debit_minor = total_credit_minor),
 UNIQUE (organization_id,external_id),
 UNIQUE (organization_id,id)
);
CREATE INDEX fiscal_sandbox_journals_recent_idx
 ON fiscal_sandbox_journals(organization_id,created_at DESC,id DESC);

CREATE TABLE fiscal_sandbox_journal_lines (
 organization_id uuid NOT NULL,
 journal_id uuid NOT NULL,
 line_no integer NOT NULL CHECK (line_no BETWEEN 1 AND 40),
 account_code text NOT NULL CHECK (account_code IN (
  'cash_test','bank_test','receivable_test','payable_test',
  'sales_test','purchases_test','inventory_test','adjustment_test'
 )),
 side text NOT NULL CHECK (side IN ('debit','credit')),
 amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000),
 PRIMARY KEY (organization_id,journal_id,line_no),
 FOREIGN KEY (organization_id,journal_id)
  REFERENCES fiscal_sandbox_journals(organization_id,id) ON DELETE RESTRICT
);

-- A commit is rejected unless exact persisted lines equal the immutable parent totals.
-- DEFERRABLE allows the parent and its lines to be inserted in one transaction.
CREATE FUNCTION fiscal_sandbox_journal_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE org uuid; jid uuid; expected record;
 actual_count bigint; actual_debit numeric; actual_credit numeric;
BEGIN
 IF TG_TABLE_NAME='fiscal_sandbox_journals' THEN
  org:=NEW.organization_id; jid:=NEW.id;
 ELSE
  org:=NEW.organization_id; jid:=NEW.journal_id;
 END IF;
 SELECT entry_count,total_debit_minor,total_credit_minor
  INTO expected FROM public.fiscal_sandbox_journals
  WHERE organization_id=org AND id=jid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox journal parent missing'; END IF;
 SELECT count(*),
  COALESCE(sum(amount_minor) FILTER(WHERE side='debit'),0),
  COALESCE(sum(amount_minor) FILTER(WHERE side='credit'),0)
 INTO actual_count,actual_debit,actual_credit
 FROM public.fiscal_sandbox_journal_lines
 WHERE organization_id=org AND journal_id=jid;
 IF actual_count<>expected.entry_count OR
  actual_debit<>expected.total_debit_minor OR
  actual_credit<>expected.total_credit_minor THEN
   RAISE EXCEPTION 'Sandbox journal lines are not balanced or complete';
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER fiscal_sandbox_parent_complete
 AFTER INSERT ON fiscal_sandbox_journals DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION fiscal_sandbox_journal_consistency();
CREATE CONSTRAINT TRIGGER fiscal_sandbox_lines_complete
 AFTER INSERT ON fiscal_sandbox_journal_lines DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION fiscal_sandbox_journal_consistency();

CREATE FUNCTION fiscal_sandbox_journal_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Sandbox journal snapshots are immutable'; END $$;
CREATE TRIGGER fiscal_sandbox_journal_immutable_parent
 BEFORE UPDATE OR DELETE ON fiscal_sandbox_journals
 FOR EACH ROW EXECUTE FUNCTION fiscal_sandbox_journal_immutable();
CREATE TRIGGER fiscal_sandbox_journal_immutable_lines
 BEFORE UPDATE OR DELETE ON fiscal_sandbox_journal_lines
 FOR EACH ROW EXECUTE FUNCTION fiscal_sandbox_journal_immutable();

ALTER TABLE fiscal_sandbox_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_sandbox_journal_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fiscal_sandbox_journals,fiscal_sandbox_journal_lines FROM PUBLIC;
REVOKE ALL ON FUNCTION fiscal_sandbox_journal_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION fiscal_sandbox_journal_immutable() FROM PUBLIC;
DO $
DECLARE role_name text;
BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
 LOOP
  EXECUTE format('REVOKE ALL ON TABLE fiscal_sandbox_journals,fiscal_sandbox_journal_lines FROM %I',role_name);
  EXECUTE format('REVOKE ALL ON FUNCTION fiscal_sandbox_journal_consistency() FROM %I',role_name);
  EXECUTE format('REVOKE ALL ON FUNCTION fiscal_sandbox_journal_immutable() FROM %I',role_name);
 END LOOP;
END $;

COMMIT;
