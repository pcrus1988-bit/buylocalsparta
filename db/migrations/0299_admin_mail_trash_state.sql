-- KONTA MOY — Admin mailbox trash state and bulk workflow support.

BEGIN;

ALTER TABLE public.admin_mail_state
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS admin_mail_state_user_deleted_idx
  ON public.admin_mail_state(user_public_id,deleted_at,archived_at,is_read,is_starred);

COMMENT ON COLUMN public.admin_mail_state.deleted_at IS
  'Per-admin soft-delete timestamp. Raw inbound RFC822 remains authoritative in the configured S3 bucket.';

COMMIT;
