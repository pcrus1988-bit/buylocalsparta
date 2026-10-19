-- DrinkStock TV display source is selected per screen; never inferred from a browser.
BEGIN;
ALTER TABLE public.drinkstock_access_passes
  ADD COLUMN IF NOT EXISTS feed_mode text NOT NULL DEFAULT 'simulation';
ALTER TABLE public.drinkstock_access_passes
  DROP CONSTRAINT IF EXISTS drinkstock_access_passes_feed_mode_check;
ALTER TABLE public.drinkstock_access_passes
  ADD CONSTRAINT drinkstock_access_passes_feed_mode_check
  CHECK (feed_mode IN ('simulation','actual'));
ALTER TABLE public.drinkstock_session_actions
  DROP CONSTRAINT IF EXISTS drinkstock_session_actions_action_check;
ALTER TABLE public.drinkstock_session_actions
  ADD CONSTRAINT drinkstock_session_actions_action_check
  CHECK (action IN ('start','pause','resume','crash','end','create_screen','create_table','revoke_pass','set_screen_feed'));
CREATE INDEX IF NOT EXISTS drinkstock_paid_screen_feed_idx
  ON public.drinkstock_orders(partner_id,venue_id,session_id,created_at DESC)
  WHERE payment_state='paid' AND order_state IN ('paid','accepted','preparing','ready','served');
ALTER TABLE public.drinkstock_access_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_session_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_access_passes,public.drinkstock_session_actions FROM anon,authenticated;
COMMIT;
