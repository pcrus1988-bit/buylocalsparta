-- Press Office is editorially separate from Research survey recruitment.
-- Public Data API roles receive no access to press contacts or attachments.
BEGIN;

CREATE TABLE IF NOT EXISTS public.research_press_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 240),
  body_html text NOT NULL CHECK (length(body_html) BETWEEN 1 AND 120000),
  subject_en text CHECK (subject_en IS NULL OR length(subject_en) BETWEEN 1 AND 240),
  body_html_en text CHECK (body_html_en IS NULL OR length(body_html_en) BETWEEN 1 AND 120000),
  from_address text NOT NULL DEFAULT 'research@kontamou.site',
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  recipient_languages jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(recipient_languages)='object'),
  attachment_name text,
  attachment_type text,
  attachment_bytes bytea,
  attachment_name_en text,
  attachment_type_en text,
  attachment_bytes_en bytea,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','prepared','sending','completed')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  prepared_at timestamptz,
  completed_at timestamptz,
  CHECK ((attachment_bytes IS NULL AND attachment_name IS NULL AND attachment_type IS NULL)
      OR (attachment_bytes IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL)),
  CHECK ((attachment_bytes_en IS NULL AND attachment_name_en IS NULL AND attachment_type_en IS NULL)
      OR (attachment_bytes_en IS NOT NULL AND attachment_name_en IS NOT NULL AND attachment_type_en IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.research_press_deliveries (
  release_id uuid NOT NULL REFERENCES public.research_press_releases(id) ON DELETE RESTRICT,
  recipient text NOT NULL,
  language text NOT NULL CHECK (language IN ('el','en')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','suppressed')),
  admin_mail_id text,
  ses_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY (release_id, recipient)
);
CREATE INDEX IF NOT EXISTS research_press_deliveries_status_idx
  ON public.research_press_deliveries(release_id, status);

CREATE TABLE IF NOT EXISTS public.research_press_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 120),
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  recipient_languages jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(recipient_languages)='object'),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.research_press_suppressions (
  recipient text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'opt_out',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_press_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_press_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_press_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_press_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_press_releases_runtime ON public.research_press_releases
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY research_press_deliveries_runtime ON public.research_press_deliveries
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY research_press_lists_runtime ON public.research_press_lists
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
CREATE POLICY research_press_suppressions_runtime ON public.research_press_suppressions
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE
  public.research_press_releases,public.research_press_deliveries,
  public.research_press_lists,public.research_press_suppressions
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  public.research_press_releases,public.research_press_deliveries,
  public.research_press_lists,public.research_press_suppressions
  TO bls_app_runtime,bls_platform_runtime;

COMMENT ON TABLE public.research_press_releases IS 'Internal branded press releases and small PDF/image attachment bytes; never public, independent of survey invitations.';
COMMENT ON TABLE public.research_press_deliveries IS 'One send per individual recipient; sending state remains held after an ambiguous SES outcome to prevent accidental repeats.';
COMMIT;
