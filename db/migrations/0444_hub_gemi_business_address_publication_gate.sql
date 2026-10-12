-- Never publish a registry entity merely because its postcode or municipality
-- has an approximate coordinate. A point-to-hub radius is not address evidence.
ALTER TABLE research_private.hub_gemi_directory
  ADD COLUMN IF NOT EXISTS verified_address_text text,
  ADD COLUMN IF NOT EXISTS business_geo_evidence_ref text,
  ADD COLUMN IF NOT EXISTS business_geo_evidence_kind text,
  ADD COLUMN IF NOT EXISTS business_geo_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_geo_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_geo_reviewer_id text,
  ADD COLUMN IF NOT EXISTS privacy_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS privacy_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_reviewer_id text,
  ADD COLUMN IF NOT EXISTS editorial_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS editorial_reviewer_id text,
  ADD COLUMN IF NOT EXISTS publication_evidence_note text;

DO $ddl$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
      conrelid='research_private.hub_gemi_directory'::regclass
      AND conname='hub_gemi_business_geo_precision_check') THEN
    ALTER TABLE research_private.hub_gemi_directory
      ADD CONSTRAINT hub_gemi_business_geo_precision_check
      CHECK (business_geo_evidence_kind IS NULL OR
             business_geo_evidence_kind IN ('verified_premise_address','verified_registry_address'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
      conrelid='research_private.hub_gemi_directory'::regclass
      AND conname='hub_gemi_privacy_status_check') THEN
    ALTER TABLE research_private.hub_gemi_directory
      ADD CONSTRAINT hub_gemi_privacy_status_check
      CHECK (privacy_review_status IN ('pending','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
      conrelid='research_private.hub_gemi_directory'::regclass
      AND conname='hub_gemi_verified_publication_gate') THEN
    ALTER TABLE research_private.hub_gemi_directory
      ADD CONSTRAINT hub_gemi_verified_publication_gate CHECK (
        display_status <> 'published' OR (
          assignment_status='assigned'
          AND assignment_method='manual_geo_review'
          AND assigned_hub_id IS NOT NULL
          AND assigned_hub_slug IS NOT NULL
          AND hub_distance_km IS NOT NULL AND hub_distance_km <= 25
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND business_geo_evidence_kind IN ('verified_premise_address','verified_registry_address')
          AND nullif(btrim(verified_address_text),'') IS NOT NULL
          AND length(btrim(business_geo_evidence_ref)) >= 12
          AND business_geo_verified_at IS NOT NULL
          AND business_geo_reviewed_at IS NOT NULL
          AND nullif(btrim(business_geo_reviewer_id),'') IS NOT NULL
          AND privacy_review_status='approved'
          AND privacy_reviewed_at IS NOT NULL
          AND nullif(btrim(privacy_reviewer_id),'') IS NOT NULL
          AND editorial_reviewed_at IS NOT NULL
          AND nullif(btrim(editorial_reviewer_id),'') IS NOT NULL
          AND nullif(btrim(publication_evidence_note),'') IS NOT NULL
          AND source_checked_at IS NOT NULL
        )
      );
  END IF;
END $ddl$;

COMMENT ON COLUMN research_private.hub_gemi_directory.verified_address_text IS
  'Governed private address evidence, never inferred from a postcode or municipality centre. Do not expose directly on public projections.';
COMMENT ON COLUMN research_private.hub_gemi_directory.business_geo_evidence_ref IS
  'Traceable business-premise/address source ID or archival reference with redistribution authority.';
COMMENT ON CONSTRAINT hub_gemi_verified_publication_gate ON research_private.hub_gemi_directory IS
  'Business-level verified address, independent geographic review, privacy approval and editorial review mandatory before publication. Postcode-only centroid assignments remain unpublished.';
