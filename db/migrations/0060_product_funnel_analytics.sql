CREATE TABLE IF NOT EXISTS public.product_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('page_view','engagement','add_to_cart','checkout_started','purchase','refund')),
  visitor_hash text,
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE RESTRICT,
  vendor_offer_id uuid REFERENCES public.vendor_offers(id) ON DELETE SET NULL,
  fairness_event_id uuid REFERENCES public.fairness_assignment_events(id) ON DELETE SET NULL,
  view_id uuid,
  engaged_seconds integer NOT NULL DEFAULT 0 CHECK (engaged_seconds BETWEEN 0 AND 60),
  order_id uuid REFERENCES public.customer_orders(id) ON DELETE SET NULL,
  order_line_id uuid REFERENCES public.order_lines(id) ON DELETE SET NULL,
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  amount_minor bigint CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency char(3),
  attribution_source text NOT NULL DEFAULT 'fairness' CHECK (attribution_source IN ('fairness','checkout','order','backfill')),
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_analytics_vendor_time_idx
  ON public.product_analytics_events(vendor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_analytics_vendor_product_time_idx
  ON public.product_analytics_events(vendor_id, canonical_variant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_analytics_fairness_idx
  ON public.product_analytics_events(fairness_event_id) WHERE fairness_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_analytics_type_time_idx
  ON public.product_analytics_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS product_analytics_view_idx
  ON public.product_analytics_events(view_id) WHERE view_id IS NOT NULL;

ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_analytics_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_checkout_started_analytics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_hash text;
  v_currency char(3);
BEGIN
  SELECT visitor_hash, currency INTO v_visitor_hash, v_currency
  FROM public.customer_orders
  WHERE id = new.order_id;

  INSERT INTO public.product_analytics_events (
    event_type, visitor_hash, canonical_variant_id, vendor_id, vendor_offer_id,
    order_id, order_line_id, quantity, amount_minor, currency,
    attribution_source, idempotency_key, metadata
  ) VALUES (
    'checkout_started', v_visitor_hash, new.canonical_variant_id, new.vendor_id, new.assigned_offer_id,
    new.order_id, new.id, new.quantity, new.retail_unit_price_minor * new.quantity, v_currency,
    'checkout', 'checkout:' || new.id::text, jsonb_build_object('orderLineStatus', new.status)
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_checkout_started_analytics() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_lines_capture_checkout_started_analytics ON public.order_lines;
CREATE TRIGGER order_lines_capture_checkout_started_analytics
AFTER INSERT ON public.order_lines
FOR EACH ROW EXECUTE FUNCTION public.capture_checkout_started_analytics();

CREATE OR REPLACE FUNCTION public.capture_order_purchase_analytics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status::text IN ('confirmed','partially_fulfilled','fulfilled','completed')
     AND (tg_op = 'INSERT' OR old.status::text NOT IN ('confirmed','partially_fulfilled','fulfilled','completed')) THEN
    INSERT INTO public.product_analytics_events (
      occurred_at, event_type, visitor_hash, canonical_variant_id, vendor_id, vendor_offer_id,
      order_id, order_line_id, quantity, amount_minor, currency,
      attribution_source, idempotency_key, metadata
    )
    SELECT
      coalesce(new.confirmed_at, now()), 'purchase', new.visitor_hash,
      ol.canonical_variant_id, ol.vendor_id, ol.assigned_offer_id,
      new.id, ol.id, ol.quantity,
      greatest(0::bigint, (ol.retail_unit_price_minor * ol.quantity) - ol.discount_allocation_minor),
      new.currency, 'order', 'purchase:' || ol.id::text,
      jsonb_build_object('orderStatus', new.status::text, 'orderNumber', new.order_number)
    FROM public.order_lines ol
    WHERE ol.order_id = new.id
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_order_purchase_analytics() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_orders_capture_purchase_analytics ON public.customer_orders;
CREATE TRIGGER customer_orders_capture_purchase_analytics
AFTER INSERT OR UPDATE OF status ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.capture_order_purchase_analytics();

INSERT INTO public.product_analytics_events (
  occurred_at, event_type, visitor_hash, canonical_variant_id, vendor_id, vendor_offer_id,
  order_id, order_line_id, quantity, amount_minor, currency,
  attribution_source, idempotency_key, metadata
)
SELECT
  ol.created_at, 'checkout_started', co.visitor_hash, ol.canonical_variant_id, ol.vendor_id, ol.assigned_offer_id,
  co.id, ol.id, ol.quantity, ol.retail_unit_price_minor * ol.quantity, co.currency,
  'backfill', 'checkout:' || ol.id::text, jsonb_build_object('historicalBackfill', true)
FROM public.order_lines ol
JOIN public.customer_orders co ON co.id = ol.order_id
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.product_analytics_events (
  occurred_at, event_type, visitor_hash, canonical_variant_id, vendor_id, vendor_offer_id,
  order_id, order_line_id, quantity, amount_minor, currency,
  attribution_source, idempotency_key, metadata
)
SELECT
  coalesce(co.confirmed_at, co.updated_at, co.created_at), 'purchase', co.visitor_hash,
  ol.canonical_variant_id, ol.vendor_id, ol.assigned_offer_id,
  co.id, ol.id, ol.quantity,
  greatest(0::bigint, (ol.retail_unit_price_minor * ol.quantity) - ol.discount_allocation_minor),
  co.currency, 'backfill', 'purchase:' || ol.id::text,
  jsonb_build_object('historicalBackfill', true, 'orderStatus', co.status::text, 'orderNumber', co.order_number)
FROM public.order_lines ol
JOIN public.customer_orders co ON co.id = ol.order_id
WHERE co.status::text IN ('confirmed','partially_fulfilled','fulfilled','completed')
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE OR REPLACE VIEW public.vendor_product_funnel_30d AS
WITH fairness AS (
  SELECT selected_vendor_id AS vendor_id, canonical_variant_id, count(*)::bigint AS impressions
  FROM public.fairness_assignment_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY selected_vendor_id, canonical_variant_id
), event_rollup AS (
  SELECT
    vendor_id,
    canonical_variant_id,
    count(*) FILTER (WHERE event_type='page_view')::bigint AS page_views,
    count(DISTINCT visitor_hash) FILTER (WHERE event_type='page_view' AND visitor_hash IS NOT NULL)::bigint AS unique_viewers,
    coalesce(sum(engaged_seconds) FILTER (WHERE event_type='engagement'),0)::bigint AS engaged_seconds,
    count(*) FILTER (WHERE event_type='add_to_cart')::bigint AS add_to_carts,
    count(*) FILTER (WHERE event_type='checkout_started')::bigint AS checkout_starts,
    count(*) FILTER (WHERE event_type='purchase')::bigint AS purchases,
    coalesce(sum(quantity) FILTER (WHERE event_type='purchase'),0)::bigint AS units_sold,
    coalesce(sum(amount_minor) FILTER (WHERE event_type='purchase'),0)::bigint AS revenue_minor
  FROM public.product_analytics_events
  WHERE occurred_at >= now() - interval '30 days'
  GROUP BY vendor_id, canonical_variant_id
), keys AS (
  SELECT vendor_id, canonical_variant_id FROM fairness
  UNION
  SELECT vendor_id, canonical_variant_id FROM event_rollup
)
SELECT
  k.vendor_id,
  vb.public_id AS vendor_public_id,
  k.canonical_variant_id,
  cv.public_id AS canonical_variant_public_id,
  coalesce(pt_el.title, pt_en.title, cv.model, cv.public_id) AS product_title,
  coalesce(f.impressions,0)::bigint AS impressions,
  coalesce(e.page_views,0)::bigint AS page_views,
  coalesce(e.unique_viewers,0)::bigint AS unique_viewers,
  coalesce(e.engaged_seconds,0)::bigint AS engaged_seconds,
  coalesce(e.add_to_carts,0)::bigint AS add_to_carts,
  coalesce(e.checkout_starts,0)::bigint AS checkout_starts,
  coalesce(e.purchases,0)::bigint AS purchases,
  coalesce(e.units_sold,0)::bigint AS units_sold,
  coalesce(e.revenue_minor,0)::bigint AS revenue_minor
FROM keys k
JOIN public.vendor_businesses vb ON vb.id=k.vendor_id
JOIN public.canonical_variants cv ON cv.id=k.canonical_variant_id
LEFT JOIN public.product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
LEFT JOIN public.product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
LEFT JOIN fairness f ON f.vendor_id=k.vendor_id AND f.canonical_variant_id=k.canonical_variant_id
LEFT JOIN event_rollup e ON e.vendor_id=k.vendor_id AND e.canonical_variant_id=k.canonical_variant_id;

REVOKE ALL ON TABLE public.vendor_product_funnel_30d FROM anon, authenticated;
