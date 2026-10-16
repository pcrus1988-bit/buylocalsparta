-- Applied to production with Supabase migration "posokanei_account_saved_lists_20261016".
-- Private, customer-account-scoped saved shopping list. Anonymous users may only build temporary lists.
CREATE TABLE IF NOT EXISTS public.posokanei_saved_shopping_lists (
  user_id text PRIMARY KEY,
  list_data jsonb NOT NULL CHECK (jsonb_typeof(list_data) = 'object' AND octet_length(list_data::text) <= 32768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.posokanei_saved_shopping_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.posokanei_saved_shopping_lists FROM PUBLIC;
REVOKE ALL ON public.posokanei_saved_shopping_lists FROM anon, authenticated;
COMMENT ON TABLE public.posokanei_saved_shopping_lists IS 'Private, account-owned KONTA MOY x PosoKanei shopping-list drafts. Access only via authenticated server endpoint with CSRF validation.';
