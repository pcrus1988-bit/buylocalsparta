-- NYXI private legislative proposal staging — applied to production 2026-10-18.
-- This is NOT nyxi_regulatory_facts and does not carry any asserted 'is_current'
-- flag, published legal determination, product restriction or public permission.
CREATE TABLE IF NOT EXISTS public.nyxi_regulatory_proposals_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposal_key text NOT NULL UNIQUE,
 ingredient_entity_id uuid NOT NULL REFERENCES public.nyxi_entities(id) ON DELETE RESTRICT,
 source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
 snapshot_id uuid NOT NULL REFERENCES public.nyxi_source_snapshots(id) ON DELETE RESTRICT,
 primary_fragment_id uuid NOT NULL,
 jurisdiction text NOT NULL,
 instrument_eli text NOT NULL,
 proposal_type text NOT NULL,
 candidate_text text NOT NULL,
 candidate_effective_date date,
 applicability_review text NOT NULL DEFAULT 'not_assessed'
  CHECK(applicability_review IN ('not_assessed','requires_consolidation_review','needs_legal_review','rejected')),
 review_status text NOT NULL DEFAULT 'pending'
  CHECK(review_status IN ('pending','needs_second_review','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT nyxi_regulatory_proposals_fragment_same_snapshot_v1
  FOREIGN KEY(primary_fragment_id,snapshot_id)
  REFERENCES public.nyxi_evidence_fragments(id,snapshot_id) ON DELETE RESTRICT
);
ALTER TABLE public.nyxi_regulatory_proposals_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_regulatory_proposals_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.nyxi_regulatory_proposals_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.nyxi_validate_regulatory_proposal_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public
AS $$
DECLARE valid_record boolean;
BEGIN
 SELECT true INTO valid_record
 FROM public.nyxi_evidence_fragments f
 JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id AND sn.source_id=f.source_id
 JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id AND m.source_id=sn.source_id
 JOIN public.nyxi_asset_acquisition_approvals a ON a.id::text=sn.provenance->>'asset_approval_id'
 WHERE f.id=NEW.primary_fragment_id AND f.snapshot_id=NEW.snapshot_id AND f.source_id=NEW.source_id
 AND sn.sha256=m.metadata->>'sha256' AND sn.storage_bucket='nyxi-evidence'
 AND m.extraction_status='complete' AND a.source_id=NEW.source_id
 AND a.acquisition_authorized AND a.expires_at>now() AND a.review_due_at>now()
 AND NEW.review_status IN ('pending','needs_second_review','rejected');
 IF NOT FOUND THEN
  RAISE EXCEPTION 'NYXI regulatory proposal requires archived exact-source, valid checksum, review-pending evidence';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.nyxi_validate_regulatory_proposal_v1()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nyxi_regulatory_proposal_guard_v1
 ON public.nyxi_regulatory_proposals_v1;
CREATE TRIGGER nyxi_regulatory_proposal_guard_v1
 BEFORE INSERT OR UPDATE ON public.nyxi_regulatory_proposals_v1
 FOR EACH ROW EXECUTE FUNCTION public.nyxi_validate_regulatory_proposal_v1();

CREATE OR REPLACE VIEW public.nyxi_private_regulatory_proposal_queue_v1
WITH (security_invoker=true)
AS
SELECT p.id,p.proposal_key,e.label AS ingredient,s.source_key,
s.canonical_url AS official_url,p.jurisdiction,p.instrument_eli,
p.proposal_type,p.candidate_text,p.candidate_effective_date,
p.applicability_review,p.review_status,p.primary_fragment_id,
f.ordinal AS fragment_ordinal,f.content_sha256 AS fragment_sha256,
sn.sha256 AS source_sha256,p.metadata,p.created_at
FROM public.nyxi_regulatory_proposals_v1 p
JOIN public.nyxi_entities e ON e.id=p.ingredient_entity_id
JOIN public.nyxi_sources s ON s.id=p.source_id
JOIN public.nyxi_evidence_fragments f ON f.id=p.primary_fragment_id
JOIN public.nyxi_source_snapshots sn ON sn.id=p.snapshot_id;
REVOKE ALL ON public.nyxi_private_regulatory_proposal_queue_v1
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_regulatory_proposal_queue_v1 TO service_role;
