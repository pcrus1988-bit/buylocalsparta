-- DrinkStock: partner configurable pricing guardrails, editable only while rehearsal is paused.
BEGIN;
ALTER TABLE public.drinkstock_venue_settings
 ADD COLUMN IF NOT EXISTS floor_percent integer NOT NULL DEFAULT 70,
 ADD COLUMN IF NOT EXISTS ceiling_percent integer NOT NULL DEFAULT 145;
ALTER TABLE public.drinkstock_venue_settings
 ADD CONSTRAINT drinkstock_floor_percent_check CHECK (floor_percent BETWEEN 50 AND 100),
 ADD CONSTRAINT drinkstock_ceiling_percent_check CHECK (ceiling_percent BETWEEN 100 AND 200);
ALTER TABLE public.drinkstock_products DROP CONSTRAINT IF EXISTS drinkstock_products_price_cents_check;
ALTER TABLE public.drinkstock_products DROP CONSTRAINT IF EXISTS drinkstock_products_min_cents_check;
ALTER TABLE public.drinkstock_products DROP CONSTRAINT IF EXISTS drinkstock_products_max_cents_check;
ALTER TABLE public.drinkstock_products
 ADD CONSTRAINT drinkstock_products_price_cents_check CHECK (price_cents BETWEEN 50 AND 400000),
 ADD CONSTRAINT drinkstock_products_min_cents_check CHECK (min_cents >= 50),
 ADD CONSTRAINT drinkstock_products_max_cents_check CHECK (max_cents <= 400000);
ALTER TABLE public.drinkstock_market_events DROP CONSTRAINT IF EXISTS drinkstock_market_events_event_type_check;
ALTER TABLE public.drinkstock_market_events ADD CONSTRAINT drinkstock_market_events_event_type_check CHECK
 (event_type IN ('product_added','rehearsal_started','rehearsal_paused','demand','reset','bounds_updated'));
COMMENT ON COLUMN public.drinkstock_venue_settings.floor_percent IS 'Owner/manager pre-session rehearsal price floor, percent of each product base price (50..100).';
COMMENT ON COLUMN public.drinkstock_venue_settings.ceiling_percent IS 'Owner/manager pre-session rehearsal price ceiling, percent of each product base price (100..200).';
COMMIT;