-- Verified interaction reviews, vendor responses, reports and immutable review history.
-- Reviews are trust evidence and must never become an input to identical-product fairness weights.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS order_line_id uuid REFERENCES order_lines(id),
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id),
  ADD COLUMN IF NOT EXISTS incentive_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS incentive_details text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_incentive_type_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_incentive_type_check CHECK (incentive_type IN ('none','discount','gift','other'));
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_incentive_details_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_incentive_details_check CHECK (
  (incentive_type='none' AND incentive_details IS NULL)
  OR (incentive_type<>'none' AND length(trim(coalesce(incentive_details,''))) > 0)
);
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_status_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_status_check CHECK (status IN ('published','hidden','rejected','pending'));
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_verified_source_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_verified_source_check CHECK (
  (interaction_type='verified_order' AND order_id IS NOT NULL AND order_line_id IS NOT NULL AND conversation_id IS NULL AND appointment_id IS NULL)
  OR
  (interaction_type='verified_advice' AND order_id IS NULL AND order_line_id IS NULL AND ((conversation_id IS NOT NULL)::int + (appointment_id IS NOT NULL)::int)=1)
);

-- Defense in depth: even a caller operating under customer RLS cannot forge the provenance
-- by supplying unrelated source IDs. Application validation remains the first line of defense.
CREATE OR REPLACE FUNCTION validate_verified_review_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.interaction_type='verified_order' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM customer_orders o
      JOIN order_lines ol ON ol.order_id=o.id
      JOIN fulfilment_order_lines fol ON fol.order_line_id=ol.id
      JOIN fulfilment_orders fo ON fo.id=fol.fulfilment_order_id AND fo.order_id=o.id
      WHERE o.id=NEW.order_id AND ol.id=NEW.order_line_id AND o.user_id=NEW.user_id
        AND ol.vendor_id=NEW.vendor_id AND ol.canonical_variant_id=NEW.canonical_variant_id
        AND fo.vendor_id=NEW.vendor_id AND fo.status='delivered'
    ) THEN
      RAISE EXCEPTION 'verified_order review source is not an owned fulfilled order line';
    END IF;
  ELSIF NEW.interaction_type='verified_advice' AND NEW.conversation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id=NEW.conversation_id AND c.customer_user_id=NEW.user_id
        AND c.vendor_id=NEW.vendor_id AND c.canonical_variant_id=NEW.canonical_variant_id
        AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.sender_type='customer')
        AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.sender_type='vendor')
    ) THEN
      RAISE EXCEPTION 'verified_advice conversation source is not a two-sided customer interaction';
    END IF;
  ELSIF NEW.interaction_type='verified_advice' AND NEW.appointment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id=NEW.appointment_id AND a.customer_user_id=NEW.user_id
        AND a.vendor_id=NEW.vendor_id AND a.canonical_variant_id=NEW.canonical_variant_id
        AND a.status='completed'
    ) THEN
      RAISE EXCEPTION 'verified_advice appointment source is not a completed customer appointment';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reviews_validate_verified_source ON reviews;
CREATE TRIGGER reviews_validate_verified_source
  BEFORE INSERT OR UPDATE OF user_id,vendor_id,canonical_variant_id,order_id,order_line_id,conversation_id,appointment_id,interaction_type
  ON reviews FOR EACH ROW EXECUTE FUNCTION validate_verified_review_source();

CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_order_line_unique
  ON reviews(user_id, order_line_id) WHERE interaction_type='verified_order' AND order_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_conversation_unique
  ON reviews(user_id, conversation_id) WHERE interaction_type='verified_advice' AND conversation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_verified_appointment_unique
  ON reviews(user_id, appointment_id) WHERE interaction_type='verified_advice' AND appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_public_product_idx ON reviews(canonical_variant_id, created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS reviews_vendor_idx ON reviews(vendor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  review_id uuid NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS vendor_review_responses_vendor_idx ON vendor_review_responses(vendor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  reported_by uuid REFERENCES users(id),
  reported_by_public_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('not_genuine','abusive','personal_data','conflict_of_interest','other')),
  details text NOT NULL CHECK (length(trim(details)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','rejected')),
  resolution text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_by_public_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS review_reports_one_open_per_vendor
  ON review_reports(review_id,vendor_id) WHERE status IN ('open','under_review');
CREATE INDEX IF NOT EXISTS review_reports_status_idx ON review_reports(status, created_at);

CREATE TABLE IF NOT EXISTS review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  actor_public_id text NOT NULL,
  action text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS review_events_review_idx ON review_events(review_id, created_at);

CREATE OR REPLACE FUNCTION prevent_review_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review_events are append-only';
END $$;
DROP TRIGGER IF EXISTS review_events_no_update ON review_events;
CREATE TRIGGER review_events_no_update BEFORE UPDATE OR DELETE ON review_events FOR EACH ROW EXECUTE FUNCTION prevent_review_event_mutation();

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_platform ON reviews;
CREATE POLICY reviews_platform ON reviews FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
DROP POLICY IF EXISTS reviews_customer_own ON reviews;
CREATE POLICY reviews_customer_own ON reviews FOR SELECT
  USING (user_id=nullif(current_setting('app.user_id', true),'')::uuid);
DROP POLICY IF EXISTS reviews_customer_insert ON reviews;
CREATE POLICY reviews_customer_insert ON reviews FOR INSERT
  WITH CHECK (user_id=nullif(current_setting('app.user_id', true),'')::uuid);
DROP POLICY IF EXISTS reviews_vendor_read ON reviews;
CREATE POLICY reviews_vendor_read ON reviews FOR SELECT
  USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);

DROP POLICY IF EXISTS review_responses_platform ON vendor_review_responses;
CREATE POLICY review_responses_platform ON vendor_review_responses FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
DROP POLICY IF EXISTS review_responses_vendor ON vendor_review_responses;
CREATE POLICY review_responses_vendor ON vendor_review_responses FOR ALL
  USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);

DROP POLICY IF EXISTS review_reports_platform ON review_reports;
CREATE POLICY review_reports_platform ON review_reports FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
DROP POLICY IF EXISTS review_reports_vendor ON review_reports;
CREATE POLICY review_reports_vendor ON review_reports FOR ALL
  USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);

DROP POLICY IF EXISTS review_events_platform ON review_events;
CREATE POLICY review_events_platform ON review_events FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
DROP POLICY IF EXISTS review_events_vendor_read ON review_events;
CREATE POLICY review_events_vendor_read ON review_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM reviews r WHERE r.id=review_id AND r.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid
  ));
