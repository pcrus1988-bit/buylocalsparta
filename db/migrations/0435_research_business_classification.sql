-- KONTA MOY — respondent business activity and canonical Research classification.
-- Schema 0435 keeps registry KAD evidence, respondent-declared activity and
-- Research-admin canonical categories separate so source evidence is never rewritten.

BEGIN;

CREATE TABLE public.research_business_categories (
  code text PRIMARY KEY,
  parent_code text REFERENCES public.research_business_categories(code) ON DELETE RESTRICT,
  label_el text NOT NULL,
  description_el text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.research_business_categories
  (code,parent_code,label_el,description_el,sort_order)
VALUES
  ('retail',NULL,'Λιανικό εμπόριο','Κύρια οικογένεια κανονικοποιημένων κατηγοριών λιανικής.',10),
  ('fashion_footwear','retail','Μόδα, υπόδηση & αξεσουάρ',NULL,20),
  ('beauty_personal_care','retail','Ομορφιά & προσωπική φροντίδα',NULL,30),
  ('home_living','retail','Σπίτι, έπιπλα & διακόσμηση',NULL,40),
  ('diy_building','retail','Χρώματα, εργαλεία & δομικά',NULL,50),
  ('electronics','retail','Ηλεκτρονικά & τεχνολογία',NULL,60),
  ('books_stationery','retail','Βιβλία & χαρτικά',NULL,70),
  ('sports_hobby','retail','Αθλητισμός, παιχνίδι & hobby',NULL,80),
  ('jewellery_watches','retail','Κοσμήματα & ρολόγια',NULL,90),
  ('flowers_pets','retail','Άνθη & κατοικίδια',NULL,100),
  ('automotive_trade','retail','Αυτοκίνηση & συναφή είδη',NULL,110),
  ('second_hand','retail','Μεταχειρισμένα είδη',NULL,120),
  ('other_retail','retail','Λοιπό λιανικό εμπόριο',NULL,130),
  ('services',NULL,'Υπηρεσίες','Υπηρεσίες που δηλώνονται ως κύρια πραγματική δραστηριότητα.',200),
  ('hospitality_food_service','services','Εστίαση & φιλοξενία',NULL,210),
  ('personal_services','services','Προσωπικές υπηρεσίες',NULL,220),
  ('professional_services','services','Επαγγελματικές υπηρεσίες',NULL,230),
  ('other_services','services','Λοιπές υπηρεσίες',NULL,240),
  ('wholesale',NULL,'Χονδρικό εμπόριο','Χονδρική δραστηριότητα όταν αυτή δηλώνεται ως κύρια.',300),
  ('manufacturing',NULL,'Παραγωγή / μεταποίηση',NULL,400),
  ('other_business',NULL,'Λοιπή επιχειρηματική δραστηριότητα',NULL,900)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.research_business_activity_observations (
  response_id uuid PRIMARY KEY REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  frame_unit_id uuid NOT NULL REFERENCES public.research_frame_units(id) ON DELETE RESTRICT,
  source_activity_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_activity_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_primary_activity_code text,
  declared_main_activity text NOT NULL
    CHECK (char_length(btrim(declared_main_activity)) BETWEEN 2 AND 200),
  declared_main_activity_normalized text NOT NULL
    CHECK (char_length(declared_main_activity_normalized) BETWEEN 2 AND 220),
  declared_main_activity_is_primary_revenue boolean NOT NULL,
  declared_primary_revenue_activity text,
  declared_primary_revenue_activity_normalized text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    declared_main_activity_is_primary_revenue
    OR (
      declared_primary_revenue_activity IS NOT NULL
      AND char_length(btrim(declared_primary_revenue_activity)) BETWEEN 2 AND 200
      AND declared_primary_revenue_activity_normalized IS NOT NULL
      AND char_length(declared_primary_revenue_activity_normalized) BETWEEN 2 AND 220
    )
  )
);

CREATE TABLE public.research_business_activity_aliases (
  normalized_activity text PRIMARY KEY
    CHECK (char_length(normalized_activity) BETWEEN 2 AND 220),
  example_activity text NOT NULL,
  category_code text NOT NULL REFERENCES public.research_business_categories(code) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','retired')),
  confirmed_by text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_business_canonical_assignments (
  external_key_hash text PRIMARY KEY CHECK (external_key_hash ~ '^[a-f0-9]{64}$'),
  category_code text NOT NULL REFERENCES public.research_business_categories(code) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('suggested','confirmed')),
  assignment_source text NOT NULL CHECK (assignment_source IN ('respondent_alias','admin')),
  basis_activity text NOT NULL,
  basis_activity_normalized text NOT NULL,
  suggestion_confidence numeric(5,4)
    CHECK (suggestion_confidence IS NULL OR suggestion_confidence BETWEEN 0 AND 1),
  reviewed_by text,
  review_note text,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status='confirmed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR status='suggested'
  )
);

CREATE TABLE public.research_business_classification_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  external_key_hash text NOT NULL CHECK (external_key_hash ~ '^[a-f0-9]{64}$'),
  frame_unit_id uuid REFERENCES public.research_frame_units(id) ON DELETE SET NULL,
  response_id uuid REFERENCES public.research_responses(id) ON DELETE SET NULL,
  previous_category_code text,
  category_code text NOT NULL REFERENCES public.research_business_categories(code) ON DELETE RESTRICT,
  previous_status text,
  status text NOT NULL CHECK (status IN ('suggested','confirmed')),
  source text NOT NULL CHECK (source IN ('respondent_alias','admin')),
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  actor_user_id text,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_business_observations_frame_unit_idx
  ON public.research_business_activity_observations(frame_unit_id);
CREATE INDEX research_business_assignments_category_idx
  ON public.research_business_canonical_assignments(category_code,status);
CREATE INDEX research_business_events_key_time_idx
  ON public.research_business_classification_events(external_key_hash,occurred_at DESC,id DESC);

ALTER TABLE public.research_business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_business_activity_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_business_activity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_business_canonical_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_business_classification_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON
      public.research_business_categories,
      public.research_business_activity_observations,
      public.research_business_activity_aliases,
      public.research_business_canonical_assignments,
      public.research_business_classification_events
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON
      public.research_business_categories,
      public.research_business_activity_observations,
      public.research_business_activity_aliases,
      public.research_business_canonical_assignments,
      public.research_business_classification_events
    FROM authenticated;
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'research_business_categories',
    'research_business_activity_observations',
    'research_business_activity_aliases',
    'research_business_canonical_assignments',
    'research_business_classification_events'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO bls_platform_runtime',
      table_name
    );
    policy_name := table_name || '_platform_runtime';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO bls_platform_runtime USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()))',
      policy_name,
      table_name
    );
  END LOOP;

  GRANT USAGE, SELECT
    ON SEQUENCE public.research_business_classification_events_id_seq
    TO bls_platform_runtime;
END
$$;

CREATE OR REPLACE FUNCTION public.research_guard_business_activity_observation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE response_status text;
BEGIN
  SELECT status INTO response_status
  FROM public.research_responses
  WHERE id=COALESCE(NEW.response_id,OLD.response_id);

  IF response_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'research business activity observation is not mutable in response status %', response_status;
  END IF;
  IF TG_OP='UPDATE' AND NEW.frame_unit_id IS DISTINCT FROM OLD.frame_unit_id THEN
    RAISE EXCEPTION 'research business activity observation cannot move between frame units';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;

CREATE TRIGGER research_business_activity_observations_in_progress_only
BEFORE INSERT OR UPDATE OR DELETE ON public.research_business_activity_observations
FOR EACH ROW EXECUTE FUNCTION public.research_guard_business_activity_observation();

CREATE TRIGGER research_business_classification_events_append_only
BEFORE UPDATE OR DELETE ON public.research_business_classification_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

COMMENT ON TABLE public.research_business_activity_observations IS
  'Respondent-declared current business activity plus a copied snapshot of source KAD evidence. This does not rewrite the source frame or locked questionnaire.';
COMMENT ON TABLE public.research_business_canonical_assignments IS
  'Current Research canonical category for a stable hashed business identity. Confirmed admin assignments outrank automatic alias suggestions.';
COMMENT ON TABLE public.research_business_activity_aliases IS
  'Admin-confirmed normalized activity phrases used to suggest canonical categories for identical or highly similar future respondent descriptions.';
COMMENT ON COLUMN public.research_business_activity_observations.source_primary_activity_code IS
  'Populated only when the source explicitly marks an activity as primary; never inferred from ordering.';

COMMIT;
