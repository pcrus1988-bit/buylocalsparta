-- KONTA MOU — indexed research-vendor profile claim continuity.
-- A public application may claim an existing census/research vendor identity so the
-- already indexed /vendor/:id URL survives verification and partner activation.

BEGIN;

CREATE TABLE vendor_application_profile_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  application_id uuid NOT NULL UNIQUE REFERENCES vendor_applications(id) ON DELETE CASCADE,
  research_vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  claimed_route text NOT NULL,
  claim_status text NOT NULL DEFAULT 'pending',
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (claim_status IN ('pending','verified','rejected','superseded')),
  CHECK (claimed_route LIKE '/vendor/%'),
  CHECK (length(btrim(public_id)) > 0),
  CHECK (resolution_note IS NULL OR length(resolution_note) <= 1000)
);

-- Deliberately not unique on research_vendor_id: an unverified/spam claim must not
-- permanently reserve a public business profile against its legitimate owner.
CREATE INDEX vendor_application_profile_claims_vendor_status_idx
  ON vendor_application_profile_claims(research_vendor_id,claim_status,created_at DESC);

COMMENT ON TABLE vendor_application_profile_claims IS
  'Auditable applications claiming an existing indexed research-vendor profile. Pending claims do not reserve the profile globally.';

ALTER TABLE vendor_application_profile_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_application_profile_claims_owner_read ON vendor_application_profile_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM vendor_applications application
      WHERE application.id=vendor_application_profile_claims.application_id
        AND application.owner_user_id=nullif(current_setting('app.actor_user_id', true), '')::uuid
    )
    OR (SELECT bls_private.is_platform_runtime())
  );

CREATE POLICY vendor_application_profile_claims_platform_all ON vendor_application_profile_claims
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION bls_private.finalize_vendor_profile_claim_on_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  claim_found boolean := false;
  membership_uuid uuid;
  actor_uuid uuid;
BEGIN
  IF NEW.status = 'active'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.vendor_id IS NOT NULL THEN

    SELECT id INTO actor_uuid
    FROM users
    WHERE public_id = nullif(current_setting('app.actor_user_id', true), '')
       OR id::text = nullif(current_setting('app.actor_user_id', true), '')
    LIMIT 1;

    UPDATE vendor_application_profile_claims
    SET claim_status='verified',
        resolved_by=actor_uuid,
        resolved_at=now(),
        resolution_note='Vendor application activated by authorized admin',
        updated_at=now()
    WHERE application_id=NEW.id
      AND research_vendor_id=NEW.vendor_id
      AND claim_status='pending';

    claim_found := FOUND;

    IF claim_found THEN
      -- Keep the indexed vendor identity but replace research-era identity fields with
      -- the verified application values. Research provenance remains available in its
      -- separate dossier tables.
      UPDATE vendor_businesses
      SET legal_name=NEW.legal_name,
          trading_name=NEW.trading_name,
          tax_number=COALESCE(NEW.tax_number,tax_number),
          gemi_number=COALESCE(NEW.gemi_number,gemi_number),
          verification_completed_at=COALESCE(verification_completed_at,now()),
          contract_started_at=COALESCE(contract_started_at,now()),
          updated_at=now()
      WHERE id=NEW.vendor_id;

      SELECT id INTO membership_uuid
      FROM vendor_users
      WHERE vendor_id=NEW.vendor_id
        AND user_id=NEW.owner_user_id
        AND location_id IS NULL
      LIMIT 1;

      IF membership_uuid IS NULL THEN
        membership_uuid := gen_random_uuid();
        INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at)
        VALUES(
          membership_uuid,
          'vuser_' || substr(replace(gen_random_uuid()::text,'-',''),1,20),
          NEW.vendor_id,
          NEW.owner_user_id,
          NULL,
          true,
          now()
        );
      ELSE
        UPDATE vendor_users SET active=true WHERE id=membership_uuid;
      END IF;

      INSERT INTO vendor_user_roles(vendor_user_id,role)
      VALUES(membership_uuid,'vendor_owner')
      ON CONFLICT DO NOTHING;

      IF NOT EXISTS (
        SELECT 1 FROM vendor_locations WHERE vendor_id=NEW.vendor_id
      ) THEN
        INSERT INTO vendor_locations(
          id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,
          country_code,phone,public_email,active,verified_at,created_at,updated_at
        ) VALUES(
          gen_random_uuid(),
          'location_' || substr(replace(gen_random_uuid()::text,'-',''),1,20),
          NEW.vendor_id,
          NEW.market_id,
          NEW.trading_name,
          NEW.address_line1,
          'Sparta',
          NEW.postcode,
          'GR',
          NEW.phone,
          NEW.contact_email,
          true,
          now(),
          now(),
          now()
        );
      END IF;

      IF NEW.shop_story IS NOT NULL AND length(btrim(NEW.shop_story)) > 0 THEN
        INSERT INTO vendor_profile_translations(vendor_id,locale,story)
        VALUES(NEW.vendor_id,'el',NEW.shop_story)
        ON CONFLICT(vendor_id,locale) DO UPDATE
          SET story=EXCLUDED.story;
      END IF;
    END IF;
  ELSIF NEW.status = 'closed'
        AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE vendor_application_profile_claims
    SET claim_status='rejected',
        resolved_at=now(),
        resolution_note=COALESCE(resolution_note,'Vendor application closed before activation'),
        updated_at=now()
    WHERE application_id=NEW.id
      AND claim_status='pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_application_profile_claim_finalize_trg ON vendor_applications;
CREATE TRIGGER vendor_application_profile_claim_finalize_trg
AFTER UPDATE OF status ON vendor_applications
FOR EACH ROW
EXECUTE FUNCTION bls_private.finalize_vendor_profile_claim_on_activation();

COMMIT;
