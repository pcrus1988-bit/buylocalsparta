CREATE OR REPLACE FUNCTION bls_private.guard_symphonya_order_forwarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.assigned_offer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.vendor_offers vo
      JOIN public.dropship_supplier_offers dso
        ON dso.vendor_offer_id=vo.id
      JOIN public.dropship_suppliers ds
        ON ds.id=dso.supplier_id
     WHERE vo.id=NEW.assigned_offer_id
       AND ds.code='symphonya'
       AND ds.order_forwarding_enabled IS NOT TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='symphonya_order_forwarding_disabled',
      DETAIL='Symphonya order lines are blocked until supplier order forwarding is explicitly enabled.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_lines_guard_symphonya_forwarding ON public.order_lines;
CREATE TRIGGER order_lines_guard_symphonya_forwarding
BEFORE INSERT OR UPDATE OF assigned_offer_id
ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_symphonya_order_forwarding();

COMMENT ON FUNCTION bls_private.guard_symphonya_order_forwarding()
IS 'Fail-closed checkout guard: blocks Symphonya order lines while dropship_suppliers.order_forwarding_enabled is not true.';\n