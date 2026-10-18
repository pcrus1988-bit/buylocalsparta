-- Applied to NYXI production on 2026-10-18 as migration 20261018200200.
-- Independently review exact legislation excerpt before promoting any candidate.
CREATE TABLE IF NOT EXISTS public.nyxi_ingredient_identity_assertions_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assertion_key text NOT NULL UNIQUE,
 entity_id uuid NOT NULL REFERENCES public.nyxi_entities(id) ON DELETE RESTRICT,
 identifier_type text NOT NULL CHECK(identifier_type IN ('CAS','EC','INCI')),
 identifier_value text NOT NULL,
 source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
 snapshot_id uuid NOT NULL REFERENCES public.nyxi_source_snapshots(id) ON DELETE RESTRICT,
 fragment_id uuid NOT NULL,
 source_document_reference text NOT NULL,
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','needs_second_review','rejected')),
 entity_scope text NOT NULL DEFAULT 'candidate_chemical_identity',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT nyxi_identity_assertion_fragment_match FOREIGN KEY(fragment_id,snapshot_id)
 REFERENCES public.nyxi_evidence_fragments(id,snapshot_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS nyxi_ingredient_identity_assertions_entity_idx
 ON public.nyxi_ingredient_identity_assertions_v1(entity_id,identifier_type);
ALTER TABLE public.nyxi_ingredient_identity_assertions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_ingredient_identity_assertions_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.nyxi_ingredient_identity_assertions_v1 TO service_role;
CREATE OR REPLACE FUNCTION public.nyxi_guard_ingredient_identity_assertion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.identifier_type='CAS' AND NEW.identifier_value !~ '^[0-9]{2,7}-[0-9]{2}-[0-9]$' THEN RAISE EXCEPTION 'Invalid CAS number shape'; END IF;
 IF NEW.identifier_type='EC' AND NEW.identifier_value !~ '^[0-9]{3}-[0-9]{3}-[0-9]$' THEN RAISE EXCEPTION 'Invalid EC number shape'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.nyxi_evidence_fragments f
  JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id AND sn.source_id=f.source_id
  JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id
  JOIN public.nyxi_asset_acquisition_approvals a ON a.id::text=sn.provenance->>'asset_approval_id'
  JOIN public.nyxi_entities e ON e.id=NEW.entity_id AND e.entity_type='ingredient'
  WHERE f.id=NEW.fragment_id AND f.snapshot_id=NEW.snapshot_id AND f.source_id=NEW.source_id
  AND sn.storage_bucket='nyxi-evidence' AND sn.sha256=m.metadata->>'sha256'
  AND m.extraction_status='complete' AND a.source_id=NEW.source_id
  AND a.acquisition_authorized AND a.expires_at>now() AND a.review_due_at>now()
  AND ((NEW.identifier_type IN('CAS','EC') AND f.body_text ILIKE '%'||NEW.identifier_value||'%')
   OR (NEW.identifier_type='INCI' AND f.body_text ILIKE '%'||NEW.identifier_value||'%'))
 ) THEN RAISE EXCEPTION 'Identity assertion must match an authorized exact archived fragment and ingredient'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.nyxi_guard_ingredient_identity_assertion_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nyxi_ingredient_identity_guard_v1 ON public.nyxi_ingredient_identity_assertions_v1;
CREATE TRIGGER nyxi_ingredient_identity_guard_v1 BEFORE INSERT OR UPDATE
ON public.nyxi_ingredient_identity_assertions_v1 FOR EACH ROW
EXECUTE FUNCTION public.nyxi_guard_ingredient_identity_assertion_v1();
CREATE OR REPLACE VIEW public.nyxi_private_identity_review_v1 WITH (security_invoker=true) AS
SELECT i.id,i.assertion_key,e.canonical_key,e.label AS ingredient,
i.identifier_type,i.identifier_value,i.review_status,i.entity_scope,
s.source_key,s.canonical_url AS source_url,i.source_document_reference,
f.id AS fragment_id,f.ordinal AS fragment_ordinal,f.content_sha256 AS fragment_sha256,
sn.sha256 AS original_sha256,i.metadata,i.created_at
FROM public.nyxi_ingredient_identity_assertions_v1 i
JOIN public.nyxi_entities e ON e.id=i.entity_id
JOIN public.nyxi_sources s ON s.id=i.source_id
JOIN public.nyxi_evidence_fragments f ON f.id=i.fragment_id
JOIN public.nyxi_source_snapshots sn ON sn.id=i.snapshot_id;
REVOKE ALL ON public.nyxi_private_identity_review_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_identity_review_v1 TO service_role;
