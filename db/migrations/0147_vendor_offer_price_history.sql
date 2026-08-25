-- Vendor-owned retail price changes with immutable per-canonical/vendor history and admin alerts.
BEGIN;

CREATE TABLE public.vendor_offer_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vph_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  offer_id uuid NOT NULL REFERENCES public.vendor_offers(id),
  currency char(3) NOT NULL DEFAULT 'EUR',
  previous_price_minor bigint CHECK (previous_price_minor IS NULL OR previous_price_minor >= 0),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  actor_user_id uuid REFERENCES public.users(id),
  source text NOT NULL CHECK (source IN ('migration_baseline','offer_created','vendor_dashboard','system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_offer_price_history_canonical_vendor_changed_idx
  ON public.vendor_offer_price_history(canonical_variant_id, vendor_id, changed_at DESC, id DESC);
CREATE INDEX vendor_offer_price_history_offer_changed_idx
  ON public.vendor_offer_price_history(offer_id, changed_at DESC, id DESC);
CREATE INDEX vendor_offer_price_history_market_changed_idx
  ON public.vendor_offer_price_history(market_id, changed_at DESC, id DESC);

COMMENT ON TABLE public.vendor_offer_price_history IS
  'Immutable vendor-specific retail price development for each canonical variant.';

ALTER TABLE public.vendor_offer_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_offer_price_history_read_scope
ON public.vendor_offer_price_history
FOR SELECT
USING (
  (SELECT bls_private.is_platform_runtime())
  OR vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
);

GRANT SELECT ON TABLE public.vendor_offer_price_history TO bls_app_runtime;
GRANT SELECT ON TABLE public.vendor_offer_price_history TO bls_platform_runtime;
REVOKE ALL ON TABLE public.vendor_offer_price_history FROM anon, authenticated;

CREATE TRIGGER vendor_offer_price_history_append_only
BEFORE UPDATE OR DELETE ON public.vendor_offer_price_history
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

INSERT INTO public.vendor_offer_price_history (
  id, public_id, market_id, canonical_variant_id, vendor_id, offer_id, currency,
  previous_price_minor, price_minor, actor_user_id, source, metadata, changed_at
)
SELECT
  gen_random_uuid(),
  'vph_' || replace(gen_random_uuid()::text, '-', ''),
  vo.market_id,
  vo.canonical_variant_id,
  vo.vendor_id,
  vo.id,
  vo.currency,
  NULL,
  vo.customer_price_minor,
  NULL,
  'migration_baseline',
  jsonb_build_object('offerPublicId', vo.public_id),
  COALESCE(vo.customer_price_updated_at, vo.updated_at, vo.created_at, now())
FROM public.vendor_offers vo;

CREATE OR REPLACE FUNCTION bls_private.record_vendor_offer_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $$
DECLARE
  v_history_uuid uuid := gen_random_uuid();
  v_history_public_id text := 'vph_' || replace(gen_random_uuid()::text, '-', '');
  v_actor_uuid uuid := NULLIF(current_setting('app.actor_user_id', true), '')::uuid;
  v_vendor_scope uuid := NULLIF(current_setting('app.vendor_id', true), '')::uuid;
  v_vendor_public_id text;
  v_vendor_name text;
  v_canonical_public_id text;
  v_product_title text;
  v_previous_minor bigint;
  v_source text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_previous_minor := NULL;
    v_source := 'offer_created';
  ELSE
    IF NEW.customer_price_minor IS NOT DISTINCT FROM OLD.customer_price_minor THEN
      RETURN NEW;
    END IF;
    v_previous_minor := OLD.customer_price_minor;
    v_source := CASE
      WHEN v_vendor_scope IS NOT NULL AND v_vendor_scope = NEW.vendor_id THEN 'vendor_dashboard'
      ELSE 'system'
    END;
  END IF;

  INSERT INTO public.vendor_offer_price_history (
    id, public_id, market_id, canonical_variant_id, vendor_id, offer_id, currency,
    previous_price_minor, price_minor, actor_user_id, source, metadata, changed_at
  ) VALUES (
    v_history_uuid,
    v_history_public_id,
    NEW.market_id,
    NEW.canonical_variant_id,
    NEW.vendor_id,
    NEW.id,
    NEW.currency,
    v_previous_minor,
    NEW.customer_price_minor,
    v_actor_uuid,
    v_source,
    jsonb_build_object('offerPublicId', NEW.public_id),
    COALESCE(NEW.customer_price_updated_at, NEW.updated_at, now())
  );

  IF TG_OP = 'UPDATE' AND v_vendor_scope IS NOT NULL AND v_vendor_scope = NEW.vendor_id THEN
    SELECT vb.public_id, vb.trading_name
      INTO v_vendor_public_id, v_vendor_name
    FROM public.vendor_businesses vb
    WHERE vb.id = NEW.vendor_id;

    SELECT cv.public_id, COALESCE(el.title, en.title, cv.model, cv.slug)
      INTO v_canonical_public_id, v_product_title
    FROM public.canonical_variants cv
    LEFT JOIN public.product_translations el
      ON el.canonical_variant_id = cv.id AND el.locale = 'el'
    LEFT JOIN public.product_translations en
      ON en.canonical_variant_id = cv.id AND en.locale = 'en'
    WHERE cv.id = NEW.canonical_variant_id;

    INSERT INTO public.notifications (
      id, public_id, user_id, vendor_id, channel, purpose, event_type,
      template_version, locale, title, body, payload, status, dedupe_key, sent_at, created_at
    ) VALUES (
      gen_random_uuid(),
      'notif_' || replace(gen_random_uuid()::text, '-', ''),
      NULL,
      NULL,
      'in_app',
      'transactional',
      'admin.vendor_price_changed',
      'vendor-price-v1',
      'el',
      'Αλλαγή τιμής από vendor',
      format(
        '%s άλλαξε την τιμή του «%s» από %s € σε %s €.',
        COALESCE(v_vendor_name, v_vendor_public_id, NEW.vendor_id::text),
        COALESCE(v_product_title, v_canonical_public_id, NEW.canonical_variant_id::text),
        to_char(OLD.customer_price_minor::numeric / 100, 'FM999999990.00'),
        to_char(NEW.customer_price_minor::numeric / 100, 'FM999999990.00')
      ),
      jsonb_build_object(
        'vendorId', v_vendor_public_id,
        'vendorUuid', NEW.vendor_id::text,
        'offerId', NEW.public_id,
        'canonicalVariantId', v_canonical_public_id,
        'productTitle', v_product_title,
        'previousPriceMinor', OLD.customer_price_minor,
        'priceMinor', NEW.customer_price_minor,
        'currency', NEW.currency,
        'historyId', v_history_public_id
      ),
      'sent',
      'vendor-price:' || v_history_uuid::text,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION bls_private.record_vendor_offer_price_change() FROM PUBLIC;

CREATE TRIGGER vendor_offers_price_history_insert
AFTER INSERT ON public.vendor_offers
FOR EACH ROW EXECUTE FUNCTION bls_private.record_vendor_offer_price_change();

CREATE TRIGGER vendor_offers_price_history_update
AFTER UPDATE OF customer_price_minor ON public.vendor_offers
FOR EACH ROW
WHEN (OLD.customer_price_minor IS DISTINCT FROM NEW.customer_price_minor)
EXECUTE FUNCTION bls_private.record_vendor_offer_price_change();

COMMIT;
