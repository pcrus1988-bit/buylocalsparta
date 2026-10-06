-- KONTA MOY — permanent Retail Observatory hierarchy.
-- Schema 0427 introduces Programme -> Study -> Wave as the institutional
-- research hierarchy while preserving compatibility with the existing 2026
-- study runtime. Study-scoped evidence is explicitly bound to one wave.

BEGIN;

CREATE TABLE public.research_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_studies
  ADD COLUMN programme_id uuid REFERENCES public.research_programmes(id) ON DELETE RESTRICT,
  ADD COLUMN study_code text;

INSERT INTO public.research_programmes (
  id,slug,title,description,status
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000100',
  'greek-retail-observatory',
  'Παρατηρητήριο Ελληνικού Λιανεμπορίου',
  'Μόνιμο ερευνητικό programme για επαναλαμβανόμενες, συγκρίσιμες και αναπαραγώγιμες μελέτες του ελληνικού λιανεμπορίου.',
  'active'
)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.research_studies
SET
  programme_id = COALESCE(
    programme_id,
    (SELECT id FROM public.research_programmes WHERE slug='greek-retail-observatory')
  ),
  study_code = COALESCE(
    NULLIF(study_code,''),
    NULLIF(regexp_replace(slug, '-[0-9]{4}$', ''), ''),
    slug
  );

ALTER TABLE public.research_studies
  ALTER COLUMN programme_id SET NOT NULL,
  ALTER COLUMN study_code SET NOT NULL;

ALTER TABLE public.research_studies
  ADD CONSTRAINT research_studies_programme_study_code_unique
  UNIQUE (programme_id,study_code);

CREATE TABLE public.research_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  code text NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pilot','fielding','closed','analysis','published','archived')),
  is_current boolean NOT NULL DEFAULT false,
  fieldwork_starts_at timestamptz,
  fieldwork_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id,ordinal),
  UNIQUE (study_id,code),
  UNIQUE (id,study_id)
);

CREATE UNIQUE INDEX research_waves_one_current_per_study_idx
  ON public.research_waves(study_id)
  WHERE is_current;

INSERT INTO public.research_waves (
  id,study_id,ordinal,code,slug,title,status,is_current,
  fieldwork_starts_at,fieldwork_ends_at
)
SELECT
  CASE
    WHEN rs.id='1b1bc971-705a-4b97-92c5-202600000001'::uuid
      THEN '1b1bc971-705a-4b97-92c5-202600000101'::uuid
    ELSE gen_random_uuid()
  END,
  rs.id,
  1,
  COALESCE((regexp_match(rs.slug, '([0-9]{4})$'))[1], 'initial'),
  rs.slug,
  rs.title,
  rs.status,
  true,
  rs.fieldwork_starts_at,
  rs.fieldwork_ends_at
FROM public.research_studies rs
ON CONFLICT (study_id,code) DO NOTHING;

ALTER TABLE public.research_studies
  ADD COLUMN current_wave_id uuid;

UPDATE public.research_studies rs
SET current_wave_id = rw.id
FROM public.research_waves rw
WHERE rw.study_id=rs.id
  AND rw.is_current;

ALTER TABLE public.research_studies
  ALTER COLUMN current_wave_id SET NOT NULL,
  ADD CONSTRAINT research_studies_current_wave_study_fk
    FOREIGN KEY (current_wave_id,id)
    REFERENCES public.research_waves(id,study_id)
    ON DELETE RESTRICT;

ALTER TABLE public.research_instruments ADD COLUMN wave_id uuid;
ALTER TABLE public.research_frame_snapshots ADD COLUMN wave_id uuid;
ALTER TABLE public.research_sample_draws ADD COLUMN wave_id uuid;
ALTER TABLE public.research_recruitment_templates ADD COLUMN wave_id uuid;
ALTER TABLE public.research_invite_batches ADD COLUMN wave_id uuid;
ALTER TABLE public.research_invites ADD COLUMN wave_id uuid;
ALTER TABLE public.research_responses ADD COLUMN wave_id uuid;
ALTER TABLE public.research_analysis_runs ADD COLUMN wave_id uuid;
ALTER TABLE public.research_release_snapshots ADD COLUMN wave_id uuid;
ALTER TABLE public.research_study_jobs ADD COLUMN wave_id uuid;
ALTER TABLE public.research_contact_suppression_events ADD COLUMN wave_id uuid;
ALTER TABLE public.research_participant_deliveries ADD COLUMN wave_id uuid;
ALTER TABLE public.research_analysis_plans ADD COLUMN wave_id uuid;
ALTER TABLE public.research_sample_designs ADD COLUMN wave_id uuid;
ALTER TABLE public.research_protocol_events ADD COLUMN wave_id uuid;

-- Structural backfill must be able to annotate already-frozen evidence without
-- weakening the runtime immutability contract after this migration commits.
ALTER TABLE public.research_recruitment_templates DISABLE TRIGGER USER;
ALTER TABLE public.research_frame_snapshots DISABLE TRIGGER USER;
ALTER TABLE public.research_sample_draws DISABLE TRIGGER USER;
ALTER TABLE public.research_analysis_runs DISABLE TRIGGER USER;
ALTER TABLE public.research_release_snapshots DISABLE TRIGGER USER;
ALTER TABLE public.research_analysis_plans DISABLE TRIGGER USER;
ALTER TABLE public.research_sample_designs DISABLE TRIGGER USER;
ALTER TABLE public.research_protocol_events DISABLE TRIGGER USER;

UPDATE public.research_instruments t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_frame_snapshots t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_sample_draws t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_recruitment_templates t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_invite_batches t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_invites t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_responses t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_analysis_runs t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_release_snapshots t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_study_jobs t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_contact_suppression_events t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_participant_deliveries t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_analysis_plans t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_sample_designs t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

UPDATE public.research_protocol_events t
SET wave_id=rs.current_wave_id
FROM public.research_studies rs
WHERE t.study_id=rs.id AND t.wave_id IS NULL;

ALTER TABLE public.research_recruitment_templates ENABLE TRIGGER USER;
ALTER TABLE public.research_frame_snapshots ENABLE TRIGGER USER;
ALTER TABLE public.research_sample_draws ENABLE TRIGGER USER;
ALTER TABLE public.research_analysis_runs ENABLE TRIGGER USER;
ALTER TABLE public.research_release_snapshots ENABLE TRIGGER USER;
ALTER TABLE public.research_analysis_plans ENABLE TRIGGER USER;
ALTER TABLE public.research_sample_designs ENABLE TRIGGER USER;
ALTER TABLE public.research_protocol_events ENABLE TRIGGER USER;

ALTER TABLE public.research_instruments
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_instruments_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_frame_snapshots
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_frame_snapshots_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_sample_draws
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_sample_draws_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_recruitment_templates
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_recruitment_templates_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_invite_batches
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_invite_batches_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_invites
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_invites_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_responses
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_responses_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_analysis_runs
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_analysis_runs_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_release_snapshots
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_release_snapshots_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_study_jobs
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_study_jobs_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_participant_deliveries
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_participant_deliveries_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_analysis_plans
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_analysis_plans_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_sample_designs
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_sample_designs_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_protocol_events
  ALTER COLUMN wave_id SET NOT NULL,
  ADD CONSTRAINT research_protocol_events_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT;

ALTER TABLE public.research_contact_suppression_events
  ADD CONSTRAINT research_contact_suppression_wave_study_pair
    CHECK (
      (study_id IS NULL AND wave_id IS NULL)
      OR
      (study_id IS NOT NULL AND wave_id IS NOT NULL)
    ),
  ADD CONSTRAINT research_contact_suppression_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE SET NULL;

-- Version labels restart cleanly inside each wave. This is required for annual
-- waves to use conventional labels such as instrument 1.0.0 and release v1
-- without colliding with an earlier wave under the same stable study.
ALTER TABLE public.research_instruments
  DROP CONSTRAINT research_instruments_study_id_version_key,
  ADD CONSTRAINT research_instruments_wave_version_unique UNIQUE (wave_id,version);

ALTER TABLE public.research_recruitment_templates
  DROP CONSTRAINT research_recruitment_templates_study_id_version_channel_key,
  ADD CONSTRAINT research_recruitment_templates_wave_version_channel_unique
    UNIQUE (wave_id,version,channel);

ALTER TABLE public.research_release_snapshots
  DROP CONSTRAINT research_release_snapshots_study_id_release_version_key,
  ADD CONSTRAINT research_release_snapshots_wave_release_version_unique
    UNIQUE (wave_id,release_version);

ALTER TABLE public.research_analysis_plans
  DROP CONSTRAINT research_analysis_plans_study_id_version_key,
  ADD CONSTRAINT research_analysis_plans_wave_version_unique UNIQUE (wave_id,version);

CREATE INDEX research_instruments_wave_idx ON public.research_instruments(wave_id,created_at);
CREATE INDEX research_frame_snapshots_wave_idx ON public.research_frame_snapshots(wave_id,created_at);
CREATE INDEX research_sample_draws_wave_idx ON public.research_sample_draws(wave_id,created_at);
CREATE INDEX research_invites_wave_status_idx ON public.research_invites(wave_id,status,created_at);
CREATE INDEX research_responses_wave_status_idx ON public.research_responses(wave_id,status,started_at);
CREATE INDEX research_analysis_runs_wave_idx ON public.research_analysis_runs(wave_id,created_at);
CREATE INDEX research_release_snapshots_wave_idx ON public.research_release_snapshots(wave_id,created_at);
CREATE INDEX research_study_jobs_wave_claim_idx ON public.research_study_jobs(wave_id,status,available_at,created_at);
CREATE INDEX research_protocol_events_wave_idx ON public.research_protocol_events(wave_id,recorded_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.research_guard_wave_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  resolved_wave_id uuid;
  wave_study_id uuid;
BEGIN
  IF NEW.study_id IS NULL THEN
    IF NEW.wave_id IS NOT NULL THEN
      RAISE EXCEPTION 'research wave cannot be set without a study';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' THEN
    IF NEW.study_id IS DISTINCT FROM OLD.study_id THEN
      RAISE EXCEPTION 'research evidence cannot move between studies';
    END IF;
    IF NEW.wave_id IS DISTINCT FROM OLD.wave_id THEN
      RAISE EXCEPTION 'research evidence cannot move between waves';
    END IF;
  END IF;

  resolved_wave_id := NEW.wave_id;
  IF resolved_wave_id IS NULL THEN
    SELECT rs.current_wave_id
    INTO resolved_wave_id
    FROM public.research_studies rs
    WHERE rs.id=NEW.study_id
    FOR SHARE;

    IF resolved_wave_id IS NULL THEN
      RAISE EXCEPTION 'research study has no current wave';
    END IF;
    NEW.wave_id := resolved_wave_id;
  END IF;

  SELECT rw.study_id
  INTO wave_study_id
  FROM public.research_waves rw
  WHERE rw.id=NEW.wave_id
  FOR SHARE;

  IF wave_study_id IS NULL THEN
    RAISE EXCEPTION 'research wave does not exist';
  END IF;
  IF wave_study_id IS DISTINCT FROM NEW.study_id THEN
    RAISE EXCEPTION 'research wave belongs to another study';
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_instruments_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_instruments
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_frame_snapshots_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_frame_snapshots
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_sample_draws_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_sample_draws
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_recruitment_templates_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_recruitment_templates
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_invite_batches_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_invite_batches
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_invites_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_invites
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_responses_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_responses
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_analysis_runs_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_analysis_runs
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_release_snapshots_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_release_snapshots
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_study_jobs_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_study_jobs
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_contact_suppression_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_contact_suppression_events
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_participant_deliveries_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_participant_deliveries
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_analysis_plans_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_analysis_plans
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_sample_designs_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_sample_designs
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE TRIGGER research_protocol_events_00_wave_scope
BEFORE INSERT OR UPDATE ON public.research_protocol_events
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_scope();

CREATE OR REPLACE FUNCTION public.research_guard_study_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF NEW.programme_id IS DISTINCT FROM OLD.programme_id
     OR NEW.study_code IS DISTINCT FROM OLD.study_code THEN
    RAISE EXCEPTION 'research programme/study identity is immutable';
  END IF;
  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_studies_identity_immutable
BEFORE UPDATE ON public.research_studies
FOR EACH ROW EXECUTE FUNCTION public.research_guard_study_identity();

CREATE OR REPLACE FUNCTION public.research_sync_current_wave_from_study()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF NEW.current_wave_id IS DISTINCT FROM OLD.current_wave_id THEN
    UPDATE public.research_waves
    SET is_current=false,updated_at=now()
    WHERE study_id=NEW.id
      AND id<>NEW.current_wave_id
      AND is_current;

    UPDATE public.research_waves
    SET is_current=true,updated_at=now()
    WHERE id=NEW.current_wave_id
      AND study_id=NEW.id;
  END IF;

  UPDATE public.research_waves
  SET
    status=NEW.status,
    fieldwork_starts_at=NEW.fieldwork_starts_at,
    fieldwork_ends_at=NEW.fieldwork_ends_at,
    updated_at=now()
  WHERE id=NEW.current_wave_id
    AND study_id=NEW.id;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_studies_sync_current_wave
AFTER UPDATE OF current_wave_id,status,fieldwork_starts_at,fieldwork_ends_at
ON public.research_studies
FOR EACH ROW EXECUTE FUNCTION public.research_sync_current_wave_from_study();

ALTER TABLE public.research_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_waves ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_programmes,public.research_waves FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_wave_scope() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_study_identity() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_sync_current_wave_from_study() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_programmes,public.research_waves FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_wave_scope() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_study_identity() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_sync_current_wave_from_study() FROM authenticated;
  END IF;
END;
$research$;

REVOKE EXECUTE ON FUNCTION public.research_guard_wave_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_study_identity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_sync_current_wave_from_study() FROM PUBLIC;

GRANT SELECT,INSERT,UPDATE ON TABLE public.research_programmes TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON TABLE public.research_waves TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_wave_scope() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_study_identity() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_sync_current_wave_from_study() TO bls_platform_runtime;

CREATE POLICY research_programmes_platform_runtime
ON public.research_programmes
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_waves_platform_runtime
ON public.research_waves
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;
