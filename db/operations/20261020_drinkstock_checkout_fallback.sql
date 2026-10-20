-- DrinkStock: admin-granted KONTA MOY checkout fallback entitlement.
-- This is NOT a payment gateway activation. No client-side Data API grants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_checkout_fallback (
 partner_id uuid PRIMARY KEY REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 pos_unavailable boolean NOT NULL DEFAULT false,
 merchant_authorization_reviewed boolean NOT NULL DEFAULT false,
 settlement_reviewed boolean NOT NULL DEFAULT false,
 fiscal_reviewed boolean NOT NULL DEFAULT false,
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=600),
 updated_by text NOT NULL CHECK(length(btrim(updated_by)) BETWEEN 1 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT drinkstock_checkout_fallback_eligibility CHECK (
   NOT enabled OR (
     pos_unavailable AND merchant_authorization_reviewed AND
     settlement_reviewed AND fiscal_reviewed AND
     length(btrim(reason)) BETWEEN 15 AND 600
   )
 )
);
CREATE TABLE IF NOT EXISTS public.drinkstock_checkout_fallback_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 actor_user_id text NOT NULL CHECK(length(btrim(actor_user_id)) BETWEEN 1 AND 200),
 before_enabled boolean NOT NULL,
 after_enabled boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason)<=600),
 reviewed jsonb NOT NULL CHECK(jsonb_typeof(reviewed)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(partner_id,request_key)
);
CREATE INDEX IF NOT EXISTS drinkstock_checkout_fallback_events_history
 ON public.drinkstock_checkout_fallback_events(partner_id,created_at DESC);
ALTER TABLE public.drinkstock_checkout_fallback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_checkout_fallback_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_checkout_fallback,
 public.drinkstock_checkout_fallback_events FROM anon,authenticated;
COMMIT;
