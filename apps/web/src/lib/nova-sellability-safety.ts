import { getProductionPostgresRuntime } from "./postgres-runtime";

const SUPPLIER_CODE = "nova_brandsgateway";

export type NovaSellabilitySafetySweepResult = Readonly<{
  deactivatedUnavailable: number;
  deactivatedReappeared: number;
}>;

/**
 * Fail-closed local sellability reconciliation for Nova.
 *
 * Supplier catalogue sync may refresh cached evidence, but it must never make an
 * inactive offer sellable. Conversely, a currently-live offer whose latest Nova
 * evidence says unavailable must be deactivated. Reappeared deleted-feed rows
 * also remain inactive until a later explicit vendor promotion updates the offer.
 *
 * This sweep changes only dropship supplier offer activation. It does not change
 * vendor publication intent, customer price, local inventory, checkout authority,
 * supplier order forwarding, or any supplier-side state.
 */
export async function runNovaSellabilitySafetySweep(): Promise<NovaSellabilitySafetySweepResult> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    WITH unsafe AS (
      SELECT dso.id,
             CASE
               WHEN dso.cached_available=false THEN 'supplier_unavailable'
               ELSE 'supplier_reappeared_requires_explicit_promotion'
             END reason
        FROM public.dropship_supplier_offers dso
        JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
       WHERE ds.code=$1
         AND ds.active=true
         AND ds.api_authoritative_availability=true
         AND dso.active=true
         AND (
           dso.cached_available=false
           OR (
             NULLIF(dso.availability_payload->>'reappearedAt','') IS NOT NULL
             AND vo.updated_at <= (dso.availability_payload->>'reappearedAt')::timestamptz
           )
         )
    ), updated AS (
      UPDATE public.dropship_supplier_offers dso
         SET active=false,
             availability_payload=COALESCE(dso.availability_payload,'{}'::jsonb)
               || jsonb_build_object(
                    'sellabilitySafetyDeactivatedAt',now(),
                    'sellabilitySafetyReason',unsafe.reason
                  ),
             updated_at=now()
        FROM unsafe
       WHERE dso.id=unsafe.id
      RETURNING unsafe.reason
    )
    SELECT count(*) FILTER (WHERE reason='supplier_unavailable')::int deactivated_unavailable,
           count(*) FILTER (WHERE reason='supplier_reappeared_requires_explicit_promotion')::int deactivated_reappeared
      FROM updated
  `, [SUPPLIER_CODE]);

  const row = result.rows[0] ?? {};
  return {
    deactivatedUnavailable: safeCount(row.deactivated_unavailable),
    deactivatedReappeared: safeCount(row.deactivated_reappeared)
  };
}

function safeCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
