-- KONTA MOY — longitudinal variable lineage and harmonisation registry.
-- Schema 0432 gives the Retail Observatory a governed cross-wave semantic layer:
-- stable variables, wave-specific realizations, explicit question lineage,
-- harmonisation rules and pre-declared longitudinal comparison specifications.

BEGIN;

CREATE TABLE public.research_variable_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.research_programmes(id) ON DELETE RESTRICT,
  variable_key text NOT NULL CHECK (char_length(variable_key) BETWEEN 1 AND 160),
  label_el text NOT NULL CHECK (char_length(label_el) BETWEEN 1 AND 500),
  domain text NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 120),
  variable_kind text NOT NULL
    CHECK (variable_kind IN ('question','derived_index','administrative','experimental')),
  value_type text NOT NULL
    CHECK (value_type IN ('categorical','multi_categorical','numeric','matrix','text','experiment')),
  unit text,
  core_longitudinal boolean NOT NULL DEFAULT false,
  comparability_policy text NOT NULL DEFAULT 'wave_specific'
    CHECK (comparability_policy IN ('core_exact','core_harmonisable','wave_specific','not_comparable')),
  description_el text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_id,variable_key)
);

CREATE TABLE public.research_variable_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_id uuid NOT NULL REFERENCES public.research_variable_definitions(id) ON DELETE RESTRICT,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL,
  instrument_id uuid REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  source_question_id uuid REFERENCES public.research_questions(id) ON DELETE CASCADE,
  version_label text NOT NULL CHECK (char_length(version_label) BETWEEN 1 AND 160),
  source_kind text NOT NULL
    CHECK (source_kind IN ('question','derived_score','administrative','experiment')),
  source_key text NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 200),
  value_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  transform_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','retired')),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_variable_versions_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT,
  CONSTRAINT research_variable_versions_lock_time_check
    CHECK ((status='draft' AND locked_at IS NULL) OR (status<>'draft' AND locked_at IS NOT NULL)),
  CONSTRAINT research_variable_versions_question_source_check
    CHECK (
      (source_kind='question' AND source_question_id IS NOT NULL AND instrument_id IS NOT NULL)
      OR (source_kind<>'question' AND source_question_id IS NULL)
    ),
  UNIQUE (variable_id,wave_id),
  UNIQUE (source_question_id)
);

CREATE TABLE public.research_question_lineage (
  question_id uuid PRIMARY KEY REFERENCES public.research_questions(id) ON DELETE CASCADE,
  variable_version_id uuid NOT NULL UNIQUE REFERENCES public.research_variable_versions(id) ON DELETE CASCADE,
  lineage_role text NOT NULL DEFAULT 'direct'
    CHECK (lineage_role IN ('direct','component','context','experimental')),
  is_core boolean NOT NULL DEFAULT false,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_question_lineage_lock_time_check
    CHECK ((status='draft' AND locked_at IS NULL) OR (status='locked' AND locked_at IS NOT NULL))
);

CREATE TABLE public.research_harmonisation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_id uuid NOT NULL REFERENCES public.research_variable_definitions(id) ON DELETE RESTRICT,
  from_variable_version_id uuid NOT NULL REFERENCES public.research_variable_versions(id) ON DELETE RESTRICT,
  to_variable_version_id uuid NOT NULL REFERENCES public.research_variable_versions(id) ON DELETE RESTRICT,
  method text NOT NULL
    CHECK (method IN ('exact_identity','recode','linear_rescale','derived_equivalent','noncomparable')),
  comparability_status text NOT NULL
    CHECK (comparability_status IN ('exact','harmonised','break')),
  rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_harmonisation_distinct_versions_check
    CHECK (from_variable_version_id <> to_variable_version_id),
  CONSTRAINT research_harmonisation_approval_check
    CHECK (
      (status='draft' AND approved_at IS NULL)
      OR
      (status='locked' AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    ),
  UNIQUE (from_variable_version_id,to_variable_version_id)
);

CREATE TABLE public.research_longitudinal_comparison_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.research_programmes(id) ON DELETE RESTRICT,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  variable_id uuid NOT NULL REFERENCES public.research_variable_definitions(id) ON DELETE RESTRICT,
  baseline_wave_id uuid NOT NULL REFERENCES public.research_waves(id) ON DELETE RESTRICT,
  comparison_wave_id uuid NOT NULL REFERENCES public.research_waves(id) ON DELETE RESTRICT,
  harmonisation_rule_id uuid REFERENCES public.research_harmonisation_rules(id) ON DELETE RESTRICT,
  estimator text NOT NULL CHECK (char_length(estimator) BETWEEN 1 AND 240),
  analysis_plan_ref text,
  specification_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','published')),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_longitudinal_comparison_distinct_waves_check
    CHECK (baseline_wave_id <> comparison_wave_id),
  CONSTRAINT research_longitudinal_comparison_lock_time_check
    CHECK ((status='draft' AND locked_at IS NULL) OR (status<>'draft' AND locked_at IS NOT NULL)),
  UNIQUE (variable_id,baseline_wave_id,comparison_wave_id)
);

CREATE INDEX research_variable_definitions_programme_core_idx
  ON public.research_variable_definitions(programme_id,core_longitudinal,variable_key);
CREATE INDEX research_variable_versions_wave_idx
  ON public.research_variable_versions(wave_id,status,variable_id);
CREATE INDEX research_question_lineage_variable_idx
  ON public.research_question_lineage(variable_version_id,status);
CREATE INDEX research_harmonisation_rules_variable_idx
  ON public.research_harmonisation_rules(variable_id,status,created_at);
CREATE INDEX research_longitudinal_specs_study_waves_idx
  ON public.research_longitudinal_comparison_specs(study_id,baseline_wave_id,comparison_wave_id,status);

ALTER TABLE public.research_variable_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_variable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_question_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_harmonisation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_longitudinal_comparison_specs ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON
      public.research_variable_definitions,
      public.research_variable_versions,
      public.research_question_lineage,
      public.research_harmonisation_rules,
      public.research_longitudinal_comparison_specs
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON
      public.research_variable_definitions,
      public.research_variable_versions,
      public.research_question_lineage,
      public.research_harmonisation_rules,
      public.research_longitudinal_comparison_specs
    FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.research_variable_definitions TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.research_variable_versions TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.research_question_lineage TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.research_harmonisation_rules TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.research_longitudinal_comparison_specs TO bls_platform_runtime;

CREATE POLICY research_variable_definitions_platform_runtime
ON public.research_variable_definitions FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_variable_versions_platform_runtime
ON public.research_variable_versions FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_question_lineage_platform_runtime
ON public.research_question_lineage FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_harmonisation_rules_platform_runtime
ON public.research_harmonisation_rules FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_longitudinal_comparison_specs_platform_runtime
ON public.research_longitudinal_comparison_specs FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION public.research_guard_variable_definition_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.research_variable_versions
    WHERE variable_id=OLD.id AND status IN ('locked','retired')
  ) THEN
    RAISE EXCEPTION 'research variable definition has locked longitudinal evidence';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$research$;

CREATE TRIGGER research_variable_definitions_locked_immutable
BEFORE UPDATE OR DELETE ON public.research_variable_definitions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_variable_definition_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_variable_version_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  definition_programme_id uuid;
  study_programme_id uuid;
  instrument_study_id uuid;
  instrument_wave_id uuid;
  question_instrument_id uuid;
BEGIN
  SELECT programme_id INTO definition_programme_id
  FROM public.research_variable_definitions WHERE id=NEW.variable_id;
  SELECT programme_id INTO study_programme_id
  FROM public.research_studies WHERE id=NEW.study_id;

  IF definition_programme_id IS NULL
     OR study_programme_id IS NULL
     OR definition_programme_id IS DISTINCT FROM study_programme_id THEN
    RAISE EXCEPTION 'research variable version programme/study scope mismatch';
  END IF;

  IF NEW.instrument_id IS NOT NULL THEN
    SELECT study_id,wave_id INTO instrument_study_id,instrument_wave_id
    FROM public.research_instruments WHERE id=NEW.instrument_id;
    IF instrument_study_id IS NULL
       OR instrument_study_id IS DISTINCT FROM NEW.study_id
       OR instrument_wave_id IS DISTINCT FROM NEW.wave_id THEN
      RAISE EXCEPTION 'research variable version instrument scope mismatch';
    END IF;
  END IF;

  IF NEW.source_question_id IS NOT NULL THEN
    SELECT instrument_id INTO question_instrument_id
    FROM public.research_questions WHERE id=NEW.source_question_id;
    IF question_instrument_id IS NULL
       OR question_instrument_id IS DISTINCT FROM NEW.instrument_id THEN
      RAISE EXCEPTION 'research variable version question/instrument scope mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_variable_versions_00_scope_guard
BEFORE INSERT OR UPDATE ON public.research_variable_versions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_variable_version_scope();

CREATE OR REPLACE FUNCTION public.research_guard_variable_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF OLD.status IN ('locked','retired') THEN
    RAISE EXCEPTION 'research variable version is immutable in status %', OLD.status;
  END IF;

  IF TG_OP='UPDATE' AND NEW.status IN ('locked','retired') THEN
    IF (to_jsonb(NEW) - 'status' - 'locked_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'locked_at') THEN
      RAISE EXCEPTION 'locking a research variable version cannot mutate its definition';
    END IF;
    IF NEW.locked_at IS NULL THEN
      NEW.locked_at := now();
    END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$research$;

CREATE TRIGGER research_variable_versions_locked_immutable
BEFORE UPDATE OR DELETE ON public.research_variable_versions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_variable_version_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_question_lineage_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  mapped_question_id uuid;
BEGIN
  IF TG_OP<>'DELETE' THEN
    SELECT source_question_id INTO mapped_question_id
    FROM public.research_variable_versions
    WHERE id=NEW.variable_version_id;
    IF mapped_question_id IS NULL OR mapped_question_id IS DISTINCT FROM NEW.question_id THEN
      RAISE EXCEPTION 'research question lineage must reference the variable version sourced by that question';
    END IF;
  END IF;

  IF TG_OP<>'INSERT' AND OLD.status='locked' THEN
    RAISE EXCEPTION 'research question lineage is locked';
  END IF;

  IF TG_OP='UPDATE' AND NEW.status='locked' THEN
    IF (to_jsonb(NEW) - 'status' - 'locked_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'locked_at') THEN
      RAISE EXCEPTION 'locking research question lineage cannot mutate its mapping';
    END IF;
    IF NEW.locked_at IS NULL THEN
      NEW.locked_at := now();
    END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$research$;

CREATE TRIGGER research_question_lineage_locked_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.research_question_lineage
FOR EACH ROW EXECUTE FUNCTION public.research_guard_question_lineage_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_harmonisation_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  from_variable_id uuid;
  to_variable_id uuid;
  from_study_id uuid;
  to_study_id uuid;
  from_wave_id uuid;
  to_wave_id uuid;
  from_status text;
  to_status text;
  from_ordinal integer;
  to_ordinal integer;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='locked' THEN
    RAISE EXCEPTION 'locked research harmonisation rule is immutable';
  END IF;

  IF TG_OP='DELETE' THEN
    IF OLD.status='locked' THEN
      RAISE EXCEPTION 'locked research harmonisation rule is immutable';
    END IF;
    RETURN OLD;
  END IF;

  SELECT variable_id,study_id,wave_id,status
  INTO from_variable_id,from_study_id,from_wave_id,from_status
  FROM public.research_variable_versions
  WHERE id=NEW.from_variable_version_id;

  SELECT variable_id,study_id,wave_id,status
  INTO to_variable_id,to_study_id,to_wave_id,to_status
  FROM public.research_variable_versions
  WHERE id=NEW.to_variable_version_id;

  IF from_variable_id IS NULL OR to_variable_id IS NULL
     OR from_variable_id IS DISTINCT FROM NEW.variable_id
     OR to_variable_id IS DISTINCT FROM NEW.variable_id THEN
    RAISE EXCEPTION 'harmonisation versions must realize the same stable variable';
  END IF;
  IF from_study_id IS DISTINCT FROM to_study_id THEN
    RAISE EXCEPTION 'harmonisation cannot compare variable versions from different studies';
  END IF;

  SELECT ordinal INTO from_ordinal FROM public.research_waves WHERE id=from_wave_id;
  SELECT ordinal INTO to_ordinal FROM public.research_waves WHERE id=to_wave_id;
  IF from_ordinal IS NULL OR to_ordinal IS NULL OR from_ordinal >= to_ordinal THEN
    RAISE EXCEPTION 'harmonisation must point from an earlier wave to a later wave';
  END IF;

  IF NEW.status='locked' AND (from_status<>'locked' OR to_status<>'locked') THEN
    RAISE EXCEPTION 'locked harmonisation requires locked variable versions';
  END IF;
  IF NEW.method='exact_identity' AND NEW.comparability_status<>'exact' THEN
    RAISE EXCEPTION 'exact identity harmonisation must be marked exact';
  END IF;
  IF NEW.method='noncomparable' AND NEW.comparability_status<>'break' THEN
    RAISE EXCEPTION 'noncomparable harmonisation must be marked as a break';
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_harmonisation_rules_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.research_harmonisation_rules
FOR EACH ROW EXECUTE FUNCTION public.research_guard_harmonisation_rule();

CREATE OR REPLACE FUNCTION public.research_guard_longitudinal_comparison_spec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  study_programme_id uuid;
  variable_programme_id uuid;
  baseline_study_id uuid;
  comparison_study_id uuid;
  baseline_ordinal integer;
  comparison_ordinal integer;
  rule_variable_id uuid;
  rule_from_wave_id uuid;
  rule_to_wave_id uuid;
  rule_status text;
  rule_comparability_status text;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='published' THEN
    RAISE EXCEPTION 'published longitudinal comparison specification is immutable';
  END IF;

  IF TG_OP='UPDATE' AND OLD.status='locked' THEN
    IF NEW.status<>'published'
       OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'locked longitudinal comparison specification only permits status-only publication';
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND OLD.status='draft' AND NEW.status='published' THEN
    RAISE EXCEPTION 'longitudinal comparison must be locked before publication';
  END IF;

  IF TG_OP='DELETE' THEN
    IF OLD.status IN ('locked','published') THEN
      RAISE EXCEPTION 'locked longitudinal comparison specification is immutable';
    END IF;
    RETURN OLD;
  END IF;

  SELECT programme_id INTO study_programme_id
  FROM public.research_studies WHERE id=NEW.study_id;
  SELECT programme_id INTO variable_programme_id
  FROM public.research_variable_definitions WHERE id=NEW.variable_id;
  IF study_programme_id IS NULL
     OR variable_programme_id IS NULL
     OR study_programme_id IS DISTINCT FROM NEW.programme_id
     OR variable_programme_id IS DISTINCT FROM NEW.programme_id THEN
    RAISE EXCEPTION 'longitudinal comparison programme/study/variable scope mismatch';
  END IF;

  SELECT study_id,ordinal INTO baseline_study_id,baseline_ordinal
  FROM public.research_waves WHERE id=NEW.baseline_wave_id;
  SELECT study_id,ordinal INTO comparison_study_id,comparison_ordinal
  FROM public.research_waves WHERE id=NEW.comparison_wave_id;

  IF baseline_study_id IS DISTINCT FROM NEW.study_id
     OR comparison_study_id IS DISTINCT FROM NEW.study_id THEN
    RAISE EXCEPTION 'longitudinal comparison waves must belong to the selected study';
  END IF;
  IF baseline_ordinal IS NULL OR comparison_ordinal IS NULL OR baseline_ordinal >= comparison_ordinal THEN
    RAISE EXCEPTION 'longitudinal comparison must point from an earlier wave to a later wave';
  END IF;

  IF NEW.status IN ('locked','published') THEN
    IF NEW.harmonisation_rule_id IS NULL THEN
      RAISE EXCEPTION 'locked longitudinal comparison requires an explicit harmonisation rule';
    END IF;

    SELECT
      hr.variable_id,
      from_version.wave_id,
      to_version.wave_id,
      hr.status,
      hr.comparability_status
    INTO rule_variable_id,rule_from_wave_id,rule_to_wave_id,rule_status,rule_comparability_status
    FROM public.research_harmonisation_rules hr
    JOIN public.research_variable_versions from_version ON from_version.id=hr.from_variable_version_id
    JOIN public.research_variable_versions to_version ON to_version.id=hr.to_variable_version_id
    WHERE hr.id=NEW.harmonisation_rule_id;

    IF rule_status IS DISTINCT FROM 'locked'
       OR rule_variable_id IS DISTINCT FROM NEW.variable_id
       OR rule_from_wave_id IS DISTINCT FROM NEW.baseline_wave_id
       OR rule_to_wave_id IS DISTINCT FROM NEW.comparison_wave_id THEN
      RAISE EXCEPTION 'longitudinal comparison requires a matching locked harmonisation rule';
    END IF;
    IF rule_comparability_status='break' THEN
      RAISE EXCEPTION 'a comparability break cannot authorize a longitudinal estimate';
    END IF;

    IF NEW.locked_at IS NULL THEN
      NEW.locked_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_longitudinal_comparison_specs_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.research_longitudinal_comparison_specs
FOR EACH ROW EXECUTE FUNCTION public.research_guard_longitudinal_comparison_spec();

-- Seed the stable 2026 core questionnaire dictionary. The current instrument is
-- still draft, so these realizations remain draft and will be locked together
-- with the instrument after methodological approval.
INSERT INTO public.research_variable_definitions (
  programme_id,variable_key,label_el,domain,variable_kind,value_type,
  core_longitudinal,comparability_policy,description_el
)
SELECT
  s.programme_id,
  q.analysis_key,
  q.prompt_el,
  q.section_code,
  'question',
  CASE q.question_type
    WHEN 'single' THEN 'categorical'
    WHEN 'multi' THEN 'multi_categorical'
    WHEN 'scale' THEN 'numeric'
    WHEN 'matrix' THEN 'matrix'
    WHEN 'text' THEN 'text'
    ELSE 'experiment'
  END,
  true,
  CASE WHEN q.question_type='text' THEN 'not_comparable' ELSE 'core_harmonisable' END,
  'Stable Observatory variable seeded from Greek Retail 2026 ' || q.code || '.'
FROM public.research_questions q
JOIN public.research_instruments i ON i.id=q.instrument_id
JOIN public.research_studies s ON s.id=i.study_id
WHERE i.id='1b1bc971-705a-4b97-92c5-202600000002'::uuid
  AND q.code ~ '^Q(0[1-9]|1[0-8])$'
ON CONFLICT (programme_id,variable_key) DO NOTHING;

INSERT INTO public.research_variable_versions (
  variable_id,study_id,wave_id,instrument_id,source_question_id,
  version_label,source_kind,source_key,value_schema,transform_spec,status,locked_at
)
SELECT
  vd.id,
  s.id,
  i.wave_id,
  i.id,
  q.id,
  i.version || ':' || q.code,
  'question',
  q.code,
  jsonb_build_object(
    'questionType',q.question_type,
    'required',q.required,
    'analysisKey',q.analysis_key,
    'config',q.config
  ),
  '{"kind":"identity","source":"research_answers.answer"}'::jsonb,
  CASE WHEN i.status='draft' THEN 'draft' ELSE 'locked' END,
  CASE WHEN i.status='draft' THEN NULL ELSE now() END
FROM public.research_questions q
JOIN public.research_instruments i ON i.id=q.instrument_id
JOIN public.research_studies s ON s.id=i.study_id
JOIN public.research_variable_definitions vd
  ON vd.programme_id=s.programme_id
 AND vd.variable_key=q.analysis_key
WHERE i.id='1b1bc971-705a-4b97-92c5-202600000002'::uuid
  AND q.code ~ '^Q(0[1-9]|1[0-8])$'
ON CONFLICT (variable_id,wave_id) DO NOTHING;

INSERT INTO public.research_question_lineage (
  question_id,variable_version_id,lineage_role,is_core,evidence_json,status,locked_at
)
SELECT
  vv.source_question_id,
  vv.id,
  'direct',
  true,
  jsonb_build_object(
    'seed','greek-retail-2026',
    'analysisKey',q.analysis_key,
    'questionCode',q.code
  ),
  CASE WHEN vv.status='draft' THEN 'draft' ELSE 'locked' END,
  vv.locked_at
FROM public.research_variable_versions vv
JOIN public.research_questions q ON q.id=vv.source_question_id
WHERE vv.instrument_id='1b1bc971-705a-4b97-92c5-202600000002'::uuid
  AND vv.source_kind='question'
ON CONFLICT (question_id) DO NOTHING;

INSERT INTO public.research_variable_definitions (
  programme_id,variable_key,label_el,domain,variable_kind,value_type,unit,
  core_longitudinal,comparability_policy,description_el
)
SELECT
  s.programme_id,
  seed.variable_key,
  seed.label_el,
  'headline_indices',
  'derived_index',
  'numeric',
  '0-100',
  true,
  'core_harmonisable',
  seed.description_el
FROM public.research_studies s
CROSS JOIN (
  VALUES
    ('digital_readiness_score','Greek Retail Digital Readiness Score','Stable 0–100 Observatory digital-readiness construct.'),
    ('retail_friction_index','Independent Retail Friction Index','Stable 0–100 Observatory retail-friction construct.')
) AS seed(variable_key,label_el,description_el)
WHERE s.id='1b1bc971-705a-4b97-92c5-202600000001'::uuid
ON CONFLICT (programme_id,variable_key) DO NOTHING;

INSERT INTO public.research_variable_versions (
  variable_id,study_id,wave_id,instrument_id,version_label,source_kind,source_key,
  value_schema,transform_spec,status,locked_at
)
SELECT
  vd.id,
  s.id,
  i.wave_id,
  i.id,
  i.version || ':' || seed.source_key,
  'derived_score',
  seed.source_key,
  '{"type":"number","minimum":0,"maximum":100}'::jsonb,
  jsonb_build_object(
    'kind','derived_score',
    'scoringVersion','greek-retail-2026-v1',
    'sourceColumn',seed.source_column
  ),
  CASE WHEN i.status='draft' THEN 'draft' ELSE 'locked' END,
  CASE WHEN i.status='draft' THEN NULL ELSE now() END
FROM public.research_studies s
JOIN public.research_instruments i ON i.id='1b1bc971-705a-4b97-92c5-202600000002'::uuid
JOIN (
  VALUES
    ('digital_readiness_score','digital_readiness_score','digital_readiness_score'),
    ('retail_friction_index','retail_friction_index','friction_overall_score')
) AS seed(variable_key,source_key,source_column) ON true
JOIN public.research_variable_definitions vd
  ON vd.programme_id=s.programme_id
 AND vd.variable_key=seed.variable_key
WHERE s.id='1b1bc971-705a-4b97-92c5-202600000001'::uuid
ON CONFLICT (variable_id,wave_id) DO NOTHING;

-- A draft longitudinal registry may evolve while its questionnaire is draft.
-- As soon as the instrument is locked, the corresponding semantic realization
-- and explicit question-lineage rows are locked in the same transaction.
CREATE OR REPLACE FUNCTION public.research_lock_longitudinal_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF OLD.status='draft' AND NEW.status IN ('locked','fielding','retired') THEN
    UPDATE public.research_variable_versions
    SET status='locked',locked_at=COALESCE(locked_at,now())
    WHERE instrument_id=NEW.id
      AND status='draft';

    UPDATE public.research_question_lineage ql
    SET status='locked',locked_at=COALESCE(ql.locked_at,now())
    FROM public.research_variable_versions vv
    WHERE vv.id=ql.variable_version_id
      AND vv.instrument_id=NEW.id
      AND ql.status='draft';
  END IF;
  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_instruments_lock_longitudinal_registry
AFTER UPDATE OF status ON public.research_instruments
FOR EACH ROW EXECUTE FUNCTION public.research_lock_longitudinal_registry();

REVOKE EXECUTE ON FUNCTION public.research_guard_variable_definition_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_variable_version_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_variable_version_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_question_lineage_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_harmonisation_rule() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_longitudinal_comparison_spec() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_lock_longitudinal_registry() FROM PUBLIC;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_variable_definition_mutation() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_variable_version_scope() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_variable_version_mutation() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_question_lineage_mutation() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_harmonisation_rule() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_longitudinal_comparison_spec() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_lock_longitudinal_registry() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_variable_definition_mutation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_variable_version_scope() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_variable_version_mutation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_question_lineage_mutation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_harmonisation_rule() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_longitudinal_comparison_spec() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_lock_longitudinal_registry() FROM authenticated;
  END IF;
END;
$research$;

GRANT EXECUTE ON FUNCTION public.research_guard_variable_definition_mutation() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_variable_version_scope() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_variable_version_mutation() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_question_lineage_mutation() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_harmonisation_rule() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_longitudinal_comparison_spec() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_lock_longitudinal_registry() TO bls_platform_runtime;

COMMIT;
