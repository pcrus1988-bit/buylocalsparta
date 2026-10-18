-- KONTA MOY Retail Observatory: preserve sector and GEMI-derived KAD classification
-- in the restricted, append-only response-level ANALYSIS context.
-- Previously, irreversible sample-unit detachment preserved only sector_code.
-- These fields are NOT participant-declared primary business activities.
-- The exact full activity code set is a quasi-identifier: never publish it or
-- use it to bypass suppression. The existing platform-only RLS still applies.
BEGIN;

ALTER TABLE public.research_response_design_context
  ADD COLUMN matched_kad_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN source_activity_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN kad_classification_version text NOT NULL DEFAULT 'unknown',
  ADD COLUMN kad_source_kind text NOT NULL DEFAULT 'unknown',
  ADD COLUMN source_prefecture text NOT NULL DEFAULT 'unknown',
  ADD COLUMN postcode_district3 text;

ALTER TABLE public.research_response_design_context
  ADD CONSTRAINT research_design_context_matched_kad_array_check
    CHECK (jsonb_typeof(matched_kad_codes)='array'),
  ADD CONSTRAINT research_design_context_all_kad_array_check
    CHECK (jsonb_typeof(source_activity_codes)='array'),
  ADD CONSTRAINT research_design_context_postcode_district_check
    CHECK (postcode_district3 IS NULL OR postcode_district3 ~ '^[0-9]{3}$');

-- Use the existing frozen frame (one response per record); never infer a
-- primary KAD by array order. An original registry code can be secondary.
-- Append-only snapshot is captured now, before contact linkage is destroyed.
INSERT INTO public.research_response_design_context (
  response_id,study_id,wave_id,sample_draw_id,stratum_id,
  region_code,sector_code,size_band,inclusion_probability,base_weight,
  fieldwork_phase,matched_kad_codes,source_activity_codes,
  kad_classification_version,kad_source_kind,source_prefecture,postcode_district3
)
SELECT
  rr.id,rr.study_id,rr.wave_id,su.sample_draw_id,su.stratum_id,
  COALESCE(fu.region_code,'unknown'),
  COALESCE(fu.sector_code,'unknown'),
  COALESCE(fu.size_band,'unknown'),
  su.inclusion_probability,su.base_weight,ri.fieldwork_phase,
  CASE WHEN jsonb_typeof(fu.sampling_attributes->'matchedActivityCodes')='array'
    THEN fu.sampling_attributes->'matchedActivityCodes' ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(fu.sampling_attributes->'activityCodes')='array'
    THEN fu.sampling_attributes->'activityCodes' ELSE '[]'::jsonb END,
  COALESCE(NULLIF(fu.sampling_attributes->>'classificationVersion',''),'unknown'),
  COALESCE(NULLIF(fu.sampling_attributes->>'source',''),'unknown'),
  COALESCE(NULLIF(fu.sampling_attributes->>'prefecture',''),'unknown'),
  CASE WHEN regexp_replace(COALESCE(fu.sampling_attributes->>'postcode',''),'\\s','','g')
    ~ '^[0-9]{5}$'
    THEN left(regexp_replace(fu.sampling_attributes->>'postcode','\\s','','g'),3)
    ELSE NULL END
FROM public.research_responses rr
JOIN public.research_invites ri ON ri.id=rr.invite_id
JOIN public.research_sample_units su ON su.id=ri.sample_unit_id
JOIN public.research_frame_units fu ON fu.id=su.frame_unit_id
WHERE rr.wave_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.research_response_design_context existing
    WHERE existing.response_id=rr.id
  )
ON CONFLICT (response_id) DO NOTHING;

CREATE INDEX research_response_design_context_kad_matched_idx
  ON public.research_response_design_context USING gin(matched_kad_codes);
CREATE INDEX research_response_design_context_sector_wave_idx
  ON public.research_response_design_context(study_id,wave_id,sector_code);
COMMENT ON COLUMN public.research_response_design_context.matched_kad_codes IS
  'Matched retail-relevant GEMI KAD activities from the frozen frame, NOT self-reported primary activity; pseudonymous restricted research data.';
COMMENT ON COLUMN public.research_response_design_context.source_activity_codes IS
  'Complete observed GEMI activity code list, frozen to enable reproducible future reclassification. Never publish row-level combinations.';
COMMENT ON COLUMN public.research_response_design_context.kad_classification_version IS
  'Version of the deterministic KAD-to-sector classifier used during sampling/outreach.';
COMMENT ON COLUMN public.research_response_design_context.postcode_district3 IS
  'First three postcode digits only; no full business postcode survives in this analysis context.';
COMMIT;
