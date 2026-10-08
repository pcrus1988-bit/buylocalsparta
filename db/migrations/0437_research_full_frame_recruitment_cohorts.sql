-- Greek Retail Observatory 2026: two independently approved full-frame outreach cohorts.
-- NO migration, deployment or frame refresh sends email.
BEGIN;

CREATE TABLE public.research_recruitment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL REFERENCES public.research_waves(id) ON DELETE RESTRICT,
  frame_snapshot_id uuid NOT NULL REFERENCES public.research_frame_snapshots(id) ON DELETE RESTRICT,
  sample_draw_id uuid REFERENCES public.research_sample_draws(id) ON DELETE RESTRICT,
  invite_batch_id uuid REFERENCES public.research_invite_batches(id) ON DELETE RESTRICT,
  cohort_code text NOT NULL CHECK (cohort_code IN ('A','B')),
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing','review','running','paused','completed','cancelled','failed')),
  cursor_frame_unit_id uuid,
  prepared_count integer NOT NULL DEFAULT 0 CHECK (prepared_count >= 0),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  uncertain_count integer NOT NULL DEFAULT 0 CHECK (uncertain_count >= 0),
  approved_count integer CHECK (approved_count IS NULL OR approved_count >= 0),
  approved_at timestamptz,
  approval_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id,wave_id,cohort_code),
  UNIQUE (sample_draw_id),
  CHECK (approved_at IS NULL OR (approved_count = prepared_count AND jsonb_typeof(approval_evidence)='object'))
);

CREATE TABLE public.research_campaign_recipients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.research_recruitment_campaigns(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL REFERENCES public.research_waves(id) ON DELETE RESTRICT,
  frame_unit_id uuid NOT NULL REFERENCES public.research_frame_units(id) ON DELETE RESTRICT,
  contact_point_id uuid NOT NULL REFERENCES public.research_contact_points(id) ON DELETE RESTRICT,
  sample_unit_id uuid REFERENCES public.research_sample_units(id) ON DELETE RESTRICT,
  invite_id uuid REFERENCES public.research_invites(id) ON DELETE RESTRICT,
  external_key_hash text NOT NULL CHECK (external_key_hash ~ '^[a-f0-9]{64}$'),
  contact_value_hash text NOT NULL CHECK (contact_value_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','skipped','uncertain')),
  claimed_at timestamptz,
  sent_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wave_id,external_key_hash),
  UNIQUE (wave_id,contact_value_hash),
  UNIQUE (campaign_id,frame_unit_id),
  UNIQUE (sample_unit_id),
  UNIQUE (invite_id)
);

CREATE INDEX research_campaign_recipients_status_idx
  ON public.research_campaign_recipients(campaign_id,status,id);
CREATE INDEX research_campaigns_wave_status_idx
  ON public.research_recruitment_campaigns(wave_id,status,cohort_code);
CREATE INDEX research_campaign_recipient_contact_idx
  ON public.research_campaign_recipients(contact_point_id);
CREATE INDEX research_frame_units_snapshot_cursor_idx
  ON public.research_frame_units(frame_snapshot_id,id);
CREATE INDEX research_frame_unit_hash_any_frame_idx
  ON public.research_frame_units(external_key_hash,frame_snapshot_id);

ALTER TABLE public.research_recruitment_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_recruitment_campaigns_platform
  ON public.research_recruitment_campaigns FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY research_campaign_recipients_platform
  ON public.research_campaign_recipients FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
REVOKE ALL ON public.research_recruitment_campaigns FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.research_campaign_recipients FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.research_recruitment_campaigns TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON public.research_campaign_recipients TO bls_platform_runtime;
GRANT USAGE,SELECT ON SEQUENCE public.research_campaign_recipients_id_seq TO bls_platform_runtime;

COMMENT ON TABLE public.research_recruitment_campaigns IS
  'A then B: full contactable-frame invitation attempts for the SAME survey wave; no automatic sending.';
COMMENT ON TABLE public.research_campaign_recipients IS
  'Immutable cohort membership, one business and email per study wave; suppressions rechecked before dispatch.';

COMMIT;
