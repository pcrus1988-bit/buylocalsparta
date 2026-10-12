-- Allow factual GEMI registry-directory listings without pretending a municipality
-- centre is the business's verified street/25 km point. Precise geo and marketplace
-- ownership verification remain independent workflows.
ALTER TABLE research_private.hub_gemi_directory
  ADD COLUMN IF NOT EXISTS publication_basis text NOT NULL DEFAULT 'premise',
  ADD COLUMN IF NOT EXISTS directory_hub_slug text,
  ADD COLUMN IF NOT EXISTS registry_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS registry_verification_ref text,
  ADD COLUMN IF NOT EXISTS registry_verified_by text;

ALTER TABLE research_private.hub_gemi_directory
  ADD CONSTRAINT hub_gemi_publication_basis_check
  CHECK (publication_basis IN ('premise','municipality'));

ALTER TABLE research_private.hub_gemi_directory
  ADD CONSTRAINT hub_gemi_registry_evidence_check CHECK (
    registry_verified_at IS NULL OR
    (length(btrim(registry_verification_ref)) >= 12 AND
     nullif(btrim(registry_verified_by),'') IS NOT NULL)
  );

-- Replace BOTH legacy publication constraints. The new municipality pathway
-- must have independently verified registry identity and privacy/editorial
-- approvals; it never receives a fake individual coordinate or a 25 km claim.
ALTER TABLE research_private.hub_gemi_directory
  DROP CONSTRAINT IF EXISTS hub_gemi_directory_check1,
  DROP CONSTRAINT IF EXISTS hub_gemi_verified_publication_gate;

ALTER TABLE research_private.hub_gemi_directory
  ADD CONSTRAINT hub_gemi_directory_publication_facts_check CHECK (
    display_status <> 'published' OR COALESCE((
      nullif(btrim(legal_name),'') IS NOT NULL
      AND source_checked_at IS NOT NULL
      AND (
        (publication_basis='premise' AND assignment_status='assigned'
          AND assigned_hub_id IS NOT NULL AND assigned_hub_slug IS NOT NULL
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND postcode ~ '^[0-9]{5}$')
        OR
        (publication_basis='municipality'
          AND directory_hub_slug IS NOT NULL
          AND registry_municipality_id IS NOT NULL
          AND registry_verified_at IS NOT NULL
          AND length(btrim(registry_verification_ref)) >= 12
          AND nullif(btrim(registry_verified_by),'') IS NOT NULL)
      )
    ),false)
  );

ALTER TABLE research_private.hub_gemi_directory
  ADD CONSTRAINT hub_gemi_verified_publication_gate CHECK (
    display_status <> 'published' OR COALESCE((
      privacy_review_status='approved'
      AND privacy_reviewed_at IS NOT NULL
      AND nullif(btrim(privacy_reviewer_id),'') IS NOT NULL
      AND editorial_reviewed_at IS NOT NULL
      AND nullif(btrim(editorial_reviewer_id),'') IS NOT NULL
      AND nullif(btrim(publication_evidence_note),'') IS NOT NULL
      AND source_checked_at IS NOT NULL
      AND (
        (publication_basis='municipality' AND registry_verified_at IS NOT NULL
          AND directory_hub_slug IS NOT NULL)
        OR
        (publication_basis='premise'
          AND assignment_status='assigned' AND assignment_method='manual_geo_review'
          AND assigned_hub_id IS NOT NULL AND assigned_hub_slug IS NOT NULL
          AND hub_distance_km IS NOT NULL AND hub_distance_km <= 25
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND business_geo_evidence_kind IN ('verified_premise_address','verified_registry_address')
          AND nullif(btrim(verified_address_text),'') IS NOT NULL
          AND length(btrim(business_geo_evidence_ref)) >= 12
          AND business_geo_verified_at IS NOT NULL
          AND business_geo_reviewed_at IS NOT NULL
          AND nullif(btrim(business_geo_reviewer_id),'') IS NOT NULL)
      )
    ),false)
  );

-- Geography gate at the moment of publication. A reviewed municipality-to-HUB
-- name correspondence is sufficient to present a regional DIRECTORY grouping,
-- NOT proof of precise position or compliance with a delivery radius.
CREATE OR REPLACE FUNCTION research_private.guard_hub_gemi_municipality_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,research_private,public AS $$
BEGIN
  IF NEW.display_status = 'published' AND NEW.publication_basis = 'municipality' THEN
    IF NOT EXISTS (
      SELECT 1 FROM research_private.hub_gemi_municipality_matches m
      JOIN research_private.hub_gemi_hub_master hub
        ON hub.hub_slug=m.candidate_hub_slug
      WHERE m.registry_municipality_id=NEW.registry_municipality_id
        AND m.review_status='reviewed'
        AND m.candidate_hub_slug=NEW.directory_hub_slug
        AND m.candidate_hub_id=hub.hub_id
        AND m.candidate_hub_distance_km <= hub.radius_km
    ) THEN
      RAISE EXCEPTION 'HUB_DIRECTORY_MUNICIPALITY_NOT_REVIEWED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.vendor_businesses v
      WHERE v.gemi_number=NEW.gemi_number AND v.status='active'
        AND v.public_directory_visible=true
    ) OR EXISTS (
      SELECT 1 FROM public.hub_expansion_prospects h
      WHERE h.gemi_number=NEW.gemi_number
        AND h.status='converted' AND h.owner_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'HUB_DIRECTORY_CANONICAL_PARTNER_EXISTS';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION research_private.guard_hub_gemi_municipality_publication()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS hub_gemi_municipality_publication_guard
  ON research_private.hub_gemi_directory;
CREATE TRIGGER hub_gemi_municipality_publication_guard
  BEFORE INSERT OR UPDATE OF display_status,publication_basis,directory_hub_slug,
    registry_municipality_id,registry_verified_at,registry_verification_ref,
    registry_verified_by,privacy_review_status,editorial_reviewed_at
  ON research_private.hub_gemi_directory FOR EACH ROW
  EXECUTE FUNCTION research_private.guard_hub_gemi_municipality_publication();

DROP POLICY IF EXISTS hub_gemi_directory_app_published_read
 ON research_private.hub_gemi_directory;
CREATE POLICY hub_gemi_directory_app_published_read
  ON research_private.hub_gemi_directory FOR SELECT TO bls_app_runtime
  USING (
    display_status='published' AND (
      (publication_basis='premise' AND assignment_status='assigned')
      OR (publication_basis='municipality' AND directory_hub_slug IS NOT NULL
        AND registry_verified_at IS NOT NULL)
    )
  );

CREATE INDEX IF NOT EXISTS hub_gemi_directory_municipality_public_idx
  ON research_private.hub_gemi_directory(directory_hub_slug,display_status,public_slug)
  WHERE publication_basis='municipality';
CREATE INDEX IF NOT EXISTS hub_gemi_directory_municipality_sector_idx
  ON research_private.hub_gemi_directory(directory_hub_slug,sector_code)
  WHERE publication_basis='municipality' AND display_status='published';

COMMENT ON COLUMN research_private.hub_gemi_directory.directory_hub_slug IS
  'Administrative directory grouping, NOT a business coordinate or 25 km trading eligibility.';
COMMENT ON COLUMN research_private.hub_gemi_directory.registry_verified_at IS
  'Registry identity/source verified independently of ownership and geolocation.';
COMMENT ON COLUMN research_private.hub_gemi_directory.publication_basis IS
  'premise = exactly verified address; municipality = reviewed administrative grouping only.';
COMMENT ON CONSTRAINT hub_gemi_verified_publication_gate ON research_private.hub_gemi_directory IS
  'Publication requires privacy/editorial review and either true premises evidence or confirmed registry identity with reviewed municipality association.';
