-- Consolidated order tracking, safe cancellation, customer-approved substitutions and fulfilment SLA governance.
-- Public/domain identifiers remain separate from internal UUID relations.
ALTER TYPE reservation_status ADD VALUE IF NOT EXISTS 'reversed';

BEGIN;

ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE TABLE order_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  fulfilment_order_id uuid REFERENCES fulfilment_orders(id),
  order_line_id uuid REFERENCES order_lines(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('customer','vendor','platform','provider','system')),
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text,
  customer_visible boolean NOT NULL DEFAULT true,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_timeline_order_idx ON order_timeline_events(order_id, created_at);
CREATE INDEX order_timeline_vendor_idx ON order_timeline_events(vendor_id, created_at) WHERE vendor_id IS NOT NULL;

CREATE TABLE order_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  order_id uuid NOT NULL UNIQUE REFERENCES customer_orders(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  status text NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
  payment_outcome text NOT NULL CHECK (payment_outcome IN ('authorisation_cancelled','refunded','already_closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL
);
CREATE INDEX order_cancellations_customer_idx ON order_cancellations(customer_id, created_at DESC);

CREATE TABLE order_substitution_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  original_canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  proposed_canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  proposed_offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  proposed_reservation_id uuid NOT NULL REFERENCES stock_reservations(id),
  currency char(3) NOT NULL DEFAULT 'EUR',
  original_retail_unit_minor bigint NOT NULL CHECK (original_retail_unit_minor >= 0),
  proposed_retail_unit_minor bigint NOT NULL CHECK (proposed_retail_unit_minor >= 0),
  proposed_title text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  status text NOT NULL DEFAULT 'pending_customer' CHECK (status IN ('pending_customer','approved','rejected','expired')),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (proposed_retail_unit_minor <= original_retail_unit_minor),
  CHECK (expires_at > created_at),
  CHECK ((status = 'pending_customer') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX order_substitution_one_pending_line_uidx ON order_substitution_requests(order_line_id) WHERE status='pending_customer';
CREATE INDEX order_substitution_customer_idx ON order_substitution_requests(customer_id, status, created_at DESC);
CREATE INDEX order_substitution_vendor_idx ON order_substitution_requests(vendor_id, status, created_at DESC);

CREATE TABLE fulfilment_sla_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  fulfilment_order_id uuid NOT NULL REFERENCES fulfilment_orders(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  stage text NOT NULL CHECK (stage IN ('acceptance','preparation')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','breached','escalated','resolved')),
  opened_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  escalation_at timestamptz NOT NULL,
  breached_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at > opened_at),
  CHECK (escalation_at >= due_at),
  CHECK ((state = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX fulfilment_sla_one_active_stage_uidx ON fulfilment_sla_cases(fulfilment_order_id, stage) WHERE state <> 'resolved';
CREATE INDEX fulfilment_sla_operations_idx ON fulfilment_sla_cases(state, due_at, escalation_at) WHERE state <> 'resolved';
CREATE INDEX fulfilment_sla_vendor_idx ON fulfilment_sla_cases(vendor_id, state, due_at);

CREATE OR REPLACE FUNCTION prevent_order_timeline_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order timeline events are append-only';
END $$;
CREATE TRIGGER order_timeline_no_update BEFORE UPDATE OR DELETE ON order_timeline_events FOR EACH ROW EXECUTE FUNCTION prevent_order_timeline_mutation();

CREATE OR REPLACE FUNCTION guard_customer_substitution_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.platform_access', true) = 'true' THEN RETURN NEW; END IF;
  IF nullif(current_setting('app.actor_user_id', true), '')::uuid = OLD.customer_id THEN
    IF NEW.order_id <> OLD.order_id OR NEW.order_line_id <> OLD.order_line_id OR NEW.customer_id <> OLD.customer_id OR NEW.vendor_id <> OLD.vendor_id
       OR NEW.original_canonical_variant_id <> OLD.original_canonical_variant_id OR NEW.proposed_canonical_variant_id <> OLD.proposed_canonical_variant_id
       OR NEW.proposed_offer_id <> OLD.proposed_offer_id OR NEW.proposed_reservation_id <> OLD.proposed_reservation_id OR NEW.currency <> OLD.currency
       OR NEW.original_retail_unit_minor <> OLD.original_retail_unit_minor OR NEW.proposed_retail_unit_minor <> OLD.proposed_retail_unit_minor
       OR NEW.proposed_title <> OLD.proposed_title OR NEW.reason <> OLD.reason OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
      RAISE EXCEPTION 'customer may only decide an existing substitution proposal';
    END IF;
    IF OLD.status <> 'pending_customer' OR NEW.status NOT IN ('approved','rejected','expired') THEN
      RAISE EXCEPTION 'invalid customer substitution transition';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'substitution update is not permitted';
END $$;
CREATE TRIGGER order_substitution_customer_guard BEFORE UPDATE ON order_substitution_requests FOR EACH ROW EXECUTE FUNCTION guard_customer_substitution_decision();

ALTER TABLE order_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_substitution_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfilment_sla_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_timeline_customer_read ON order_timeline_events FOR SELECT USING (
  customer_visible AND EXISTS (SELECT 1 FROM customer_orders o WHERE o.id=order_id AND o.user_id=nullif(current_setting('app.actor_user_id', true), '')::uuid)
);
CREATE POLICY order_timeline_vendor_read ON order_timeline_events FOR SELECT USING (
  vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
);
CREATE POLICY order_timeline_platform_all ON order_timeline_events FOR ALL USING (current_setting('app.platform_access', true)='true') WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY order_cancellations_customer_read ON order_cancellations FOR SELECT USING (customer_id=nullif(current_setting('app.actor_user_id', true), '')::uuid);
CREATE POLICY order_cancellations_customer_insert ON order_cancellations FOR INSERT WITH CHECK (
  customer_id=nullif(current_setting('app.actor_user_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM customer_orders o WHERE o.id=order_id AND o.user_id=customer_id)
);
CREATE POLICY order_cancellations_platform_all ON order_cancellations FOR ALL USING (current_setting('app.platform_access', true)='true') WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY order_substitution_customer_read ON order_substitution_requests FOR SELECT USING (customer_id=nullif(current_setting('app.actor_user_id', true), '')::uuid);
CREATE POLICY order_substitution_customer_update ON order_substitution_requests FOR UPDATE USING (customer_id=nullif(current_setting('app.actor_user_id', true), '')::uuid) WITH CHECK (customer_id=nullif(current_setting('app.actor_user_id', true), '')::uuid);
CREATE POLICY order_substitution_vendor_read ON order_substitution_requests FOR SELECT USING (vendor_id=nullif(current_setting('app.vendor_id', true), '')::uuid);
CREATE POLICY order_substitution_vendor_insert ON order_substitution_requests FOR INSERT WITH CHECK (
  vendor_id=nullif(current_setting('app.vendor_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM order_lines ol WHERE ol.id=order_line_id AND ol.vendor_id=vendor_id)
);
CREATE POLICY order_substitution_platform_all ON order_substitution_requests FOR ALL USING (current_setting('app.platform_access', true)='true') WITH CHECK (current_setting('app.platform_access', true)='true');

CREATE POLICY fulfilment_sla_vendor_read ON fulfilment_sla_cases FOR SELECT USING (vendor_id=nullif(current_setting('app.vendor_id', true), '')::uuid);
CREATE POLICY fulfilment_sla_platform_all ON fulfilment_sla_cases FOR ALL USING (current_setting('app.platform_access', true)='true') WITH CHECK (current_setting('app.platform_access', true)='true');

COMMIT;
