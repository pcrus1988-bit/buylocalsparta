
-- NYXI private, source-grounded product recall/report candidate staging.
-- Applied to production as 20261019092851; no publication approval granted.
CREATE TABLE IF NOT EXISTS public.nyxi_product_safety_notice_candidates_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notice_key text NOT NULL UNIQUE,
 jurisdiction text NOT NULL CHECK(jurisdiction IN ('GB','EU','US','AU','CA','GR')),
 source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
 snapshot_id uuid NOT NULL REFERENCES public.nyxi_source_snapshots(id) ON DELETE RESTRICT,
 fragment_id uuid NOT NULL,
 notice_reference text NOT NULL,
 notice_type text NOT NULL CHECK(notice_type IN ('product_recall','product_safety_report','product_safety_alert')),
 report_published_date date NOT NULL,
 risk_type text NOT NULL CHECK(risk_type IN ('chemical','electrical','mechanical','fire','other')),
 risk_level_reported text NOT NULL,
 product_name_reported text NOT NULL,
 brand_reported text,
 model_reported text,
 action_reported text NOT NULL,
 exact_product_match_status text NOT NULL DEFAULT 'unmatched'
  CHECK(exact_product_match_status IN ('unmatched','requires_sku_match','rejected')),
 review_status text NOT NULL DEFAULT 'pending'
  CHECK(review_status IN ('pending','requires_second_review','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT nyxi_safety_notice_fragment_snapshot_fk_v1
  FOREIGN KEY(fragment_id,snapshot_id)
  REFERENCES public.nyxi_evidence_fragments(id,snapshot_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS nyxi_safety_notice_review_idx
 ON public.nyxi_product_safety_notice_candidates_v1(jurisdiction,review_status,report_published_date DESC);
ALTER TABLE public.nyxi_product_safety_notice_candidates_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nyxi_product_safety_notice_candidates_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.nyxi_product_safety_notice_candidates_v1 TO service_role;
CREATE OR REPLACE FUNCTION public.nyxi_validate_product_safety_notice_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM public.nyxi_evidence_fragments f
  JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id AND sn.source_id=f.source_id
  JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id AND m.source_id=sn.source_id
  JOIN public.nyxi_asset_acquisition_approvals a ON a.id::text=sn.provenance->>'asset_approval_id'
  JOIN public.nyxi_sources s ON s.id=f.source_id
  WHERE f.id=NEW.fragment_id AND f.snapshot_id=NEW.snapshot_id
    AND f.source_id=NEW.source_id
    AND sn.storage_bucket='nyxi-evidence' AND sn.http_status=200
    AND sn.sha256=m.metadata->>'sha256'
    AND m.extraction_status='complete'
    AND a.source_id=NEW.source_id AND a.acquisition_authorized
    AND a.expires_at>now() AND a.review_due_at>now()
    AND s.jurisdiction=NEW.jurisdiction
    AND s.authority='UK Office for Product Safety and Standards'
    AND s.source_role='recall_notice'
    AND f.body_text ILIKE '%'||NEW.notice_reference||'%'
 ) THEN
  RAISE EXCEPTION 'NYXI notice needs a matching approved official source, original checksum and exact notice fragment';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.nyxi_validate_product_safety_notice_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nyxi_safety_notice_provenance_guard_v1 ON public.nyxi_product_safety_notice_candidates_v1;
CREATE TRIGGER nyxi_safety_notice_provenance_guard_v1
 BEFORE INSERT OR UPDATE ON public.nyxi_product_safety_notice_candidates_v1
 FOR EACH ROW EXECUTE FUNCTION public.nyxi_validate_product_safety_notice_v1();
CREATE OR REPLACE VIEW public.nyxi_private_product_safety_notice_review_v1
WITH (security_invoker=true) AS
SELECT n.id,n.notice_key,n.jurisdiction,n.notice_reference,n.notice_type,n.report_published_date,
 n.risk_type,n.risk_level_reported,n.product_name_reported,n.brand_reported,n.model_reported,
 n.action_reported,n.exact_product_match_status,n.review_status,
 s.source_key,s.canonical_url AS source_url,f.id AS fragment_id,f.ordinal AS fragment_ordinal,
 f.content_sha256 AS fragment_sha256,sn.sha256 AS original_sha256,
 n.metadata,n.created_at,false AS public_release_authorized
FROM public.nyxi_product_safety_notice_candidates_v1 n
JOIN public.nyxi_sources s ON s.id=n.source_id
JOIN public.nyxi_evidence_fragments f ON f.id=n.fragment_id
JOIN public.nyxi_source_snapshots sn ON sn.id=n.snapshot_id;
REVOKE ALL ON public.nyxi_private_product_safety_notice_review_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_product_safety_notice_review_v1 TO service_role;
