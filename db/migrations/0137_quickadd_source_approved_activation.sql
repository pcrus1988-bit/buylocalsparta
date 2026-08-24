-- Buy Local Sparta — allow Vendor Daily Quick Add to activate only source-approved inactive canonicals.
-- Imported supplier canonicals intentionally begin inactive. A merchant listing is allowed to make
-- such a canonical public only when the source-to-canonical link was already approved. Suppressed,
-- recalled, unresolved and vendor-created identity-only canonicals remain blocked.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.activate_source_approved_canonical(
  p_canonical_variant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_active boolean;
  v_suppressed boolean;
  v_recalled boolean;
BEGIN
  SELECT cv.active, cv.suppressed, cv.recalled
  INTO v_active, v_suppressed, v_recalled
  FROM public.canonical_variants cv
  WHERE cv.id = p_canonical_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical product was not found';
  END IF;

  IF v_suppressed OR v_recalled THEN
    RAISE EXCEPTION 'Canonical product is blocked from publication';
  END IF;

  IF v_active THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_product_links link
    WHERE link.canonical_variant_id = p_canonical_variant_id
      AND link.link_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Canonical product is still awaiting catalogue approval';
  END IF;

  UPDATE public.canonical_variants
  SET active = true,
      updated_at = now()
  WHERE id = p_canonical_variant_id
    AND active = false
    AND suppressed = false
    AND recalled = false;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.activate_source_approved_canonical(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.activate_source_approved_canonical(uuid)
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON FUNCTION bls_private.activate_source_approved_canonical(uuid) IS
  'Activates an inactive canonical only when it already has an approved supplier/source link. Used by governed Quick Add; suppressed, recalled and unapproved canonicals remain blocked.';

COMMIT;
