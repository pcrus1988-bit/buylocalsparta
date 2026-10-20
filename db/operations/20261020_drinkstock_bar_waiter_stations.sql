-- DrinkStock station access is venue-scoped and deliberately private.
-- These roles authorize handling only provider-evidenced DrinkStock orders.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_venue_staff_stations (
 venue_id uuid NOT NULL,
 partner_id uuid NOT NULL,
 user_id text NOT NULL,
 station text NOT NULL CHECK(station IN ('bar','waiter')),
 assigned_by text NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(venue_id,user_id,station),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE,
 FOREIGN KEY (partner_id,user_id) REFERENCES public.hospitality_partner_memberships(partner_id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drinkstock_staff_stations_user_scope_idx
 ON public.drinkstock_venue_staff_stations(partner_id,user_id,venue_id);
CREATE TABLE IF NOT EXISTS public.drinkstock_staff_station_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 target_user_id text NOT NULL,
 actor_user_id text NOT NULL,
 station text NOT NULL CHECK(station IN ('bar','waiter')),
 enabled boolean NOT NULL,
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drinkstock_staff_station_event_history_idx
 ON public.drinkstock_staff_station_events(partner_id,venue_id,created_at DESC);
ALTER TABLE public.drinkstock_venue_staff_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_staff_station_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_venue_staff_stations,public.drinkstock_staff_station_events FROM anon,authenticated;
COMMIT;
