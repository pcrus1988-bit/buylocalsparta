-- Fix checkout pickup fulfilment financial recalculation.
-- Pickup has no delivery rule, so avoid dereferencing an unassigned PL/pgSQL record.
BEGIN;

CREATE OR REPLACE FUNCTION bls_private.recalculate_fulfilment_financials(p_fulfilment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $function$
DECLARE
  v_fo record;
  v_merchandise bigint;
  v_postcode text;
  v_rule public.delivery_rules%ROWTYPE;
  v_charge bigint := 0;
  v_waived bigint := 0;
BEGIN
  SELECT fo.*, o.market_id AS order_market_id, o.shipping_address_snapshot, o.billing_address_snapshot
    INTO v_fo
    FROM public.fulfilment_orders fo
    JOIN public.customer_orders o ON o.id=fo.order_id
   WHERE fo.id=p_fulfilment_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(ol.retail_unit_price_minor*ol.quantity),0)
    INTO v_merchandise
    FROM public.fulfilment_order_lines fol
    JOIN public.order_lines ol ON ol.id=fol.order_line_id
   WHERE fol.fulfilment_order_id=p_fulfilment_id;

  v_postcode := COALESCE(
    v_fo.shipping_address_snapshot->>'postcode',
    v_fo.billing_address_snapshot->>'postcode',
    '23100'
  );

  IF v_fo.mode::text <> 'pickup' THEN
    SELECT dr.* INTO v_rule
      FROM public.delivery_rules dr
     WHERE dr.market_id=v_fo.order_market_id
       AND dr.mode=v_fo.mode
       AND dr.active=true
       AND dr.starts_at<=now()
       AND (dr.ends_at IS NULL OR dr.ends_at>now())
       AND (dr.vendor_id IS NULL OR dr.vendor_id=v_fo.vendor_id)
       AND (
         cardinality(dr.postcode_prefixes)=0
         OR EXISTS (
           SELECT 1
           FROM unnest(dr.postcode_prefixes) p
           WHERE v_postcode LIKE p||'%'
         )
       )
     ORDER BY (
       CASE WHEN dr.vendor_id IS NOT NULL THEN 4 ELSE 0 END
       + CASE WHEN cardinality(dr.postcode_prefixes)>0 THEN 2 ELSE 0 END
     ) DESC,
     dr.priority DESC,
     dr.version DESC,
     dr.public_id
     LIMIT 1;

    IF FOUND THEN
      IF v_rule.minimum_subtotal_minor IS NOT NULL
         AND v_merchandise < v_rule.minimum_subtotal_minor THEN
        RAISE EXCEPTION 'Delivery subtotal is below the vendor delivery minimum';
      END IF;

      IF v_rule.free_above_subtotal_minor IS NOT NULL
         AND v_merchandise >= v_rule.free_above_subtotal_minor THEN
        v_charge := 0;
        v_waived := v_rule.base_charge_minor;
      ELSE
        v_charge := v_rule.base_charge_minor;
        v_waived := 0;
      END IF;
    END IF;
  END IF;

  UPDATE public.fulfilment_orders
     SET merchandise_subtotal_minor=v_merchandise,
         delivery_charge_minor=v_charge,
         waived_delivery_minor=v_waived,
         delivery_rule_id=CASE
           WHEN v_fo.mode::text='pickup' OR v_rule.id IS NULL THEN NULL
           ELSE v_rule.id
         END,
         delivery_rule_version=CASE
           WHEN v_fo.mode::text='pickup' OR v_rule.id IS NULL THEN NULL
           ELSE v_rule.version
         END,
         updated_at=now()
   WHERE id=p_fulfilment_id;

  PERFORM bls_private.recalculate_order_financials(v_fo.order_id);
END
$function$;

COMMIT;
