-- KONTA MOY — calendar-month virtual try-on generation quota.
-- A generation is counted immediately before KONTA MOY starts the paid FASHN provider request.
-- Invalid/local preflight failures do not consume quota. The quota resets at 00:00 UTC on day 1.

BEGIN;

CREATE TABLE public.customer_try_on_monthly_usage (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  generation_count smallint NOT NULL DEFAULT 0 CHECK (generation_count BETWEEN 0 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month_start),
  CHECK (month_start = date_trunc('month', month_start::timestamp)::date)
);

COMMENT ON TABLE public.customer_try_on_monthly_usage IS
  'Server-managed monthly FASHN generation counter for the KONTA MOY Try On Me cost guard. Maximum 50 provider starts per customer per UTC calendar month.';
COMMENT ON COLUMN public.customer_try_on_monthly_usage.generation_count IS
  'Count of provider-start reservations in this UTC calendar month. Saved/bookmarked previews do not add usage.';

ALTER TABLE public.customer_try_on_monthly_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_try_on_monthly_usage_customer_own ON public.customer_try_on_monthly_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id=customer_try_on_monthly_usage.user_id
        AND (
          u.public_id=current_setting('app.actor_user_id', true)
          OR u.id::text=current_setting('app.actor_user_id', true)
        )
    )
  );

CREATE POLICY customer_try_on_monthly_usage_platform ON public.customer_try_on_monthly_usage
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.customer_try_on_monthly_usage FROM anon, authenticated;

COMMIT;
