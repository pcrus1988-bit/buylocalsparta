-- DrinkStock Phase 3: tenant-scoped rehearsal market, no orders or production sales.
-- Independently versioned via Supabase migration. Kept out of the marketplace schema_migrations ledger.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drinkstock_venue_settings (
 venue_id uuid NOT NULL,
 partner_id uuid NOT NULL,
 rehearsal_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (venue_id, partner_id),
 FOREIGN KEY (venue_id, partner_id) REFERENCES public.hospitality_venues(id, partner_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.drinkstock_products (
 id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
 venue_id uuid NOT NULL,
 partner_id uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
 category text NOT NULL CHECK (category IN ('beer','cocktail','spirits','wine','soft_drink','other')),
 base_cents integer NOT NULL CHECK (base_cents BETWEEN 100 AND 200000),
 price_cents integer NOT NULL CHECK (price_cents BETWEEN 70 AND 290000),
 min_cents integer NOT NULL CHECK (min_cents >= 70),
 max_cents integer NOT NULL CHECK (max_cents <= 290000),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT drinkstock_product_price_band CHECK (min_cents <= price_cents AND price_cents <= max_cents AND min_cents <= base_cents AND base_cents <= max_cents),
 CONSTRAINT drinkstock_product_tenant_unique UNIQUE (id, venue_id, partner_id),
 FOREIGN KEY (venue_id, partner_id) REFERENCES public.hospitality_venues(id, partner_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_products_venue_name_uq ON public.drinkstock_products(venue_id, lower(name));
CREATE INDEX IF NOT EXISTS drinkstock_products_venue_idx ON public.drinkstock_products(partner_id,venue_id,active,created_at);
CREATE TABLE IF NOT EXISTS public.drinkstock_market_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL,
 partner_id uuid NOT NULL,
 request_key uuid NOT NULL,
 actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 200),
 event_type text NOT NULL CHECK (event_type IN ('product_added','rehearsal_started','rehearsal_paused','demand','reset')),
 selected_product_id uuid,
 movements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(movements)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (venue_id, partner_id) REFERENCES public.hospitality_venues(id, partner_id) ON DELETE CASCADE,
 FOREIGN KEY (selected_product_id,venue_id,partner_id) REFERENCES public.drinkstock_products(id,venue_id,partner_id),
 CONSTRAINT drinkstock_events_idempotency UNIQUE (venue_id,request_key)
);
CREATE INDEX IF NOT EXISTS drinkstock_events_history_idx ON public.drinkstock_market_events(partner_id,venue_id,created_at DESC);
ALTER TABLE public.drinkstock_venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_market_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_venue_settings,public.drinkstock_products,public.drinkstock_market_events FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.drinkstock_market_events IS 'Append-only rehearsal event journal; NEVER authoritative POS sales or guest transactions.';
COMMIT;
