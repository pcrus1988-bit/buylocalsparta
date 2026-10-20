-- Recorded standard-jurisdiction attestation, not a payment activation switch.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_venue_tax_context (
 venue_id uuid PRIMARY KEY,
 partner_id uuid NOT NULL,
 standard_rate_confirmed boolean NOT NULL DEFAULT false,
 service_mode text NOT NULL DEFAULT 'dine_in' CHECK(service_mode='dine_in'),
 jurisdiction text NOT NULL DEFAULT 'standard' CHECK(jurisdiction='standard'),
 review_reason text NOT NULL DEFAULT '',
 reviewed_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE,
 CHECK(NOT standard_rate_confirmed OR length(btrim(review_reason)) BETWEEN 20 AND 600)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_venue_tax_context_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL,
 partner_id uuid NOT NULL,
 request_key uuid NOT NULL,
 actor_user_id text NOT NULL,
 before_confirmed boolean NOT NULL,
 after_confirmed boolean NOT NULL,
 review_reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE
);
ALTER TABLE public.drinkstock_venue_tax_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_venue_tax_context_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_venue_tax_context,public.drinkstock_venue_tax_context_events FROM anon,authenticated;
COMMIT;
