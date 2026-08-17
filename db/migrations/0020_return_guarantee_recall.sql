-- Consumer return / guarantee remedies, custody evidence and affected-customer recall operations.
-- Policy windows are application-configurable; this migration persists evidence and state, not legal conclusions.
BEGIN;

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS fulfilled_quantity integer NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
  ADD COLUMN IF NOT EXISTS refunded_quantity integer NOT NULL DEFAULT 0 CHECK (refunded_quantity >= 0),
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS adjustment_refunded_minor bigint NOT NULL DEFAULT 0 CHECK (adjustment_refunded_minor >= 0);
ALTER TABLE order_lines DROP CONSTRAINT IF EXISTS order_lines_fulfilled_refunded_bounds;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_fulfilled_refunded_bounds CHECK (refunded_quantity <= fulfilled_quantity AND fulfilled_quantity <= quantity);

ALTER TABLE fulfilment_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE procurements
  ADD COLUMN IF NOT EXISTS post_settlement_return_receivable_minor bigint NOT NULL DEFAULT 0 CHECK (post_settlement_return_receivable_minor >= 0);

ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_reason_type_check;
ALTER TABLE returns ADD CONSTRAINT returns_reason_type_check CHECK (
  reason_type IN ('withdrawal','defect','nonconformity','transit_damage','wrong_item','missing_part','safety_recall','other')
);
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS recall_notice_id uuid REFERENCES product_notices(id),
  ADD COLUMN IF NOT EXISTS eligibility_state text NOT NULL DEFAULT 'manual_review',
  ADD COLUMN IF NOT EXISTS eligibility_basis text NOT NULL DEFAULT 'manual_review',
  ADD COLUMN IF NOT EXISTS eligibility_reason text,
  ADD COLUMN IF NOT EXISTS eligibility_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rma_code text,
  ADD COLUMN IF NOT EXISTS return_by_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_cost_payer text,
  ADD COLUMN IF NOT EXISTS destination_instructions text,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS inspection_findings text,
  ADD COLUMN IF NOT EXISTS approved_remedy text,
  ADD COLUMN IF NOT EXISTS price_reduction_minor bigint,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_source_check;
ALTER TABLE returns ADD CONSTRAINT returns_source_check CHECK (source IN ('customer','safety_recall'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_eligibility_state_check;
ALTER TABLE returns ADD CONSTRAINT returns_eligibility_state_check CHECK (eligibility_state IN ('eligible','manual_review','ineligible'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_eligibility_basis_check;
ALTER TABLE returns ADD CONSTRAINT returns_eligibility_basis_check CHECK (eligibility_basis IN ('withdrawal_window','consumer_guarantee','delivery_error','safety_recall','manual_review'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_return_cost_payer_check;
ALTER TABLE returns ADD CONSTRAINT returns_return_cost_payer_check CHECK (return_cost_payer IS NULL OR return_cost_payer IN ('customer','platform','vendor'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_destination_type_check;
ALTER TABLE returns ADD CONSTRAINT returns_destination_type_check CHECK (destination_type IS NULL OR destination_type IN ('vendor','platform_inspection','repairer'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_requested_remedy_check;
ALTER TABLE returns ADD CONSTRAINT returns_requested_remedy_check CHECK (requested_remedy IS NULL OR requested_remedy IN ('refund','replacement','repair','price_reduction'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_approved_remedy_check;
ALTER TABLE returns ADD CONSTRAINT returns_approved_remedy_check CHECK (approved_remedy IS NULL OR approved_remedy IN ('refund','replacement','repair','price_reduction'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_price_reduction_check;
ALTER TABLE returns ADD CONSTRAINT returns_price_reduction_check CHECK (price_reduction_minor IS NULL OR price_reduction_minor > 0);
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_recall_reference_check;
ALTER TABLE returns ADD CONSTRAINT returns_recall_reference_check CHECK (
  (source='safety_recall' AND recall_notice_id IS NOT NULL AND reason_type='safety_recall')
  OR source='customer'
);
CREATE UNIQUE INDEX IF NOT EXISTS returns_rma_uidx ON returns(rma_code) WHERE rma_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS returns_recall_notice_idx ON returns(recall_notice_id, status) WHERE recall_notice_id IS NOT NULL;

ALTER TABLE return_lines
  ADD COLUMN IF NOT EXISTS requested_remedy text,
  ADD COLUMN IF NOT EXISTS approved_remedy text,
  ADD COLUMN IF NOT EXISTS price_reduction_minor bigint;

CREATE TABLE IF NOT EXISTS return_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo','document','message','carrier_proof','product_serial','other')),
  reference text,
  note text,
  submitted_by uuid REFERENCES users(id),
  submitted_by_public_id text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (length(btrim(coalesce(reference,''))) > 0 OR length(btrim(coalesce(note,''))) > 0)
);
CREATE INDEX IF NOT EXISTS return_evidence_return_idx ON return_evidence(return_id, created_at);

CREATE TABLE IF NOT EXISTS return_custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  from_party text NOT NULL CHECK (from_party IN ('customer','carrier','vendor','platform','repairer')),
  to_party text NOT NULL CHECK (to_party IN ('customer','carrier','vendor','platform','repairer')),
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  reference text,
  note text,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS return_custody_return_idx ON return_custody_events(return_id, occurred_at);

CREATE TABLE IF NOT EXISTS return_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  return_id uuid NOT NULL UNIQUE REFERENCES returns(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  offer_id uuid NOT NULL REFERENCES vendor_offers(id),
  reservation_id uuid NOT NULL REFERENCES stock_reservations(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  fulfilment_mode fulfilment_mode NOT NULL,
  status text NOT NULL CHECK (status IN ('awaiting_vendor','accepted','ready_for_handover','shipped','delivered','rejected','cancelled')),
  reference text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS return_replacements_vendor_idx ON return_replacements(vendor_id, status, created_at);

CREATE TABLE IF NOT EXISTS return_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  return_id uuid NOT NULL UNIQUE REFERENCES returns(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  status text NOT NULL CHECK (status IN ('approved','in_repair','awaiting_part','ready_for_customer','returned','failed')),
  due_at timestamptz NOT NULL,
  repairer_reference text,
  findings text,
  started_at timestamptz,
  ready_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS return_repairs_vendor_idx ON return_repairs(vendor_id, status, due_at);

CREATE TABLE IF NOT EXISTS recall_affected_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  notice_id uuid NOT NULL REFERENCES product_notices(id) ON DELETE CASCADE,
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  order_line_id uuid NOT NULL REFERENCES order_lines(id),
  customer_user_id uuid REFERENCES users(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  affected_quantity integer NOT NULL CHECK (affected_quantity > 0),
  status text NOT NULL CHECK (status IN ('identified','notified','acknowledged','remedy_requested','resolved')),
  selected_remedy text CHECK (selected_remedy IS NULL OR selected_remedy IN ('refund','replacement','repair','price_reduction')),
  return_id uuid REFERENCES returns(id),
  identified_at timestamptz NOT NULL,
  notified_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notice_id, order_line_id)
);
CREATE INDEX IF NOT EXISTS recall_affected_customer_idx ON recall_affected_orders(customer_user_id, status, identified_at DESC);
CREATE INDEX IF NOT EXISTS recall_affected_notice_idx ON recall_affected_orders(notice_id, status, identified_at);
CREATE INDEX IF NOT EXISTS recall_affected_vendor_idx ON recall_affected_orders(vendor_id, status, identified_at);

CREATE OR REPLACE FUNCTION prevent_return_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'return evidence/custody history is append-only';
END $$;
DROP TRIGGER IF EXISTS return_evidence_no_mutation ON return_evidence;
CREATE TRIGGER return_evidence_no_mutation BEFORE UPDATE OR DELETE ON return_evidence FOR EACH ROW EXECUTE FUNCTION prevent_return_history_mutation();
DROP TRIGGER IF EXISTS return_custody_no_mutation ON return_custody_events;
CREATE TRIGGER return_custody_no_mutation BEFORE UPDATE OR DELETE ON return_custody_events FOR EACH ROW EXECUTE FUNCTION prevent_return_history_mutation();

ALTER TABLE return_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_custody_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_affected_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY return_evidence_scope_read ON return_evidence FOR SELECT USING (
  (SELECT bls_private.is_platform_runtime())
  OR EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid)
  OR EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid)
);
CREATE POLICY return_evidence_customer_insert ON return_evidence FOR INSERT WITH CHECK (
  (SELECT bls_private.is_platform_runtime())
  OR (
    submitted_by=nullif(current_setting('app.actor_user_id', true),'')::uuid
    AND EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid)
  )
);
CREATE POLICY return_custody_scope_read ON return_custody_events FOR SELECT USING (
  (SELECT bls_private.is_platform_runtime())
  OR EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid)
  OR EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid)
);
CREATE POLICY return_custody_scoped_insert ON return_custody_events FOR INSERT WITH CHECK (
  (SELECT bls_private.is_platform_runtime())
  OR (
    actor_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid
    AND EXISTS (
      SELECT 1 FROM returns r WHERE r.id=return_id
        AND (r.customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid OR r.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid)
    )
  )
);

CREATE POLICY return_replacements_platform ON return_replacements FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY return_replacements_customer_read ON return_replacements FOR SELECT USING (
  EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid)
);
CREATE POLICY return_replacements_vendor_read ON return_replacements FOR SELECT USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);
CREATE POLICY return_replacements_vendor_update ON return_replacements FOR UPDATE USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid) WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);

CREATE POLICY return_repairs_platform ON return_repairs FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY return_repairs_customer_read ON return_repairs FOR SELECT USING (
  EXISTS (SELECT 1 FROM returns r WHERE r.id=return_id AND r.customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid)
);
CREATE POLICY return_repairs_vendor_read ON return_repairs FOR SELECT USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);
CREATE POLICY return_repairs_vendor_update ON return_repairs FOR UPDATE USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid) WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);

CREATE POLICY recall_affected_platform ON recall_affected_orders FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY recall_affected_customer_read ON recall_affected_orders FOR SELECT USING (customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid);
CREATE OR REPLACE FUNCTION guard_recall_customer_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (SELECT bls_private.is_platform_runtime()) THEN
    IF OLD.notice_id IS DISTINCT FROM NEW.notice_id
       OR OLD.canonical_variant_id IS DISTINCT FROM NEW.canonical_variant_id
       OR OLD.order_id IS DISTINCT FROM NEW.order_id
       OR OLD.order_line_id IS DISTINCT FROM NEW.order_line_id
       OR OLD.customer_user_id IS DISTINCT FROM NEW.customer_user_id
       OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id
       OR OLD.affected_quantity IS DISTINCT FROM NEW.affected_quantity
       OR OLD.identified_at IS DISTINCT FROM NEW.identified_at
       OR OLD.notified_at IS DISTINCT FROM NEW.notified_at
       OR OLD.resolved_at IS DISTINCT FROM NEW.resolved_at
       OR NEW.status NOT IN ('acknowledged','remedy_requested') THEN
      RAISE EXCEPTION 'Customer may only acknowledge a recall or request a remedy';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recall_affected_customer_update_guard ON recall_affected_orders;
CREATE TRIGGER recall_affected_customer_update_guard BEFORE UPDATE ON recall_affected_orders
  FOR EACH ROW EXECUTE FUNCTION guard_recall_customer_update();
CREATE POLICY recall_affected_customer_update ON recall_affected_orders FOR UPDATE
  USING (customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid)
  WITH CHECK (customer_user_id=nullif(current_setting('app.actor_user_id', true),'')::uuid);
CREATE POLICY recall_affected_vendor_read ON recall_affected_orders FOR SELECT USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);

COMMIT;
