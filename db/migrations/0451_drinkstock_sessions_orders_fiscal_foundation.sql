-- DrinkStock: scoped operations. All new rows are private server-side.
-- Payments, receipt issuance, and live order dispatch remain OFF until certified adapters are connected.
BEGIN;
-- Reconstruct the existing production hospitality foundation for clean CI databases.
-- Existing production tables are preserved by IF NOT EXISTS and no data is modified.
CREATE TABLE IF NOT EXISTS public.hospitality_partners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{1,62}CREATE TABLE IF NOT EXISTS public.drinkstock_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','running','paused','crashing','ended')),
 floor_percent integer NOT NULL CHECK (floor_percent BETWEEN 50 AND 100),
 ceiling_percent integer NOT NULL CHECK (ceiling_percent BETWEEN 100 AND 200),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 ended_at timestamptz,
 crash_until timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 CHECK ((state='crashing')=(crash_until IS NOT NULL)),
 CHECK (state<>'ended' OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_one_open_session ON public.drinkstock_sessions(venue_id)
 WHERE state IN ('scheduled','running','paused','crashing');
CREATE INDEX IF NOT EXISTS drinkstock_sessions_partner_venue ON public.drinkstock_sessions(partner_id,venue_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.drinkstock_access_passes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('screen','table')),
 token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
 table_label text,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 CHECK ((kind='table' AND table_label ~ '^[A-Za-z0-9 Α-Ωα-ω_-]{1,30}$') OR (kind='screen' AND table_label IS NULL))
);
CREATE INDEX IF NOT EXISTS drinkstock_access_passes_venue ON public.drinkstock_access_passes(partner_id,venue_id,kind) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.drinkstock_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 session_id uuid NOT NULL REFERENCES public.drinkstock_sessions(id),
 table_pass_id uuid NOT NULL REFERENCES public.drinkstock_access_passes(id),
 request_key uuid NOT NULL,
 order_state text NOT NULL DEFAULT 'awaiting_payment'
  CHECK (order_state IN ('awaiting_payment','paid','accepted','preparing','ready','served','cancelled','refunded')),
 payment_state text NOT NULL DEFAULT 'unpaid'
  CHECK (payment_state IN ('unpaid','pending','paid','failed','refunded','partially_refunded')),
 fiscal_state text NOT NULL DEFAULT 'not_requested'
  CHECK (fiscal_state IN ('not_requested','pending','issued','failed','credited')),
 amount_gross_cents integer NOT NULL CHECK (amount_gross_cents>0),
 currency text NOT NULL DEFAULT 'EUR' CHECK (currency='EUR'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
CREATE INDEX IF NOT EXISTS drinkstock_orders_workflow ON public.drinkstock_orders(partner_id,venue_id,order_state,created_at);
CREATE TABLE IF NOT EXISTS public.drinkstock_order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 product_id uuid NOT NULL REFERENCES public.drinkstock_products(id),
 description text NOT NULL,
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
 unit_gross_cents integer NOT NULL CHECK (unit_gross_cents>0),
 vat_rate_basis_points integer NOT NULL CHECK (vat_rate_basis_points IN (0,400,600,900,1300,1700,2400)),
 total_gross_cents integer GENERATED ALWAYS AS (quantity*unit_gross_cents) STORED
);
CREATE TABLE IF NOT EXISTS public.drinkstock_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 provider text NOT NULL,
 provider_event_id text NOT NULL,
 event_type text NOT NULL,
 amount_cents integer NOT NULL CHECK (amount_cents>=0),
 payload_sha256 text,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 document_kind text NOT NULL CHECK(document_kind IN ('retail_receipt','credit_note')),
 fiscal_provider text NOT NULL,
 provider_document_id text,
 provider_mark text,
 state text NOT NULL CHECK (state IN ('requested','issued','failed')),
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_one_retail_receipt ON public.drinkstock_fiscal_documents(order_id)
 WHERE document_kind='retail_receipt' AND state IN ('requested','issued');
CREATE TABLE IF NOT EXISTS public.drinkstock_order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 actor_type text NOT NULL CHECK (actor_type IN ('customer','staff','manager','payment_webhook','fiscal_adapter','system')),
 actor_id text,
 from_state text,
 to_state text NOT NULL,
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,request_key)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_session_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 session_id uuid REFERENCES public.drinkstock_sessions(id),
 request_key uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('start','pause','resume','crash','end','create_screen','create_table','revoke_pass')),
 actor_user_id text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
CREATE INDEX IF NOT EXISTS drinkstock_session_actions_tenant ON public.drinkstock_session_actions(partner_id,venue_id,created_at DESC);
-- No grants/policies for web clients: only the server DB connection can access these.
ALTER TABLE public.drinkstock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_session_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_access_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_sessions,public.drinkstock_access_passes,public.drinkstock_orders,
 public.drinkstock_order_lines,public.drinkstock_payment_events,public.drinkstock_fiscal_documents,
 public.drinkstock_order_events,public.drinkstock_session_actions FROM anon,authenticated;
COMMIT;
),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 200),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hospitality_venues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 200),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,partner_id)
);
CREATE TABLE IF NOT EXISTS public.hospitality_partner_memberships (
 partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 user_id text NOT NULL CHECK(length(btrim(user_id)) BETWEEN 1 AND 200),
 role text NOT NULL CHECK(role IN ('owner','manager','staff','viewer')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(partner_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.hospitality_partner_apps (
 partner_id uuid NOT NULL REFERENCES public.hospitality_partners(id) ON DELETE CASCADE,
 app_key text NOT NULL CHECK(app_key ~ '^[A-Za-z][A-Za-z0-9]{1,63}CREATE TABLE IF NOT EXISTS public.drinkstock_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','running','paused','crashing','ended')),
 floor_percent integer NOT NULL CHECK (floor_percent BETWEEN 50 AND 100),
 ceiling_percent integer NOT NULL CHECK (ceiling_percent BETWEEN 100 AND 200),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 ended_at timestamptz,
 crash_until timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 CHECK ((state='crashing')=(crash_until IS NOT NULL)),
 CHECK (state<>'ended' OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_one_open_session ON public.drinkstock_sessions(venue_id)
 WHERE state IN ('scheduled','running','paused','crashing');
CREATE INDEX IF NOT EXISTS drinkstock_sessions_partner_venue ON public.drinkstock_sessions(partner_id,venue_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.drinkstock_access_passes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('screen','table')),
 token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
 table_label text,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 CHECK ((kind='table' AND table_label ~ '^[A-Za-z0-9 Α-Ωα-ω_-]{1,30}$') OR (kind='screen' AND table_label IS NULL))
);
CREATE INDEX IF NOT EXISTS drinkstock_access_passes_venue ON public.drinkstock_access_passes(partner_id,venue_id,kind) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.drinkstock_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 session_id uuid NOT NULL REFERENCES public.drinkstock_sessions(id),
 table_pass_id uuid NOT NULL REFERENCES public.drinkstock_access_passes(id),
 request_key uuid NOT NULL,
 order_state text NOT NULL DEFAULT 'awaiting_payment'
  CHECK (order_state IN ('awaiting_payment','paid','accepted','preparing','ready','served','cancelled','refunded')),
 payment_state text NOT NULL DEFAULT 'unpaid'
  CHECK (payment_state IN ('unpaid','pending','paid','failed','refunded','partially_refunded')),
 fiscal_state text NOT NULL DEFAULT 'not_requested'
  CHECK (fiscal_state IN ('not_requested','pending','issued','failed','credited')),
 amount_gross_cents integer NOT NULL CHECK (amount_gross_cents>0),
 currency text NOT NULL DEFAULT 'EUR' CHECK (currency='EUR'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
CREATE INDEX IF NOT EXISTS drinkstock_orders_workflow ON public.drinkstock_orders(partner_id,venue_id,order_state,created_at);
CREATE TABLE IF NOT EXISTS public.drinkstock_order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 product_id uuid NOT NULL REFERENCES public.drinkstock_products(id),
 description text NOT NULL,
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
 unit_gross_cents integer NOT NULL CHECK (unit_gross_cents>0),
 vat_rate_basis_points integer NOT NULL CHECK (vat_rate_basis_points IN (0,400,600,900,1300,1700,2400)),
 total_gross_cents integer GENERATED ALWAYS AS (quantity*unit_gross_cents) STORED
);
CREATE TABLE IF NOT EXISTS public.drinkstock_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 provider text NOT NULL,
 provider_event_id text NOT NULL,
 event_type text NOT NULL,
 amount_cents integer NOT NULL CHECK (amount_cents>=0),
 payload_sha256 text,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 document_kind text NOT NULL CHECK(document_kind IN ('retail_receipt','credit_note')),
 fiscal_provider text NOT NULL,
 provider_document_id text,
 provider_mark text,
 state text NOT NULL CHECK (state IN ('requested','issued','failed')),
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_one_retail_receipt ON public.drinkstock_fiscal_documents(order_id)
 WHERE document_kind='retail_receipt' AND state IN ('requested','issued');
CREATE TABLE IF NOT EXISTS public.drinkstock_order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 actor_type text NOT NULL CHECK (actor_type IN ('customer','staff','manager','payment_webhook','fiscal_adapter','system')),
 actor_id text,
 from_state text,
 to_state text NOT NULL,
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,request_key)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_session_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 session_id uuid REFERENCES public.drinkstock_sessions(id),
 request_key uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('start','pause','resume','crash','end','create_screen','create_table','revoke_pass')),
 actor_user_id text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
CREATE INDEX IF NOT EXISTS drinkstock_session_actions_tenant ON public.drinkstock_session_actions(partner_id,venue_id,created_at DESC);
-- No grants/policies for web clients: only the server DB connection can access these.
ALTER TABLE public.drinkstock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_session_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_access_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_sessions,public.drinkstock_access_passes,public.drinkstock_orders,
 public.drinkstock_order_lines,public.drinkstock_payment_events,public.drinkstock_fiscal_documents,
 public.drinkstock_order_events,public.drinkstock_session_actions FROM anon,authenticated;
COMMIT;
),
 enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(partner_id,app_key)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_venue_settings (
 venue_id uuid NOT NULL,partner_id uuid NOT NULL,
 rehearsal_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 floor_percent integer NOT NULL DEFAULT 70 CHECK(floor_percent BETWEEN 50 AND 100),
 ceiling_percent integer NOT NULL DEFAULT 145 CHECK(ceiling_percent BETWEEN 100 AND 200),
 PRIMARY KEY(venue_id,partner_id),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.drinkstock_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL,partner_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 80),
 category text NOT NULL CHECK(category IN ('beer','cocktail','spirits','wine','soft_drink','other')),
 base_cents integer NOT NULL CHECK(base_cents BETWEEN 100 AND 200000),
 price_cents integer NOT NULL CHECK(price_cents BETWEEN 50 AND 400000),
 min_cents integer NOT NULL CHECK(min_cents >= 50),
 max_cents integer NOT NULL CHECK(max_cents <= 400000),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,venue_id,partner_id),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE,
 CONSTRAINT drinkstock_product_price_band CHECK(min_cents<=price_cents AND price_cents<=max_cents AND min_cents<=base_cents AND base_cents<=max_cents)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_market_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL,partner_id uuid NOT NULL,request_key uuid NOT NULL,
 actor_user_id text NOT NULL CHECK(length(actor_user_id) BETWEEN 1 AND 200),
 event_type text NOT NULL CHECK(event_type IN ('product_added','rehearsal_started','rehearsal_paused','demand','reset','bounds_updated')),
 selected_product_id uuid,
 movements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(movements)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY(venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id) ON DELETE CASCADE,
 FOREIGN KEY(selected_product_id,venue_id,partner_id) REFERENCES public.drinkstock_products(id,venue_id,partner_id)
);
CREATE INDEX IF NOT EXISTS hospitality_venues_partner_idx ON public.hospitality_venues(partner_id,status,name);
CREATE INDEX IF NOT EXISTS hospitality_memberships_user_idx ON public.hospitality_partner_memberships(user_id,status,partner_id);
CREATE INDEX IF NOT EXISTS drinkstock_products_venue_idx ON public.drinkstock_products(partner_id,venue_id,active,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_products_venue_name_uq ON public.drinkstock_products(venue_id,lower(name));
CREATE INDEX IF NOT EXISTS drinkstock_events_history_idx ON public.drinkstock_market_events(partner_id,venue_id,created_at DESC);
ALTER TABLE public.hospitality_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitality_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitality_partner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitality_partner_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_market_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hospitality_partners,public.hospitality_venues,public.hospitality_partner_memberships,
 public.hospitality_partner_apps,public.drinkstock_venue_settings,public.drinkstock_products,
 public.drinkstock_market_events FROM anon,authenticated;
CREATE TABLE IF NOT EXISTS public.drinkstock_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','running','paused','crashing','ended')),
 floor_percent integer NOT NULL CHECK (floor_percent BETWEEN 50 AND 100),
 ceiling_percent integer NOT NULL CHECK (ceiling_percent BETWEEN 100 AND 200),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 ended_at timestamptz,
 crash_until timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 CHECK ((state='crashing')=(crash_until IS NOT NULL)),
 CHECK (state<>'ended' OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_one_open_session ON public.drinkstock_sessions(venue_id)
 WHERE state IN ('scheduled','running','paused','crashing');
CREATE INDEX IF NOT EXISTS drinkstock_sessions_partner_venue ON public.drinkstock_sessions(partner_id,venue_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.drinkstock_access_passes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('screen','table')),
 token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
 table_label text,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id),
 CHECK ((kind='table' AND table_label ~ '^[A-Za-z0-9 Α-Ωα-ω_-]{1,30}$') OR (kind='screen' AND table_label IS NULL))
);
CREATE INDEX IF NOT EXISTS drinkstock_access_passes_venue ON public.drinkstock_access_passes(partner_id,venue_id,kind) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.drinkstock_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 session_id uuid NOT NULL REFERENCES public.drinkstock_sessions(id),
 table_pass_id uuid NOT NULL REFERENCES public.drinkstock_access_passes(id),
 request_key uuid NOT NULL,
 order_state text NOT NULL DEFAULT 'awaiting_payment'
  CHECK (order_state IN ('awaiting_payment','paid','accepted','preparing','ready','served','cancelled','refunded')),
 payment_state text NOT NULL DEFAULT 'unpaid'
  CHECK (payment_state IN ('unpaid','pending','paid','failed','refunded','partially_refunded')),
 fiscal_state text NOT NULL DEFAULT 'not_requested'
  CHECK (fiscal_state IN ('not_requested','pending','issued','failed','credited')),
 amount_gross_cents integer NOT NULL CHECK (amount_gross_cents>0),
 currency text NOT NULL DEFAULT 'EUR' CHECK (currency='EUR'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
CREATE INDEX IF NOT EXISTS drinkstock_orders_workflow ON public.drinkstock_orders(partner_id,venue_id,order_state,created_at);
CREATE TABLE IF NOT EXISTS public.drinkstock_order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 product_id uuid NOT NULL REFERENCES public.drinkstock_products(id),
 description text NOT NULL,
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
 unit_gross_cents integer NOT NULL CHECK (unit_gross_cents>0),
 vat_rate_basis_points integer NOT NULL CHECK (vat_rate_basis_points IN (0,400,600,900,1300,1700,2400)),
 total_gross_cents integer GENERATED ALWAYS AS (quantity*unit_gross_cents) STORED
);
CREATE TABLE IF NOT EXISTS public.drinkstock_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 provider text NOT NULL,
 provider_event_id text NOT NULL,
 event_type text NOT NULL,
 amount_cents integer NOT NULL CHECK (amount_cents>=0),
 payload_sha256 text,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,provider_event_id)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 document_kind text NOT NULL CHECK(document_kind IN ('retail_receipt','credit_note')),
 fiscal_provider text NOT NULL,
 provider_document_id text,
 provider_mark text,
 state text NOT NULL CHECK (state IN ('requested','issued','failed')),
 issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drinkstock_one_retail_receipt ON public.drinkstock_fiscal_documents(order_id)
 WHERE document_kind='retail_receipt' AND state IN ('requested','issued');
CREATE TABLE IF NOT EXISTS public.drinkstock_order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.drinkstock_orders(id),
 actor_type text NOT NULL CHECK (actor_type IN ('customer','staff','manager','payment_webhook','fiscal_adapter','system')),
 actor_id text,
 from_state text,
 to_state text NOT NULL,
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,request_key)
);
CREATE TABLE IF NOT EXISTS public.drinkstock_session_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL,
 venue_id uuid NOT NULL,
 session_id uuid REFERENCES public.drinkstock_sessions(id),
 request_key uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('start','pause','resume','crash','end','create_screen','create_table','revoke_pass')),
 actor_user_id text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,request_key),
 FOREIGN KEY (venue_id,partner_id) REFERENCES public.hospitality_venues(id,partner_id)
);
CREATE INDEX IF NOT EXISTS drinkstock_session_actions_tenant ON public.drinkstock_session_actions(partner_id,venue_id,created_at DESC);
-- No grants/policies for web clients: only the server DB connection can access these.
ALTER TABLE public.drinkstock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_session_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_access_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drinkstock_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drinkstock_sessions,public.drinkstock_access_passes,public.drinkstock_orders,
 public.drinkstock_order_lines,public.drinkstock_payment_events,public.drinkstock_fiscal_documents,
 public.drinkstock_order_events,public.drinkstock_session_actions FROM anon,authenticated;
COMMIT;
