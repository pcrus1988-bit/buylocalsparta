-- KONTA MOY — General Paint & Build guidance schema and three-layer resolver.
-- Layer A: GENERAL_GUIDANCE. Layer C: KONTA_MOU_RULE.
-- Layer B manufacturer data is independent and defined by migration 0263.
-- Reconciles the source-backed guidance schema already present in production.

BEGIN;

CREATE TABLE IF NOT EXISTS public.general_build_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_key text NOT NULL,
  organization text NOT NULL,
  source_type text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  jurisdiction text NOT NULL,
  standard_identifier text,
  publication_date date,
  revision text,
  retrieved_at timestamp with time zone DEFAULT now() NOT NULL,
  relevant_section_page text,
  source_status text DEFAULT 'current'::text NOT NULL,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT general_build_sources_pkey PRIMARY KEY (id),
  CONSTRAINT general_build_sources_source_key_key UNIQUE (source_key),
  CONSTRAINT general_build_sources_source_status_check CHECK (source_status = ANY (ARRAY['current'::text, 'superseded'::text, 'withdrawn'::text, 'draft'::text, 'reference_only'::text])),
  CONSTRAINT general_build_sources_source_type_check CHECK (source_type = ANY (ARRAY['regulation'::text, 'standard'::text, 'ead_eta'::text, 'government_guidance'::text, 'professional_guidance'::text, 'university_research'::text, 'peer_reviewed'::text, 'manufacturer_general_practice'::text, 'internal_governance'::text]))
);

CREATE TABLE IF NOT EXISTS public.build_solution_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  solution_key text NOT NULL,
  module text NOT NULL,
  title_el text NOT NULL,
  title_en text,
  description_el text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_solution_types_module_check CHECK (module = ANY (ARRAY['painting'::text, 'waterproofing'::text, 'thermal_insulation'::text, 'wall_repair'::text])),
  CONSTRAINT build_solution_types_pkey PRIMARY KEY (id),
  CONSTRAINT build_solution_types_solution_key_key UNIQUE (solution_key)
);

CREATE TABLE IF NOT EXISTS public.build_problem_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  problem_key text NOT NULL,
  title_el text NOT NULL,
  title_en text,
  description_el text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_problem_types_pkey PRIMARY KEY (id),
  CONSTRAINT build_problem_types_problem_key_key UNIQUE (problem_key)
);

CREATE TABLE IF NOT EXISTS public.build_solution_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_key text NOT NULL,
  solution_type_id uuid NOT NULL,
  problem_type_id uuid,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  substrate text NOT NULL,
  interior_exterior text NOT NULL,
  customer_title_el text NOT NULL,
  technical_summary text NOT NULL,
  customer_explanation_el text NOT NULL,
  short_explanation_el text NOT NULL,
  typical_causes jsonb DEFAULT '[]'::jsonb NOT NULL,
  visual_symptoms jsonb DEFAULT '[]'::jsonb NOT NULL,
  diagnostic_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
  required_prechecks jsonb DEFAULT '[]'::jsonb NOT NULL,
  suitable_solution_types jsonb DEFAULT '[]'::jsonb NOT NULL,
  unsuitable_solution_types jsonb DEFAULT '[]'::jsonb NOT NULL,
  surface_preparation jsonb DEFAULT '[]'::jsonb NOT NULL,
  repair_sequence jsonb DEFAULT '[]'::jsonb NOT NULL,
  primer_role jsonb DEFAULT '[]'::jsonb NOT NULL,
  basecoat_role jsonb DEFAULT '[]'::jsonb NOT NULL,
  topcoat_role jsonb DEFAULT '[]'::jsonb NOT NULL,
  required_system_layers jsonb DEFAULT '[]'::jsonb NOT NULL,
  optional_system_layers jsonb DEFAULT '[]'::jsonb NOT NULL,
  drying_dependencies jsonb DEFAULT '[]'::jsonb NOT NULL,
  substrate_moisture_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  temperature_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  humidity_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  weather_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  uv_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  rain_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  condensation_considerations jsonb DEFAULT '[]'::jsonb NOT NULL,
  ventilation_requirements jsonb DEFAULT '[]'::jsonb NOT NULL,
  compatibility_principles jsonb DEFAULT '[]'::jsonb NOT NULL,
  common_failure_modes jsonb DEFAULT '[]'::jsonb NOT NULL,
  common_user_mistakes jsonb DEFAULT '[]'::jsonb NOT NULL,
  warning_signs jsonb DEFAULT '[]'::jsonb NOT NULL,
  inspection_after_application jsonb DEFAULT '[]'::jsonb NOT NULL,
  maintenance_guidance jsonb DEFAULT '[]'::jsonb NOT NULL,
  ppe_general jsonb DEFAULT '[]'::jsonb NOT NULL,
  tool_categories_required jsonb DEFAULT '[]'::jsonb NOT NULL,
  protection_materials_required jsonb DEFAULT '[]'::jsonb NOT NULL,
  evidence_status text DEFAULT 'unknown'::text NOT NULL,
  review_status text DEFAULT 'draft'::text NOT NULL,
  published boolean DEFAULT false NOT NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_solution_profiles_evidence_status_check CHECK (evidence_status = ANY (ARRAY['verified'::text, 'partial'::text, 'unknown'::text, 'professional_assessment_recommended'::text])),
  CONSTRAINT build_solution_profiles_interior_exterior_check CHECK (interior_exterior = ANY (ARRAY['interior'::text, 'exterior'::text, 'both'::text])),
  CONSTRAINT build_solution_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT build_solution_profiles_problem_type_id_fkey FOREIGN KEY (problem_type_id) REFERENCES build_problem_types(id) ON DELETE RESTRICT,
  CONSTRAINT build_solution_profiles_review_status_check CHECK (review_status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'approved'::text])),
  CONSTRAINT build_solution_profiles_scenario_key_key UNIQUE (scenario_key),
  CONSTRAINT build_solution_profiles_solution_type_id_fkey FOREIGN KEY (solution_type_id) REFERENCES build_solution_types(id) ON DELETE RESTRICT,
  CONSTRAINT build_solution_profiles_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text)
);

CREATE TABLE IF NOT EXISTS public.build_solution_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid NOT NULL,
  rule_key text NOT NULL,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  rule_category text NOT NULL,
  technical_rule text NOT NULL,
  customer_explanation_el text NOT NULL,
  short_explanation_el text NOT NULL,
  evidence_strength text NOT NULL,
  applicability jsonb DEFAULT '{}'::jsonb NOT NULL,
  context_dependent boolean DEFAULT false NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_solution_rules_evidence_strength_check CHECK (evidence_strength = ANY (ARRAY['regulatory'::text, 'standard_based'::text, 'strong_consensus'::text, 'common_professional_practice'::text, 'context_dependent'::text])),
  CONSTRAINT build_solution_rules_pkey PRIMARY KEY (id),
  CONSTRAINT build_solution_rules_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_solution_rules_scenario_id_rule_key_key UNIQUE (scenario_id, rule_key),
  CONSTRAINT build_solution_rules_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text)
);

CREATE TABLE IF NOT EXISTS public.build_diagnostic_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid NOT NULL,
  diagnostic_key text NOT NULL,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  question_el text NOT NULL,
  observable_indicators jsonb DEFAULT '[]'::jsonb NOT NULL,
  condition_expression jsonb DEFAULT '{}'::jsonb NOT NULL,
  possible_interpretations jsonb DEFAULT '[]'::jsonb NOT NULL,
  uncertainty_flag boolean DEFAULT true NOT NULL,
  outcome jsonb DEFAULT '{}'::jsonb NOT NULL,
  evidence_strength text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_diagnostic_rules_evidence_strength_check CHECK (evidence_strength = ANY (ARRAY['regulatory'::text, 'standard_based'::text, 'strong_consensus'::text, 'common_professional_practice'::text, 'context_dependent'::text])),
  CONSTRAINT build_diagnostic_rules_pkey PRIMARY KEY (id),
  CONSTRAINT build_diagnostic_rules_scenario_id_diagnostic_key_key UNIQUE (scenario_id, diagnostic_key),
  CONSTRAINT build_diagnostic_rules_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_diagnostic_rules_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text)
);

CREATE TABLE IF NOT EXISTS public.build_solution_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid NOT NULL,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  step_number integer NOT NULL,
  step_type text NOT NULL,
  required boolean DEFAULT true NOT NULL,
  conditional_expression jsonb DEFAULT '{}'::jsonb NOT NULL,
  prerequisite_step_numbers integer[] DEFAULT '{}'::integer[] NOT NULL,
  next_allowed_step_numbers integer[] DEFAULT '{}'::integer[] NOT NULL,
  technical_rule text NOT NULL,
  customer_explanation_el text NOT NULL,
  evidence_strength text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_solution_steps_evidence_strength_check CHECK (evidence_strength = ANY (ARRAY['regulatory'::text, 'standard_based'::text, 'strong_consensus'::text, 'common_professional_practice'::text, 'context_dependent'::text])),
  CONSTRAINT build_solution_steps_pkey PRIMARY KEY (id),
  CONSTRAINT build_solution_steps_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_solution_steps_scenario_id_step_number_key UNIQUE (scenario_id, step_number),
  CONSTRAINT build_solution_steps_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text),
  CONSTRAINT build_solution_steps_step_number_check CHECK (step_number > 0)
);

CREATE TABLE IF NOT EXISTS public.build_stop_conditions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid,
  stop_key text NOT NULL,
  source_layer text DEFAULT 'KONTA_MOU_RULE'::text NOT NULL,
  severity text NOT NULL,
  condition_expression jsonb NOT NULL,
  reason_el text NOT NULL,
  next_action_el text NOT NULL,
  professional_assessment_required boolean DEFAULT false NOT NULL,
  evidence_basis text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_stop_conditions_pkey PRIMARY KEY (id),
  CONSTRAINT build_stop_conditions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_stop_conditions_scenario_id_stop_key_key UNIQUE (scenario_id, stop_key),
  CONSTRAINT build_stop_conditions_severity_check CHECK (severity = ANY (ARRAY['WARN'::text, 'BLOCK'::text])),
  CONSTRAINT build_stop_conditions_source_layer_check CHECK (source_layer = 'KONTA_MOU_RULE'::text)
);

CREATE TABLE IF NOT EXISTS public.build_failure_modes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid NOT NULL,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  failure_key text NOT NULL,
  title_el text NOT NULL,
  possible_causes jsonb DEFAULT '[]'::jsonb NOT NULL,
  preventive_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
  observable_symptoms jsonb DEFAULT '[]'::jsonb NOT NULL,
  severity text NOT NULL,
  corrective_action_category text NOT NULL,
  evidence_strength text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_failure_modes_evidence_strength_check CHECK (evidence_strength = ANY (ARRAY['regulatory'::text, 'standard_based'::text, 'strong_consensus'::text, 'common_professional_practice'::text, 'context_dependent'::text])),
  CONSTRAINT build_failure_modes_pkey PRIMARY KEY (id),
  CONSTRAINT build_failure_modes_scenario_id_failure_key_key UNIQUE (scenario_id, failure_key),
  CONSTRAINT build_failure_modes_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_failure_modes_severity_check CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'unknown'::text])),
  CONSTRAINT build_failure_modes_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text)
);

CREATE TABLE IF NOT EXISTS public.build_tool_requirements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid NOT NULL,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  tool_category text NOT NULL,
  requirement_level text NOT NULL,
  reason_el text NOT NULL,
  condition_expression jsonb DEFAULT '{}'::jsonb NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_tool_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT build_tool_requirements_requirement_level_check CHECK (requirement_level = ANY (ARRAY['required'::text, 'optional'::text, 'conditional'::text])),
  CONSTRAINT build_tool_requirements_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_tool_requirements_scenario_id_tool_category_key UNIQUE (scenario_id, tool_category),
  CONSTRAINT build_tool_requirements_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text)
);

CREATE TABLE IF NOT EXISTS public.build_project_kit_requirements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scenario_id uuid NOT NULL,
  source_layer text DEFAULT 'GENERAL_GUIDANCE'::text NOT NULL,
  requirement_type text NOT NULL,
  requirement_level text NOT NULL,
  reason_el text NOT NULL,
  quantity_basis text NOT NULL,
  compatibility_constraints jsonb DEFAULT '[]'::jsonb NOT NULL,
  customer_can_replace boolean DEFAULT true NOT NULL,
  condition_expression jsonb DEFAULT '{}'::jsonb NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT build_project_kit_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT build_project_kit_requirements_requirement_level_check CHECK (requirement_level = ANY (ARRAY['required'::text, 'optional'::text, 'conditional'::text])),
  CONSTRAINT build_project_kit_requirements_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES build_solution_profiles(id) ON DELETE CASCADE,
  CONSTRAINT build_project_kit_requirements_scenario_id_requirement_type_key UNIQUE (scenario_id, requirement_type),
  CONSTRAINT build_project_kit_requirements_source_layer_check CHECK (source_layer = 'GENERAL_GUIDANCE'::text)
);

CREATE TABLE IF NOT EXISTS public.general_build_rule_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source_id uuid NOT NULL,
  supporting_passage text NOT NULL,
  relevant_section_page text,
  evidence_strength text NOT NULL,
  applicability text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT general_build_rule_evidence_entity_type_check CHECK (entity_type = ANY (ARRAY['profile'::text, 'solution_rule'::text, 'diagnostic_rule'::text, 'solution_step'::text, 'stop_condition'::text, 'failure_mode'::text, 'tool_requirement'::text, 'project_kit_requirement'::text])),
  CONSTRAINT general_build_rule_evidence_entity_type_entity_id_source_id_key UNIQUE (entity_type, entity_id, source_id),
  CONSTRAINT general_build_rule_evidence_evidence_strength_check CHECK (evidence_strength = ANY (ARRAY['regulatory'::text, 'standard_based'::text, 'strong_consensus'::text, 'common_professional_practice'::text, 'context_dependent'::text])),
  CONSTRAINT general_build_rule_evidence_pkey PRIMARY KEY (id),
  CONSTRAINT general_build_rule_evidence_source_id_fkey FOREIGN KEY (source_id) REFERENCES general_build_sources(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS build_diagnostic_rules_scenario_idx ON public.build_diagnostic_rules USING btree (scenario_id, active);

CREATE INDEX IF NOT EXISTS build_solution_profiles_problem_idx ON public.build_solution_profiles USING btree (problem_type_id, published);

CREATE INDEX IF NOT EXISTS build_solution_profiles_type_idx ON public.build_solution_profiles USING btree (solution_type_id, published, review_status);

CREATE INDEX IF NOT EXISTS build_solution_rules_scenario_idx ON public.build_solution_rules USING btree (scenario_id, active);

CREATE INDEX IF NOT EXISTS build_solution_steps_scenario_idx ON public.build_solution_steps USING btree (scenario_id, step_number) WHERE active;

CREATE UNIQUE INDEX IF NOT EXISTS build_stop_conditions_global_key_uidx ON public.build_stop_conditions USING btree (stop_key) WHERE (scenario_id IS NULL);

CREATE INDEX IF NOT EXISTS build_stop_conditions_scenario_idx ON public.build_stop_conditions USING btree (scenario_id, severity) WHERE active;

CREATE INDEX IF NOT EXISTS general_build_rule_evidence_entity_idx ON public.general_build_rule_evidence USING btree (entity_type, entity_id) WHERE active;

CREATE INDEX IF NOT EXISTS general_build_rule_evidence_source_idx ON public.general_build_rule_evidence USING btree (source_id) WHERE active;

ALTER TABLE public.general_build_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_solution_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_problem_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_solution_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_solution_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_diagnostic_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_solution_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_stop_conditions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_failure_modes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_tool_requirements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.build_project_kit_requirements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.general_build_rule_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read diagnostics for published profiles" ON public."build_diagnostic_rules";

CREATE POLICY "public read diagnostics for published profiles" ON public."build_diagnostic_rules" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_diagnostic_rules.scenario_id) AND p.published AND (p.review_status = 'approved'::text))))));

DROP POLICY IF EXISTS "public read failure modes for published profiles" ON public."build_failure_modes";

CREATE POLICY "public read failure modes for published profiles" ON public."build_failure_modes" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_failure_modes.scenario_id) AND p.published AND (p.review_status = 'approved'::text))))));

DROP POLICY IF EXISTS "public read active build problem types" ON public."build_problem_types";

CREATE POLICY "public read active build problem types" ON public."build_problem_types" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (active);

DROP POLICY IF EXISTS "public read kits for published profiles" ON public."build_project_kit_requirements";

CREATE POLICY "public read kits for published profiles" ON public."build_project_kit_requirements" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_project_kit_requirements.scenario_id) AND p.published AND (p.review_status = 'approved'::text))))));

DROP POLICY IF EXISTS "public read published build profiles" ON public."build_solution_profiles";

CREATE POLICY "public read published build profiles" ON public."build_solution_profiles" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((published AND (review_status = 'approved'::text)));

DROP POLICY IF EXISTS "public read rules for published profiles" ON public."build_solution_rules";

CREATE POLICY "public read rules for published profiles" ON public."build_solution_rules" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_solution_rules.scenario_id) AND p.published AND (p.review_status = 'approved'::text))))));

DROP POLICY IF EXISTS "public read steps for published profiles" ON public."build_solution_steps";

CREATE POLICY "public read steps for published profiles" ON public."build_solution_steps" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_solution_steps.scenario_id) AND p.published AND (p.review_status = 'approved'::text))))));

DROP POLICY IF EXISTS "public read active build solution types" ON public."build_solution_types";

CREATE POLICY "public read active build solution types" ON public."build_solution_types" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (active);

DROP POLICY IF EXISTS "public read stop conditions for published profiles" ON public."build_stop_conditions";

CREATE POLICY "public read stop conditions for published profiles" ON public."build_stop_conditions" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND ((scenario_id IS NULL) OR (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_stop_conditions.scenario_id) AND p.published AND (p.review_status = 'approved'::text)))))));

DROP POLICY IF EXISTS "public read tools for published profiles" ON public."build_tool_requirements";

CREATE POLICY "public read tools for published profiles" ON public."build_tool_requirements" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM build_solution_profiles p
  WHERE ((p.id = build_tool_requirements.scenario_id) AND p.published AND (p.review_status = 'approved'::text))))));

DROP POLICY IF EXISTS "public read evidence for active sources" ON public."general_build_rule_evidence";

CREATE POLICY "public read evidence for active sources" ON public."general_build_rule_evidence" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active AND (EXISTS ( SELECT 1
   FROM general_build_sources s
  WHERE ((s.id = general_build_rule_evidence.source_id) AND s.active)))));

DROP POLICY IF EXISTS "public read active general build sources" ON public."general_build_sources";

CREATE POLICY "public read active general build sources" ON public."general_build_sources" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (active);

GRANT SELECT ON public.general_build_sources, public.build_solution_types, public.build_problem_types, public.build_solution_profiles, public.build_solution_rules, public.build_diagnostic_rules, public.build_solution_steps, public.build_stop_conditions, public.build_failure_modes, public.build_tool_requirements, public.build_project_kit_requirements, public.general_build_rule_evidence TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.build_guidance_evidence(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'evidence_id', e.id,
        'source_id', s.id,
        'source_key', s.source_key,
        'organization', s.organization,
        'source_type', s.source_type,
        'title', s.title,
        'url', s.url,
        'jurisdiction', s.jurisdiction,
        'standard_identifier', s.standard_identifier,
        'publication_date', s.publication_date,
        'revision', s.revision,
        'relevant_section_page', COALESCE(e.relevant_section_page, s.relevant_section_page),
        'supporting_passage', e.supporting_passage,
        'evidence_strength', e.evidence_strength,
        'applicability', e.applicability
      )
      ORDER BY s.organization, s.title
    ),
    '[]'::jsonb
  )
  FROM public.general_build_rule_evidence e
  JOIN public.general_build_sources s ON s.id = e.source_id
  WHERE e.entity_type = p_entity_type
    AND e.entity_id = p_entity_id
    AND e.active
    AND s.active;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_build_project_guidance(p_scenario_key text, p_facts jsonb DEFAULT '{}'::jsonb, p_manufacturer_product_id uuid DEFAULT NULL::uuid, p_guidance_conflict boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_profile public.build_solution_profiles%ROWTYPE;
  v_product public.manufacturer_products%ROWTYPE;
  v_mfg_profile public.manufacturer_application_profiles%ROWTYPE;
  v_has_product boolean := false;
  v_has_verified_mfg boolean := false;
  v_conflict boolean := false;
  v_effective_facts jsonb := '{}'::jsonb;
  v_triggered_stops jsonb := '[]'::jsonb;
  v_blocked boolean := false;
  v_general jsonb;
  v_manufacturer jsonb;
BEGIN
  SELECT *
  INTO v_profile
  FROM public.build_solution_profiles p
  WHERE p.scenario_key = p_scenario_key
    AND p.published
    AND p.review_status = 'approved'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'scenario_not_found',
      'scenario_key', p_scenario_key,
      'guidance_conflict', false,
      'blocked', true,
      'general_guidance', NULL,
      'manufacturer_guidance', jsonb_build_object('status','not_evaluated'),
      'konta_mou_rules', jsonb_build_object('triggered_stop_conditions','[]'::jsonb)
    );
  END IF;

  IF p_manufacturer_product_id IS NOT NULL THEN
    SELECT *
    INTO v_product
    FROM public.manufacturer_products mp
    WHERE mp.id = p_manufacturer_product_id
      AND mp.product_system_status = 'current'
    LIMIT 1;

    v_has_product := FOUND;

    IF v_has_product THEN
      SELECT *
      INTO v_mfg_profile
      FROM public.manufacturer_application_profiles ap
      WHERE ap.product_id = v_product.id
        AND ap.source_layer = 'manufacturer'
        AND ap.verification_status = 'verified'
        AND ap.is_current
        AND (ap.valid_from IS NULL OR ap.valid_from <= CURRENT_DATE)
        AND (ap.valid_to IS NULL OR ap.valid_to >= CURRENT_DATE)
      ORDER BY ap.last_verified_at DESC NULLS LAST, ap.updated_at DESC
      LIMIT 1;

      v_has_verified_mfg := FOUND;
    END IF;
  END IF;

  v_conflict := COALESCE(p_guidance_conflict, false)
    OR COALESCE(p_facts @> '{"guidance_conflict":true}'::jsonb, false);

  v_effective_facts :=
    COALESCE(p_facts, '{}'::jsonb)
    || jsonb_build_object(
      'guidance_conflict', v_conflict,
      'exact_product_selected', p_manufacturer_product_id IS NOT NULL,
      'manufacturer_verified_application_profile', v_has_verified_mfg
    );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'source_layer', sc.source_layer,
        'stop_key', sc.stop_key,
        'severity', sc.severity,
        'condition_expression', sc.condition_expression,
        'reason_el', sc.reason_el,
        'next_action_el', sc.next_action_el,
        'professional_assessment_required', sc.professional_assessment_required,
        'evidence', public.build_guidance_evidence('stop_condition', sc.id)
      )
      ORDER BY CASE sc.severity WHEN 'BLOCK' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END, sc.stop_key
    ),
    '[]'::jsonb
  ),
  COALESCE(bool_or(sc.severity = 'BLOCK'), false)
  INTO v_triggered_stops, v_blocked
  FROM public.build_stop_conditions sc
  WHERE sc.active
    AND (sc.scenario_id IS NULL OR sc.scenario_id = v_profile.id)
    AND v_effective_facts @> sc.condition_expression;

  SELECT jsonb_build_object(
    'source_layer', 'GENERAL_GUIDANCE',
    'evidence_status', v_profile.evidence_status,
    'profile', jsonb_build_object(
      'data', to_jsonb(v_profile),
      'evidence', public.build_guidance_evidence('profile', v_profile.id)
    ),
    'rules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_jsonb(r),
          'evidence', public.build_guidance_evidence('solution_rule', r.id)
        ) ORDER BY r.rule_category, r.rule_key
      )
      FROM public.build_solution_rules r
      WHERE r.scenario_id = v_profile.id AND r.active
    ), '[]'::jsonb),
    'diagnostics', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_jsonb(d),
          'evidence', public.build_guidance_evidence('diagnostic_rule', d.id)
        ) ORDER BY d.diagnostic_key
      )
      FROM public.build_diagnostic_rules d
      WHERE d.scenario_id = v_profile.id AND d.active
    ), '[]'::jsonb),
    'steps', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_jsonb(st),
          'evidence', public.build_guidance_evidence('solution_step', st.id)
        ) ORDER BY st.step_number
      )
      FROM public.build_solution_steps st
      WHERE st.scenario_id = v_profile.id AND st.active
    ), '[]'::jsonb),
    'failure_modes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_jsonb(f),
          'evidence', public.build_guidance_evidence('failure_mode', f.id)
        ) ORDER BY f.failure_key
      )
      FROM public.build_failure_modes f
      WHERE f.scenario_id = v_profile.id AND f.active
    ), '[]'::jsonb),
    'tool_requirements', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_jsonb(t),
          'evidence', public.build_guidance_evidence('tool_requirement', t.id)
        ) ORDER BY t.tool_category
      )
      FROM public.build_tool_requirements t
      WHERE t.scenario_id = v_profile.id AND t.active
    ), '[]'::jsonb),
    'project_kit_requirements', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_jsonb(k),
          'evidence', public.build_guidance_evidence('project_kit_requirement', k.id)
        ) ORDER BY
          CASE k.requirement_level WHEN 'required' THEN 0 WHEN 'conditional' THEN 1 ELSE 2 END,
          k.requirement_type
      )
      FROM public.build_project_kit_requirements k
      WHERE k.scenario_id = v_profile.id AND k.active
    ), '[]'::jsonb)
  )
  INTO v_general;

  IF p_manufacturer_product_id IS NULL THEN
    v_manufacturer := jsonb_build_object(
      'source_layer', 'MANUFACTURER_VITEX',
      'status', 'not_selected',
      'exact_product_values_available', false,
      'quantity_inputs_available', false
    );
  ELSIF NOT v_has_product THEN
    v_manufacturer := jsonb_build_object(
      'source_layer', 'MANUFACTURER_VITEX',
      'status', 'product_not_found_or_not_current',
      'selected_product_id', p_manufacturer_product_id,
      'exact_product_values_available', false,
      'quantity_inputs_available', false
    );
  ELSIF NOT v_has_verified_mfg THEN
    v_manufacturer := jsonb_build_object(
      'source_layer', CASE WHEN lower(v_product.manufacturer)='vitex' THEN 'MANUFACTURER_VITEX' ELSE 'MANUFACTURER' END,
      'status', 'missing_verified_application_profile',
      'product', to_jsonb(v_product),
      'exact_product_values_available', false,
      'quantity_inputs_available', false
    );
  ELSE
    v_manufacturer := jsonb_build_object(
      'source_layer', CASE WHEN lower(v_product.manufacturer)='vitex' THEN 'MANUFACTURER_VITEX' ELSE 'MANUFACTURER' END,
      'status', 'verified',
      'product', to_jsonb(v_product),
      'application_profile', to_jsonb(v_mfg_profile),
      'instruction_evidence', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'field_name', ie.field_name,
            'rule_key', ie.rule_key,
            'normalized_value', ie.normalized_value,
            'source_page', ie.source_page,
            'section_heading', ie.section_heading,
            'exact_excerpt', ie.exact_excerpt,
            'confidence', ie.confidence,
            'source', jsonb_build_object(
              'id', ts.id,
              'source_type', ts.source_type,
              'title', ts.source_title,
              'url', ts.source_url,
              'revision', ts.document_revision,
              'publication_date', ts.publication_date
            )
          )
          ORDER BY ie.field_name, ie.rule_key NULLS FIRST
        )
        FROM public.manufacturer_instruction_evidence ie
        JOIN public.manufacturer_technical_sources ts ON ts.id=ie.source_id
        WHERE ie.product_id=v_product.id AND ie.is_current AND ts.is_current
      ), '[]'::jsonb),
      'surface_compatibility', COALESCE((
        SELECT jsonb_agg(to_jsonb(msc) ORDER BY msc.surface_type)
        FROM public.manufacturer_surface_compatibility msc
        WHERE msc.product_id=v_product.id AND msc.is_current
      ), '[]'::jsonb),
      'package_sizes', COALESCE((
        SELECT jsonb_agg(to_jsonb(ps) ORDER BY ps.unit, ps.amount)
        FROM public.manufacturer_package_sizes ps
        WHERE ps.product_id=v_product.id AND ps.active
      ), '[]'::jsonb),
      'exact_product_values_available', true,
      'quantity_inputs_available',
        (
          (
            v_mfg_profile.coverage_m2_per_litre_min IS NOT NULL
            AND v_mfg_profile.number_of_coats_min IS NOT NULL
          )
          OR (
            v_mfg_profile.consumption_value_min IS NOT NULL
            AND v_mfg_profile.consumption_unit IS NOT NULL
          )
        )
    );
  END IF;

  RETURN jsonb_build_object(
    'status',
      CASE
        WHEN v_conflict THEN 'review_required'
        WHEN v_blocked THEN 'blocked'
        WHEN v_profile.evidence_status = 'partial' THEN 'guidance_partial'
        ELSE 'ready'
      END,
    'scenario_key', v_profile.scenario_key,
    'source_layers', jsonb_build_array('GENERAL_GUIDANCE','MANUFACTURER_VITEX','KONTA_MOU_RULE'),
    'guidance_conflict', v_conflict,
    'blocked', v_blocked,
    'effective_facts', v_effective_facts,
    'general_guidance', v_general,
    'manufacturer_guidance', v_manufacturer,
    'konta_mou_rules', jsonb_build_object(
      'source_layer', 'KONTA_MOU_RULE',
      'triggered_stop_conditions', v_triggered_stops
    ),
    'precedence', jsonb_build_object(
      'manufacturer_specific_over_general_when_more_specific_or_restrictive', true,
      'never_silently_reconcile_conflict', true,
      'exact_product_values_require_verified_manufacturer_profile', true
    )
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.build_guidance_evidence(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_build_project_guidance(text,jsonb,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_guidance_evidence(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_build_project_guidance(text,jsonb,uuid,boolean) TO service_role;

COMMIT;
