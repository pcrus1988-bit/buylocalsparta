-- Buy Local Sparta core schema
-- PostgreSQL 18 target. Monetary values are integer minor units (EUR cents by default).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE user_status AS ENUM ('pending_verification','active','restricted','suspended','closed');
CREATE TYPE vendor_status AS ENUM ('invited','application_started','verification_pending','catalog_onboarding','test_ready','active','restricted','suspended','closed');
CREATE TYPE offer_status AS ENUM ('draft','pending_review','approved','rejected','archived','suppressed');
CREATE TYPE reservation_status AS ENUM ('active','consumed','released','expired');
CREATE TYPE order_status AS ENUM ('draft','pending_payment','authorised','confirmed','requires_customer_action','partially_fulfilled','fulfilled','completed','cancelled','partially_refunded','refunded','disputed');
CREATE TYPE fulfilment_status AS ENUM ('awaiting_acceptance','accepted','rejected','picking','packed','ready_for_handover','handed_over','shipped','delivered','failed','cancelled');
CREATE TYPE payment_status AS ENUM ('created','requires_action','authorised','captured','failed','cancelled','partially_refunded','refunded','chargeback');
CREATE TYPE procurement_status AS ENUM ('estimated','accrued','vendor_invoice_required','matched','approved','payable','settled','disputed','reversed');
CREATE TYPE return_status AS ENUM ('requested','approved','inspection_required','in_transit','received','inspected','remedy_approved','refunded','replaced','closed','rejected');
CREATE TYPE conversation_status AS ENUM ('new','assigned','active','waiting_customer','waiting_vendor','offer_sent','converted','resolved','escalated','closed');
CREATE TYPE appointment_status AS ENUM ('pending','confirmed','completed','cancelled','rescheduled','no_show');
CREATE TYPE counteroffer_status AS ENUM ('submitted','matched','assigned','awaiting_vendor','needs_info','offered','declined','expired','accepted','converted','closed');
CREATE TYPE ledger_direction AS ENUM ('debit','credit');
CREATE TYPE fulfilment_mode AS ENUM ('pickup','local_delivery','shipping','bulky_special');

CREATE TABLE markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'GR',
  currency char(3) NOT NULL DEFAULT 'EUR',
  timezone text NOT NULL DEFAULT 'Europe/Athens',
  default_locale text NOT NULL DEFAULT 'el',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  phone text,
  password_hash text,
  status user_status NOT NULL DEFAULT 'pending_verification',
  email_verified_at timestamptz,
  preferred_locale text NOT NULL DEFAULT 'el',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_idx ON user_sessions(user_id, expires_at);

CREATE TABLE customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  marketing_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  market_id uuid REFERENCES markets(id),
  label text,
  recipient_name text,
  company_name text,
  vat_number text,
  line1 text NOT NULL,
  line2 text,
  locality text NOT NULL,
  region text,
  postcode text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'GR',
  phone text,
  coordinates geography(point,4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_user_idx ON addresses(user_id);
CREATE INDEX addresses_geo_idx ON addresses USING gist(coordinates);

CREATE TABLE vendor_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  legal_name text NOT NULL,
  trading_name text NOT NULL,
  tax_number text,
  gemi_number text,
  legal_form text,
  status vendor_status NOT NULL DEFAULT 'invited',
  seller_relationship text NOT NULL DEFAULT 'supplier_fulfilment_partner',
  verification_completed_at timestamptz,
  contract_started_at timestamptz,
  contract_ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, trading_name)
);
CREATE INDEX vendor_businesses_market_status_idx ON vendor_businesses(market_id, status);

CREATE TABLE vendor_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  market_id uuid NOT NULL REFERENCES markets(id),
  name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  locality text NOT NULL,
  postcode text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'GR',
  coordinates geography(point,4326),
  phone text,
  public_email citext,
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  closure_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  fulfilment_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_locations_vendor_idx ON vendor_locations(vendor_id, active);
CREATE INDEX vendor_locations_geo_idx ON vendor_locations USING gist(coordinates);

CREATE TABLE vendor_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  user_id uuid NOT NULL REFERENCES users(id),
  location_id uuid REFERENCES vendor_locations(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, user_id, location_id)
);

CREATE TABLE vendor_user_roles (
  vendor_user_id uuid NOT NULL REFERENCES vendor_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('vendor_owner','vendor_catalog','vendor_fulfilment','vendor_adviser','vendor_finance')),
  PRIMARY KEY(vendor_user_id, role)
);

CREATE TABLE platform_user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin','vendor_operations','catalog_qa','customer_support','platform_finance','content_seo','compliance','logistics','auditor')),
  PRIMARY KEY(user_id, role)
);

CREATE TABLE vendor_verification_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','verified','failed','expired','requires_review')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_by uuid REFERENCES users(id),
  checked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_verification_checks_vendor_idx ON vendor_verification_checks(vendor_id, type, status);

CREATE TABLE vendor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES markets(id),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  monthly_price_minor bigint,
  annual_price_minor bigint,
  term_price_minor bigint,
  term_months integer,
  sales_fee_bps integer NOT NULL DEFAULT 0,
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, code)
);

CREATE TABLE vendor_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  plan_id uuid NOT NULL REFERENCES vendor_plans(id),
  status text NOT NULL CHECK (status IN ('draft','pending_payment','active','past_due','grace_period','restricted','suspended','cancelled','expired')),
  starts_at timestamptz,
  ends_at timestamptz,
  sales_fee_bps_snapshot integer NOT NULL,
  entitlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_subscriptions_vendor_status_idx ON vendor_subscriptions(vendor_id, status);

CREATE TABLE vendor_profile_translations (
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  locale text NOT NULL,
  story text,
  expertise text,
  short_description text,
  seo_title text,
  seo_description text,
  PRIMARY KEY(vendor_id, locale)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES markets(id),
  parent_id uuid REFERENCES categories(id),
  code text NOT NULL,
  slug text NOT NULL,
  commerce_mode text NOT NULL DEFAULT 'standard' CHECK (commerce_mode IN ('standard','logistics_sensitive','compatibility_sensitive','regulated_mixed','vehicles','directory_only')),
  active boolean NOT NULL DEFAULT true,
  filter_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, slug)
);
CREATE INDEX categories_parent_idx ON categories(parent_id);

CREATE TABLE category_translations (
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  description text,
  seo_title text,
  seo_description text,
  PRIMARY KEY(category_id, locale)
);

CREATE TABLE attribute_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  data_type text NOT NULL CHECK (data_type IN ('text','number','boolean','enum','multienum','dimension')),
  unit text,
  variant_identity boolean NOT NULL DEFAULT false,
  filterable boolean NOT NULL DEFAULT true,
  values jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE category_attributes (
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id),
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(category_id, attribute_id)
);

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  website text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  brand_id uuid REFERENCES brands(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  model text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canonical_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  family_id uuid REFERENCES product_families(id),
  brand_id uuid REFERENCES brands(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  slug text NOT NULL,
  gtin text,
  mpn text,
  model text,
  condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','refurbished','used')),
  variant_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  warranty_basis text,
  platform_price_minor bigint NOT NULL CHECK (platform_price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  tax_rate_bps integer NOT NULL CHECK (tax_rate_bps >= 0),
  active boolean NOT NULL DEFAULT true,
  suppressed boolean NOT NULL DEFAULT false,
  recalled boolean NOT NULL DEFAULT false,
  price_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, slug)
);
CREATE UNIQUE INDEX canonical_variants_gtin_unique ON canonical_variants(market_id, gtin) WHERE gtin IS NOT NULL;
CREATE INDEX canonical_variants_category_idx ON canonical_variants(market_id, category_id, active) WHERE suppressed = false;

CREATE TABLE product_translations (
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL,
  description text,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo_title text,
  seo_description text,
  PRIMARY KEY(canonical_variant_id, locale)
);

CREATE TABLE product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendor_businesses(id),
  kind text NOT NULL CHECK (kind IN ('image','video','document')),
  object_key text NOT NULL,
  alt_text text,
  rights_owner text,
  rights_status text NOT NULL DEFAULT 'pending' CHECK (rights_status IN ('pending','approved','rejected')),
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  type text NOT NULL,
  issuer text,
  identifier text,
  object_key text,
  valid_from date,
  valid_to date,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_merge_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  source_vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  source_payload jsonb NOT NULL,
  candidate_variant_id uuid REFERENCES canonical_variants(id),
  confidence numeric(6,5) NOT NULL,
  match_level text NOT NULL CHECK (match_level IN ('exact','high_confidence','possible','different','requires_review')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auto_linked','approved','rejected','separated')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vendor_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  vendor_sku text,
  source_gtin text,
  status offer_status NOT NULL DEFAULT 'draft',
  supplier_unit_price_minor bigint NOT NULL CHECK (supplier_unit_price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  supplier_tax_rate_bps integer NOT NULL DEFAULT 2400,
  cost_ceiling_minor bigint,
  lead_time_minutes integer,
  fulfilment_modes fulfilment_mode[] NOT NULL DEFAULT ARRAY['pickup']::fulfilment_mode[],
  advice_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, location_id, canonical_variant_id, vendor_sku)
);
CREATE INDEX vendor_offers_variant_idx ON vendor_offers(market_id, canonical_variant_id, status);
CREATE INDEX vendor_offers_vendor_idx ON vendor_offers(vendor_id, status);

CREATE TABLE inventory_balances (
  offer_id uuid PRIMARY KEY REFERENCES vendor_offers(id),
  on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  active_reservations integer NOT NULL DEFAULT 0 CHECK (active_reservations >= 0),
  safety_stock integer NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  blocked integer NOT NULL DEFAULT 0 CHECK (blocked >= 0),
  source text NOT NULL DEFAULT 'manual',
  source_confidence text NOT NULL DEFAULT 'merchant_confirmed',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (active_reservations <= on_hand)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  movement_type text NOT NULL,
  quantity_delta integer NOT NULL,
  reservation_id uuid,
  source text NOT NULL,
  actor_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_offer_idx ON inventory_movements(offer_id, created_at);

CREATE TABLE fairness_rotation_state (
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  deficit numeric(18,9) NOT NULL DEFAULT 0,
  qualified_exposures bigint NOT NULL DEFAULT 0,
  capacity_weight numeric(12,6) NOT NULL DEFAULT 1 CHECK (capacity_weight > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(market_id, canonical_variant_id, vendor_id)
);

CREATE TABLE fairness_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  selected_offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  selected_vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  visitor_hash text NOT NULL,
  postcode_scope text NOT NULL,
  reason text NOT NULL,
  eligible_vendor_ids uuid[] NOT NULL,
  eligibility_snapshot jsonb NOT NULL,
  deficit_snapshot jsonb NOT NULL,
  tie_break jsonb NOT NULL DEFAULT '{}'::jsonb,
  override_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fairness_events_variant_idx ON fairness_assignment_events(market_id, canonical_variant_id, created_at);
CREATE INDEX fairness_events_vendor_idx ON fairness_assignment_events(selected_vendor_id, created_at);

CREATE TABLE sticky_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  visitor_hash text NOT NULL,
  postcode_scope text NOT NULL,
  offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  reason text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  release_reason text,
  UNIQUE(market_id, canonical_variant_id, visitor_hash, postcode_scope)
);
CREATE INDEX sticky_assignments_expiry_idx ON sticky_assignments(expires_at) WHERE released_at IS NULL;

CREATE TABLE fairness_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  reason text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  user_id uuid REFERENCES users(id),
  visitor_hash text,
  currency char(3) NOT NULL DEFAULT 'EUR',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  assigned_offer_id uuid REFERENCES vendor_offers(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  private_offer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cart_id, canonical_variant_id, private_offer_id)
);

CREATE TABLE stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  checkout_key text NOT NULL,
  offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  cart_item_id uuid REFERENCES cart_items(id),
  order_line_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  status reservation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(checkout_key, offer_id)
);
CREATE INDEX stock_reservations_active_idx ON stock_reservations(offer_id, expires_at) WHERE status = 'active';

CREATE TABLE customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  user_id uuid REFERENCES users(id),
  visitor_hash text,
  checkout_key text NOT NULL UNIQUE,
  status order_status NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  subtotal_minor bigint NOT NULL,
  shipping_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL,
  total_minor bigint NOT NULL,
  billing_address_snapshot jsonb NOT NULL,
  shipping_address_snapshot jsonb,
  fulfilment_preference fulfilment_mode NOT NULL,
  partial_fulfilment_allowed boolean NOT NULL DEFAULT false,
  terms_version text NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_orders_user_idx ON customer_orders(user_id, created_at DESC);
CREATE INDEX customer_orders_status_idx ON customer_orders(status, created_at);

CREATE TABLE order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  assigned_offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  product_snapshot jsonb NOT NULL,
  retail_unit_price_minor bigint NOT NULL,
  tax_rate_bps integer NOT NULL,
  tax_minor bigint NOT NULL,
  supplier_unit_price_minor bigint NOT NULL,
  supplier_tax_rate_bps integer NOT NULL,
  shipping_promise_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'awaiting_vendor',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_lines_order_idx ON order_lines(order_id);
CREATE INDEX order_lines_vendor_idx ON order_lines(vendor_id, created_at);

ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_order_line_fk FOREIGN KEY(order_line_id) REFERENCES order_lines(id);

CREATE TABLE fulfilment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfilment_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  mode fulfilment_mode NOT NULL,
  status fulfilment_status NOT NULL DEFAULT 'awaiting_acceptance',
  accepted_at timestamptz,
  due_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fulfilment_orders_vendor_status_idx ON fulfilment_orders(vendor_id, status, due_at);

CREATE TABLE fulfilment_order_lines (
  fulfilment_order_id uuid NOT NULL REFERENCES fulfilment_orders(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  PRIMARY KEY(fulfilment_order_id, order_line_id)
);

CREATE TABLE pickup_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfilment_order_id uuid NOT NULL REFERENCES fulfilment_orders(id),
  pickup_code_hash text NOT NULL,
  qr_token_hash text NOT NULL,
  ready_at timestamptz,
  window_starts_at timestamptz,
  window_ends_at timestamptz,
  collected_at timestamptz,
  collected_by uuid REFERENCES users(id)
);

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  fulfilment_order_id uuid REFERENCES fulfilment_orders(id),
  carrier text,
  service text,
  tracking_number text,
  provider_shipment_id text,
  status text NOT NULL DEFAULT 'created',
  label_object_key text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  proof jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_order_idx ON shipments(order_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES customer_orders(id),
  provider text NOT NULL,
  provider_payment_id text,
  idempotency_key text NOT NULL UNIQUE,
  status payment_status NOT NULL DEFAULT 'created',
  currency char(3) NOT NULL DEFAULT 'EUR',
  authorised_minor bigint NOT NULL DEFAULT 0,
  captured_minor bigint NOT NULL DEFAULT 0,
  refunded_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_payment_id)
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  provider_refund_id text,
  idempotency_key text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'pending',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE tax_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  order_id uuid REFERENCES customer_orders(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  type text NOT NULL CHECK (type IN ('retail_receipt','customer_invoice','retail_credit','supplier_invoice','supplier_credit','platform_service_invoice','dispatch_document')),
  document_number text,
  provider text,
  provider_document_id text,
  aade_mark text,
  currency char(3) NOT NULL DEFAULT 'EUR',
  net_minor bigint NOT NULL,
  tax_minor bigint NOT NULL,
  gross_minor bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload_snapshot jsonb NOT NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tax_documents_order_idx ON tax_documents(order_id, type);
CREATE INDEX tax_documents_vendor_idx ON tax_documents(vendor_id, type);

CREATE TABLE procurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_number text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES markets(id),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  fulfilment_order_id uuid REFERENCES fulfilment_orders(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  status procurement_status NOT NULL DEFAULT 'estimated',
  currency char(3) NOT NULL DEFAULT 'EUR',
  supplier_net_minor bigint NOT NULL,
  supplier_tax_minor bigint NOT NULL,
  shipping_reimbursement_minor bigint NOT NULL DEFAULT 0,
  service_fee_minor bigint NOT NULL DEFAULT 0,
  adjustment_minor bigint NOT NULL DEFAULT 0,
  payable_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX procurements_vendor_status_idx ON procurements(vendor_id, status, created_at);

CREATE TABLE vendor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  tax_document_id uuid REFERENCES tax_documents(id),
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  net_minor bigint NOT NULL,
  tax_minor bigint NOT NULL,
  gross_minor bigint NOT NULL,
  status text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, invoice_number)
);

CREATE TABLE procurement_invoice_matches (
  procurement_id uuid NOT NULL REFERENCES procurements(id),
  vendor_invoice_id uuid NOT NULL REFERENCES vendor_invoices(id),
  matched_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(procurement_id, vendor_invoice_id)
);

CREATE TABLE fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES markets(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  plan_id uuid REFERENCES vendor_plans(id),
  category_id uuid REFERENCES categories(id),
  rule_type text NOT NULL,
  basis text NOT NULL,
  fixed_minor bigint,
  rate_bps integer,
  cap_minor bigint,
  floor_minor bigint,
  tax_code text,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fee_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES customer_orders(id),
  procurement_id uuid REFERENCES procurements(id),
  fee_rule_id uuid REFERENCES fee_rules(id),
  resolved_rule jsonb NOT NULL,
  amount_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  batch_number text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('draft','reconciling','approval_required','approved','processing','paid','closed','failed')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  closed_at timestamptz
);

CREATE TABLE settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES settlement_batches(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  procurement_id uuid REFERENCES procurements(id),
  currency char(3) NOT NULL DEFAULT 'EUR',
  payable_minor bigint NOT NULL,
  adjustment_minor bigint NOT NULL DEFAULT 0,
  final_minor bigint NOT NULL,
  payout_reference text,
  reconciliation_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settlement_lines_vendor_idx ON settlement_lines(vendor_id, batch_id);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  reference text NOT NULL UNIQUE,
  event_type text NOT NULL,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
  account text NOT NULL,
  direction ledger_direction NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries(account, created_at);
CREATE INDEX ledger_entries_entity_idx ON ledger_entries(entity_type, entity_id);

CREATE TABLE adviser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_user_id uuid NOT NULL REFERENCES vendor_users(id),
  display_name text NOT NULL,
  languages text[] NOT NULL DEFAULT ARRAY['el']::text[],
  specialties text[] NOT NULL DEFAULT ARRAY[]::text[],
  credentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE adviser_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adviser_id uuid NOT NULL REFERENCES adviser_profiles(id),
  location_id uuid REFERENCES vendor_locations(id),
  channel text NOT NULL CHECK (channel IN ('native_chat','in_store','phone','google_meet','whatsapp','viber')),
  schedule jsonb NOT NULL,
  duration_minutes integer,
  buffer_minutes integer NOT NULL DEFAULT 0,
  blackout_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  customer_user_id uuid REFERENCES users(id),
  visitor_hash text,
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  adviser_id uuid REFERENCES adviser_profiles(id),
  order_id uuid REFERENCES customer_orders(id),
  status conversation_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX conversations_vendor_status_idx ON conversations(vendor_id, status, updated_at);
CREATE INDEX conversations_customer_idx ON conversations(customer_user_id, updated_at);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id),
  sender_type text NOT NULL CHECK (sender_type IN ('customer','vendor','platform','system')),
  body text,
  attachment_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  read_at timestamptz,
  moderation_status text NOT NULL DEFAULT 'clear',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  customer_user_id uuid REFERENCES users(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  adviser_id uuid REFERENCES adviser_profiles(id),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  channel text NOT NULL,
  status appointment_status NOT NULL DEFAULT 'pending',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  customer_notes text,
  external_provider text,
  external_event_id text,
  external_join_url_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX appointments_adviser_time_idx ON appointments(adviser_id, starts_at, ends_at);

CREATE TABLE external_channel_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  conversation_id uuid REFERENCES conversations(id),
  appointment_id uuid REFERENCES appointments(id),
  channel text NOT NULL,
  disclosure_version text NOT NULL,
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE counteroffer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  customer_user_id uuid REFERENCES users(id),
  visitor_hash text,
  source_url text NOT NULL,
  source_url_hash text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  requested_quantity integer NOT NULL DEFAULT 1 CHECK (requested_quantity > 0),
  postcode text NOT NULL,
  priorities jsonb NOT NULL DEFAULT '{}'::jsonb,
  status counteroffer_status NOT NULL DEFAULT 'submitted',
  assigned_vendor_id uuid REFERENCES vendor_businesses(id),
  assigned_offer_id uuid REFERENCES vendor_offers(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counteroffers_vendor_status_idx ON counteroffer_requests(assigned_vendor_id, status, created_at);

CREATE TABLE private_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counteroffer_request_id uuid NOT NULL REFERENCES counteroffer_requests(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  alternative_variant_id uuid REFERENCES canonical_variants(id),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  inclusions jsonb NOT NULL DEFAULT '{}'::jsonb,
  fulfilment_promise jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','accepted','declined','expired','converted','revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cart_items ADD CONSTRAINT cart_items_private_offer_fk FOREIGN KEY(private_offer_id) REFERENCES private_offers(id);

CREATE TABLE returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  customer_user_id uuid REFERENCES users(id),
  reason_type text NOT NULL CHECK (reason_type IN ('withdrawal','defect','nonconformity','transit_damage','wrong_item','missing_part','other')),
  status return_status NOT NULL DEFAULT 'requested',
  requested_remedy text,
  destination_type text,
  destination_vendor_id uuid REFERENCES vendor_businesses(id),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE return_lines (
  return_id uuid NOT NULL REFERENCES returns(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  inspection_result jsonb,
  remedy text,
  refund_id uuid REFERENCES refunds(id),
  PRIMARY KEY(return_id, order_line_id)
);

CREATE TABLE product_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  type text NOT NULL CHECK (type IN ('safety_notice','recall','compliance_hold','content_notice')),
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  details jsonb NOT NULL,
  opened_by uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  user_id uuid NOT NULL REFERENCES users(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  order_id uuid REFERENCES customer_orders(id),
  conversation_id uuid REFERENCES conversations(id),
  interaction_type text NOT NULL CHECK (interaction_type IN ('verified_order','verified_advice')),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','push')),
  event_type text NOT NULL,
  template_version text NOT NULL,
  locale text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_status_idx ON notifications(status, created_at);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_events(available_at, created_at) WHERE processed_at IS NULL;

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES markets(id),
  actor_user_id uuid REFERENCES users(id),
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  reason text,
  before_state jsonb,
  after_state jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_user_id, created_at);

CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN ('access','export','correction','deletion','objection','marketing_withdrawal','account_closure')),
  status text NOT NULL DEFAULT 'submitted',
  due_at timestamptz,
  completed_at timestamptz,
  outcome jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES markets(id),
  page_type text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, slug)
);

CREATE TABLE cms_page_translations (
  page_id uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL,
  seo_title text,
  seo_description text,
  translated_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY(page_id, locale)
);

CREATE TABLE search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid REFERENCES markets(id),
  locale text NOT NULL,
  terms text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE system_settings (
  market_id uuid REFERENCES markets(id),
  key text NOT NULL,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(market_id, key)
);

-- Defense-in-depth RLS for vendor-sensitive tables. The application must set
-- SET LOCAL app.vendor_id = '<uuid>' for vendor-scoped transactions.
ALTER TABLE vendor_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfilment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_offer_scope ON vendor_offers
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);
CREATE POLICY inventory_vendor_scope ON inventory_balances
  USING (EXISTS (SELECT 1 FROM vendor_offers vo WHERE vo.id = inventory_balances.offer_id AND vo.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid));
CREATE POLICY fulfilment_vendor_scope ON fulfilment_orders
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);
CREATE POLICY procurement_vendor_scope ON procurements
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);
CREATE POLICY settlement_vendor_scope ON settlement_lines
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);
CREATE POLICY conversation_vendor_scope ON conversations
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);

-- Append-only history tables. Corrections must be new reversal/adjustment events.
CREATE OR REPLACE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a correcting event instead', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER inventory_movements_append_only BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER fairness_assignment_events_append_only BEFORE UPDATE OR DELETE ON fairness_assignment_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER payment_events_append_only BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

INSERT INTO markets(code, name, country_code, currency, timezone, default_locale)
VALUES ('sparta', 'Sparta', 'GR', 'EUR', 'Europe/Athens', 'el')
ON CONFLICT (code) DO NOTHING;

COMMIT;
