-- Independent database invariants for the marketplace pairing relationship.
-- Even a service bug cannot persist a link for a non-approved or mismatched issuer.
BEGIN;
CREATE OR REPLACE FUNCTION fiscal_marketplace_link_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE legal_vat text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.marketplace_vendor_id IS DISTINCT FROM OLD.marketplace_vendor_id
       OR NEW.marketplace_vendor_public_id IS DISTINCT FROM OLD.marketplace_vendor_public_id
       OR NEW.issuer_vat_number IS DISTINCT FROM OLD.issuer_vat_number
       OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by
       OR NEW.linked_at IS DISTINCT FROM OLD.linked_at
       OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    THEN
      RAISE EXCEPTION 'Fiscal marketplace link identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  SELECT vat_number INTO legal_vat FROM fiscal_organizations
    WHERE id=NEW.organization_id AND status='approved';
  IF legal_vat IS NULL THEN
    RAISE EXCEPTION 'Only verified Fiscal organizations may be linked';
  END IF;
  IF legal_vat IS DISTINCT FROM NEW.issuer_vat_number THEN
    RAISE EXCEPTION 'Fiscal link issuer VAT mismatch';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fiscal_marketplace_link_guard ON fiscal_marketplace_links;
CREATE TRIGGER fiscal_marketplace_link_guard
 BEFORE INSERT OR UPDATE ON fiscal_marketplace_links
 FOR EACH ROW EXECUTE FUNCTION fiscal_marketplace_link_integrity();
COMMIT;
