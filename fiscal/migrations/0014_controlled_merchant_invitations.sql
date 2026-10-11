-- FISCAL 0014: operator-controlled one-time merchant invitations, NOT merchant approval.
BEGIN;
CREATE TABLE fiscal_merchant_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL CHECK(email=lower(email) AND length(email) BETWEEN 6 AND 254),
 legal_name text NOT NULL CHECK(length(legal_name) BETWEEN 2 AND 240),
 vat_number text NOT NULL CHECK(vat_number ~ '^[0-9]{9}$'),
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','redeemed','revoked')),
 created_by_kind text NOT NULL CHECK(created_by_kind IN ('fiscal_admin','marketplace_super_admin')),
 created_by text NOT NULL CHECK(length(created_by) BETWEEN 5 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 redeemed_user_id uuid REFERENCES fiscal_users(id) ON DELETE RESTRICT,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '48 hours'),
 CHECK ((status='redeemed' AND redeemed_at IS NOT NULL AND redeemed_user_id IS NOT NULL) OR
       (status IN ('pending','revoked') AND redeemed_at IS NULL AND redeemed_user_id IS NULL))
);
CREATE UNIQUE INDEX fiscal_invitations_one_pending_email_idx
 ON fiscal_merchant_invitations(email) WHERE status='pending';
CREATE UNIQUE INDEX fiscal_invitations_one_pending_vat_idx
 ON fiscal_merchant_invitations(vat_number) WHERE status='pending';
CREATE INDEX fiscal_invitations_recent_idx ON fiscal_merchant_invitations(created_at DESC,id DESC);
CREATE FUNCTION fiscal_invitation_state_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (NEW.id,NEW.email,NEW.legal_name,NEW.vat_number,NEW.token_hash,
    NEW.created_by_kind,NEW.created_by,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM
    (OLD.id,OLD.email,OLD.legal_name,OLD.vat_number,OLD.token_hash,
     OLD.created_by_kind,OLD.created_by,OLD.created_at,OLD.expires_at)
 OR OLD.status<>'pending'
 OR NEW.status NOT IN ('redeemed','revoked')
 THEN RAISE EXCEPTION 'Fiscal invitation can only transition once'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_invitation_state_guard_trigger
 BEFORE UPDATE OR DELETE ON fiscal_merchant_invitations
 FOR EACH ROW EXECUTE FUNCTION fiscal_invitation_state_guard();
ALTER TABLE fiscal_merchant_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE fiscal_merchant_invitations FROM PUBLIC;
REVOKE ALL ON FUNCTION fiscal_invitation_state_guard() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
 LOOP
 EXECUTE format('REVOKE ALL ON TABLE fiscal_merchant_invitations FROM %I',r);
 EXECUTE format('REVOKE ALL ON FUNCTION fiscal_invitation_state_guard() FROM %I',r);
 END LOOP;
END $$;
COMMIT;
