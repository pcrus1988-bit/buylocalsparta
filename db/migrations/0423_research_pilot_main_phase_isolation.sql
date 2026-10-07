-- KONTA MOY — isolate pilot fieldwork from the publishable main survey.
-- Schema 0423 gives sample draws and invitations an explicit fieldwork phase,
-- records pilot timing separately, and enforces phase consistency at the
-- database boundary so pilot exposure cannot silently enter the main analysis.

BEGIN;

ALTER TABLE public.research_studies
  ADD COLUMN pilot_started_at timestamptz,
  ADD COLUMN pilot_ended_at timestamptz;

ALTER TABLE public.research_sample_draws
  ADD COLUMN fieldwork_phase text NOT NULL DEFAULT 'main'
  CHECK (fieldwork_phase IN ('pilot','main'));

ALTER TABLE public.research_invite_batches
  ADD COLUMN fieldwork_phase text NOT NULL DEFAULT 'main'
  CHECK (fieldwork_phase IN ('pilot','main'));

ALTER TABLE public.research_invites
  ADD COLUMN fieldwork_phase text NOT NULL DEFAULT 'main'
  CHECK (fieldwork_phase IN ('pilot','main'));

ALTER TABLE public.research_sample_draws
  ADD CONSTRAINT research_sample_draws_id_phase_unique
  UNIQUE (id, fieldwork_phase);

ALTER TABLE public.research_invite_batches
  ADD CONSTRAINT research_invite_batches_id_phase_unique
  UNIQUE (id, fieldwork_phase);

ALTER TABLE public.research_invite_batches
  ADD CONSTRAINT research_invite_batches_draw_phase_fk
  FOREIGN KEY (sample_draw_id, fieldwork_phase)
  REFERENCES public.research_sample_draws(id, fieldwork_phase)
  ON DELETE RESTRICT;

ALTER TABLE public.research_invites
  ADD CONSTRAINT research_invites_batch_phase_fk
  FOREIGN KEY (batch_id, fieldwork_phase)
  REFERENCES public.research_invite_batches(id, fieldwork_phase)
  ON DELETE RESTRICT;

CREATE INDEX research_sample_draws_study_phase_status_idx
  ON public.research_sample_draws(study_id, fieldwork_phase, status, created_at DESC);

CREATE INDEX research_invites_study_phase_status_idx
  ON public.research_invites(study_id, fieldwork_phase, status, created_at DESC);

COMMIT;
