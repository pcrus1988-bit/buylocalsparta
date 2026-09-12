-- KONTA MOY — catalogue enrichment V4 research, provenance and quality gate.
-- Public web research augments supplier evidence only when product identity is strong.
-- Research facts remain derived evidence and never overwrite immutable supplier source data.

BEGIN;

ALTER TABLE public.catalogue_enrichments
  ADD COLUMN identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN research_status text NOT NULL DEFAULT 'not_requested'
    CHECK (research_status IN ('not_requested','pending','researched','insufficient','conflict','failed')),
  ADD COLUMN research_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN research_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN research_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN research_version text,
  ADD COLUMN research_source_hash text,
  ADD COLUMN researched_at timestamptz,
  ADD COLUMN evidence_coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN quality_version text;

ALTER TABLE public.catalogue_enrichments
  ADD CONSTRAINT catalogue_enrichments_identifiers_object
    CHECK (jsonb_typeof(identifiers)='object'),
  ADD CONSTRAINT catalogue_enrichments_research_identity_object
    CHECK (jsonb_typeof(research_identity)='object'),
  ADD CONSTRAINT catalogue_enrichments_research_evidence_object
    CHECK (jsonb_typeof(research_evidence)='object'),
  ADD CONSTRAINT catalogue_enrichments_research_sources_array
    CHECK (jsonb_typeof(research_sources)='array'),
  ADD CONSTRAINT catalogue_enrichments_evidence_coverage_object
    CHECK (jsonb_typeof(evidence_coverage)='object'),
  ADD CONSTRAINT catalogue_enrichments_research_source_hash
    CHECK (research_source_hash IS NULL OR research_source_hash ~ '^[a-f0-9]{64}$');

CREATE INDEX catalogue_enrichments_research_status_idx
  ON public.catalogue_enrichments(research_status,updated_at);

COMMENT ON COLUMN public.catalogue_enrichments.identifiers IS
  'Validated product identifiers extracted from supplier evidence, such as GTIN/EAN, MPN and style code. Identifiers are never invented.';
COMMENT ON COLUMN public.catalogue_enrichments.research_status IS
  'V4 public-research lifecycle. Only strong identity matches can reach researched; weak/no-match evidence is insufficient or conflict.';
COMMENT ON COLUMN public.catalogue_enrichments.research_identity IS
  'Identity-match decision and match basis used to decide whether public web evidence may augment supplier evidence.';
COMMENT ON COLUMN public.catalogue_enrichments.research_evidence IS
  'Accepted non-sensitive public product facts, each tied to returned web-search source URLs. Never contains price, stock, delivery or authenticity claims.';
COMMENT ON COLUMN public.catalogue_enrichments.research_sources IS
  'Public URLs actually returned by the research tool and used as provenance for accepted research facts.';
COMMENT ON COLUMN public.catalogue_enrichments.research_source_hash IS
  'Hash of supplier source hash plus validated identifiers. Used to avoid repeating research when product evidence has not changed.';
COMMENT ON COLUMN public.catalogue_enrichments.evidence_coverage IS
  'Deterministic V4 report proving how many meaningful supplier/research signals are represented in customer copy.';
COMMENT ON COLUMN public.catalogue_enrichments.quality_version IS
  'Quality-gate version that accepted the current customer-facing copy. A prompt label alone does not imply quality.';

COMMIT;
