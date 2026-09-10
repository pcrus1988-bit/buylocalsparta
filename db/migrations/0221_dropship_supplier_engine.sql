-- KONTA MOY — generic external dropshipping supplier engine.
-- Supplier API availability is authoritative. Dropship stock must never be represented as local inventory_balances.

BEGIN;

CREATE TABLE public.dropship_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT ('dsp_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  catalog_source_id uuid REFERENCES public.catalog_sources(id) ON DELETE SET NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  provider_kind text NOT NULL,
  owner_vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  owner_location_id uuid NOT NULL REFERENCES public.vendor_locations(id),
  active boolean NOT NULL DEFAULT false,
  api_authoritative_availability boolean NOT NULL DEFAULT true,
  catalogue_sync_enabled boolean NOT NULL DEFAULT false,
  order_forwarding_enabled boolean NOT NULL DEFAULT false,
  tracking_sync_enabled boolean NOT NULL DEFAULT false,
  returns_enabled boolean NOT NULL DEFAULT false,
  shipping_quote_enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_healthcheck_at timestamptz,
  last_healthcheck_ok boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dropship_suppliers_public_id_key UNIQUE (public_id),
  CONSTRAINT dropship_suppliers_market_code_key UNIQUE (market_id,code),
  CONSTRAINT dropship_suppliers_code_nonempty CHECK (length(btrim(code)) > 0),
  CONSTRAINT dropship_suppliers_name_nonempty CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT dropship_suppliers_provider_nonempty CHECK (length(btrim(provider_kind)) > 0)
);

COMMENT ON TABLE public.dropship_suppliers IS
  'Platform-managed external fulfilment providers. configuration contains only non-secret capability/endpoint metadata; credentials remain server-side.';
COMMENT ON COLUMN public.dropship_suppliers.api_authoritative_availability IS
  'When true, cached availability is browsing evidence only and checkout/order creation must revalidate against the supplier API.';

CREATE TABLE public.dropship_supplier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT ('dso_' || replace(gen_random_uuid()::text,'-','')),
  supplier_id uuid NOT NULL REFERENCES public.dropship_suppliers(id) ON DELETE CASCADE,
  vendor_offer_id uuid NOT NULL REFERENCES public.vendor_offers(id) ON DELETE CASCADE,
  source_product_id uuid REFERENCES public.catalog_source_products(id) ON DELETE SET NULL,
  external_product_id text NOT NULL,
  external_variant_id text NOT NULL,
  external_sku text,
  ean text,
  mpn text,
  warehouse_code text,
  supplier_cost_minor bigint CHECK (supplier_cost_minor IS NULL OR supplier_cost_minor >= 0),
  supplier_currency char(3) NOT NULL DEFAULT 'EUR',
  cached_available boolean NOT NULL DEFAULT false,
  cached_quantity integer CHECK (cached_quantity IS NULL OR cached_quantity >= 0),
  availability_checked_at timestamptz,
  availability_expires_at timestamptz,
  availability_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_catalogue_sync_at timestamptz,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dropship_supplier_offers_public_id_key UNIQUE (public_id),
  CONSTRAINT dropship_supplier_offers_vendor_offer_key UNIQUE (vendor_offer_id),
  CONSTRAINT dropship_supplier_offers_external_variant_key UNIQUE (supplier_id,external_variant_id),
  CONSTRAINT dropship_supplier_offers_external_product_nonempty CHECK (length(btrim(external_product_id)) > 0),
  CONSTRAINT dropship_supplier_offers_external_variant_nonempty CHECK (length(btrim(external_variant_id)) > 0),
  CONSTRAINT dropship_supplier_offers_availability_window CHECK (
    availability_expires_at IS NULL OR availability_checked_at IS NULL OR availability_expires_at >= availability_checked_at
  )
);

CREATE INDEX dropship_supplier_offers_source_idx
  ON public.dropship_supplier_offers(supplier_id,source_product_id)
  WHERE source_product_id IS NOT NULL;
CREATE INDEX dropship_supplier_offers_availability_idx
  ON public.dropship_supplier_offers(supplier_id,active,cached_available,availability_expires_at);
CREATE INDEX dropship_supplier_offers_warehouse_idx
  ON public.dropship_supplier_offers(supplier_id,warehouse_code)
  WHERE warehouse_code IS NOT NULL;

COMMENT ON TABLE public.dropship_supplier_offers IS
  'External supplier metadata for a sellable vendor_offer. No inventory_balances row is created or implied.';
COMMENT ON COLUMN public.dropship_supplier_offers.cached_available IS
  'Last API-derived browsing cache. It is never sufficient by itself to authorize checkout when the supplier is API-authoritative.';

CREATE TABLE public.dropship_fulfilments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT ('dsf_' || replace(gen_random_uuid()::text,'-','')),
  supplier_id uuid NOT NULL REFERENCES public.dropship_suppliers(id),
  order_id uuid NOT NULL REFERENCES public.customer_orders(id),
  fulfilment_order_id uuid REFERENCES public.fulfilment_orders(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  warehouse_key text NOT NULL DEFAULT 'default',
  idempotency_key text NOT NULL,
  external_order_id text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued','creating','supplier_action_required','supplier_payment_required',
      'supplier_confirmation','preparing','awaiting_courier','shipped','delivered',
      'cancelled','failed','partially_refunded','refunded'
    )),
  provider_status text,
  supplier_currency char(3) NOT NULL DEFAULT 'EUR',
  supplier_merchandise_minor bigint NOT NULL DEFAULT 0 CHECK (supplier_merchandise_minor >= 0),
  supplier_shipping_minor bigint NOT NULL DEFAULT 0 CHECK (supplier_shipping_minor >= 0),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  submitted_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dropship_fulfilments_public_id_key UNIQUE (public_id),
  CONSTRAINT dropship_fulfilments_idempotency_key UNIQUE (idempotency_key),
  CONSTRAINT dropship_fulfilments_order_warehouse_key UNIQUE (supplier_id,order_id,warehouse_key),
  CONSTRAINT dropship_fulfilments_warehouse_nonempty CHECK (length(btrim(warehouse_key)) > 0)
);

CREATE UNIQUE INDEX dropship_fulfilments_external_order_uidx
  ON public.dropship_fulfilments(supplier_id,external_order_id)
  WHERE external_order_id IS NOT NULL;
CREATE INDEX dropship_fulfilments_status_idx
  ON public.dropship_fulfilments(supplier_id,status,updated_at);
CREATE INDEX dropship_fulfilments_order_idx
  ON public.dropship_fulfilments(order_id,created_at);

CREATE TABLE public.dropship_fulfilment_lines (
  dropship_fulfilment_id uuid NOT NULL REFERENCES public.dropship_fulfilments(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES public.order_lines(id),
  supplier_offer_id uuid NOT NULL REFERENCES public.dropship_supplier_offers(id),
  external_variant_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  supplier_unit_cost_minor bigint NOT NULL CHECK (supplier_unit_cost_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dropship_fulfilment_id,order_line_id),
  CONSTRAINT dropship_fulfilment_lines_external_variant_nonempty CHECK (length(btrim(external_variant_id)) > 0)
);

CREATE UNIQUE INDEX dropship_fulfilment_lines_order_line_uidx
  ON public.dropship_fulfilment_lines(order_line_id);

CREATE TABLE public.dropship_supplier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL DEFAULT ('dse_' || replace(gen_random_uuid()::text,'-','')),
  supplier_id uuid NOT NULL REFERENCES public.dropship_suppliers(id) ON DELETE CASCADE,
  dropship_fulfilment_id uuid REFERENCES public.dropship_fulfilments(id) ON DELETE SET NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dropship_supplier_events_public_id_key UNIQUE (public_id),
  CONSTRAINT dropship_supplier_events_provider_key UNIQUE (supplier_id,provider_event_id),
  CONSTRAINT dropship_supplier_events_event_type_nonempty CHECK (length(btrim(event_type)) > 0)
);

CREATE INDEX dropship_supplier_events_processing_idx
  ON public.dropship_supplier_events(supplier_id,processed_at,created_at);

-- Every dropshipping supplier and its sellable offers are owned by the designated
-- KONTA MOY vendor account. The URL-safe vendor public id is intentionally used
-- because the internal UUID is deployment-specific.
CREATE OR REPLACE FUNCTION bls_private.enforce_dropship_supplier_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_businesses v
    WHERE v.id=NEW.owner_vendor_id
      AND v.public_id='vendor_e8cb57b3c67b469d9a9d'
  ) THEN
    RAISE EXCEPTION 'Dropshipping suppliers must belong to vendor_e8cb57b3c67b469d9a9d';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.vendor_locations l
    WHERE l.id=NEW.owner_location_id
      AND l.vendor_id=NEW.owner_vendor_id
      AND l.active=true
  ) THEN
    RAISE EXCEPTION 'Dropshipping supplier location must be an active location of its owner vendor';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dropship_suppliers_owner_guard
  BEFORE INSERT OR UPDATE OF owner_vendor_id,owner_location_id
  ON public.dropship_suppliers
  FOR EACH ROW EXECUTE FUNCTION bls_private.enforce_dropship_supplier_owner();

CREATE OR REPLACE FUNCTION bls_private.enforce_dropship_offer_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  supplier_vendor uuid;
  supplier_location uuid;
  offer_vendor uuid;
  offer_location uuid;
BEGIN
  SELECT owner_vendor_id,owner_location_id
    INTO supplier_vendor,supplier_location
  FROM public.dropship_suppliers
  WHERE id=NEW.supplier_id;

  SELECT vendor_id,location_id
    INTO offer_vendor,offer_location
  FROM public.vendor_offers
  WHERE id=NEW.vendor_offer_id;

  IF supplier_vendor IS NULL OR offer_vendor IS NULL
     OR supplier_vendor IS DISTINCT FROM offer_vendor
     OR supplier_location IS DISTINCT FROM offer_location THEN
    RAISE EXCEPTION 'Dropship vendor_offer must belong to the configured dropship owner vendor/location';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dropship_supplier_offers_owner_guard
  BEFORE INSERT OR UPDATE OF supplier_id,vendor_offer_id
  ON public.dropship_supplier_offers
  FOR EACH ROW EXECUTE FUNCTION bls_private.enforce_dropship_offer_owner();

CREATE OR REPLACE FUNCTION bls_private.enforce_dropship_fulfilment_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  fulfil_supplier uuid;
  fulfil_order uuid;
  line_order uuid;
  line_offer uuid;
  supplier_vendor_offer uuid;
BEGIN
  SELECT supplier_id,order_id
    INTO fulfil_supplier,fulfil_order
  FROM public.dropship_fulfilments
  WHERE id=NEW.dropship_fulfilment_id;

  SELECT order_id,assigned_offer_id
    INTO line_order,line_offer
  FROM public.order_lines
  WHERE id=NEW.order_line_id;

  SELECT vendor_offer_id
    INTO supplier_vendor_offer
  FROM public.dropship_supplier_offers
  WHERE id=NEW.supplier_offer_id
    AND supplier_id=fulfil_supplier;

  IF fulfil_order IS NULL OR line_order IS NULL OR supplier_vendor_offer IS NULL
     OR fulfil_order IS DISTINCT FROM line_order
     OR line_offer IS DISTINCT FROM supplier_vendor_offer THEN
    RAISE EXCEPTION 'Dropship fulfilment line must match its customer order, supplier and assigned vendor offer';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dropship_fulfilment_lines_guard
  BEFORE INSERT OR UPDATE
  ON public.dropship_fulfilment_lines
  FOR EACH ROW EXECUTE FUNCTION bls_private.enforce_dropship_fulfilment_line();

ALTER TABLE public.dropship_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_fulfilments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_fulfilment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.dropship_suppliers
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.dropship_supplier_offers
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.dropship_fulfilments
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.dropship_fulfilment_lines
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.dropship_supplier_events
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT EXECUTE ON FUNCTION bls_private.enforce_dropship_supplier_owner()
  TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.enforce_dropship_offer_owner()
  TO bls_app_runtime,bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.enforce_dropship_fulfilment_line()
  TO bls_app_runtime,bls_platform_runtime;

COMMIT;
