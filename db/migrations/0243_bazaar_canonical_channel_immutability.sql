-- 0243_bazaar_canonical_channel_immutability.sql
-- Canonical commerce channels are identity boundaries, not mutable state.
--
-- Once a canonical variant exists in the normal or BAZAAR channel, moving that
-- same canonical across channels would merge the identity/history of new stock
-- with second-life inventory. Future return/open-box/display-stock ingestion
-- must therefore create or reuse a canonical already inside the BAZAAR channel
-- instead of converting a normal canonical in place.

CREATE OR REPLACE FUNCTION bls_private.enforce_canonical_commerce_channel_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  old_channel text := COALESCE(OLD.commerce_channel, 'normal');
  new_channel text := COALESCE(NEW.commerce_channel, 'normal');
BEGIN
  IF old_channel IS DISTINCT FROM new_channel THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'canonical variant commerce channel is immutable',
      DETAIL = format(
        'canonical_variant=%s old_channel=%s new_channel=%s; create or reuse a canonical inside the target channel instead',
        OLD.id,
        old_channel,
        new_channel
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canonical_variants_commerce_channel_immutable
  ON public.canonical_variants;

CREATE TRIGGER canonical_variants_commerce_channel_immutable
BEFORE UPDATE OF commerce_channel
ON public.canonical_variants
FOR EACH ROW
EXECUTE FUNCTION bls_private.enforce_canonical_commerce_channel_immutability();

COMMENT ON FUNCTION bls_private.enforce_canonical_commerce_channel_immutability() IS
  'Treats normal and BAZAAR as permanent canonical identity boundaries. Prevents normal<->BAZAAR mutation so returns, open-box, display-stock, damaged-packaging and other second-life sources must materialize against a canonical created in the BAZAAR channel.';
