-- KONTA MOY — research response-quality evidence v3.
-- Schema 0430 adds an explicit 0–100 quality score and a one-way full-answer
-- pattern fingerprint used only to route suspicious exact duplicates to manual
-- review. Neither field authorizes automatic exclusion.

BEGIN;

ALTER TABLE public.research_response_quality_reviews
  ADD COLUMN quality_score numeric(5,2)
    CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  ADD COLUMN answer_pattern_sha256 text
    CHECK (answer_pattern_sha256 IS NULL OR answer_pattern_sha256 ~ '^[a-f0-9]{64}$');

CREATE INDEX research_quality_answer_pattern_idx
  ON public.research_response_quality_reviews(answer_pattern_sha256, created_at DESC)
  WHERE answer_pattern_sha256 IS NOT NULL;

COMMIT;
