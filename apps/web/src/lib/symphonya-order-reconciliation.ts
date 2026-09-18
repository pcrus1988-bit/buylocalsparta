import { createSymphonyaRuntime } from "../../../../integrations/dropship-suppliers/src/symphonya-runtime.ts";
import type { DropshipProviderOrder } from "../../../../integrations/dropship-suppliers/src/index.ts";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_LIMIT = 50;
const STALE_AFTER_MS = 5 * 60 * 1000;

export type SymphonyaOrderReconciliationResult = Readonly<{
  enabled: boolean;
  checked: number;
  updated: number;
  failed: number;
}>;

type Target = Readonly<{
  fulfilment_id: string;
  external_order_id: string;
}>;

export async function runSymphonyaOrderReconciliationSweep(
  now = Date.now(),
  limit = DEFAULT_LIMIT
): Promise<SymphonyaOrderReconciliationResult> {
  if (!productionDatabaseConfigured()) return { enabled: false, checked: 0, updated: 0, failed: 0 };
  const symphonya = createSymphonyaRuntime();
  if (!symphonya) return { enabled: false, checked: 0, updated: 0, failed: 0 };

  const runtime = getProductionPostgresRuntime();
  const staleBefore = new Date(now - STALE_AFTER_MS);
  const targets = await runtime.nativePool.query<Target>(`
    SELECT df.public_id AS fulfilment_id,df.external_order_id
      FROM public.dropship_fulfilments df
      JOIN public.dropship_suppliers ds ON ds.id=df.supplier_id
     WHERE ds.code='symphonya'
       AND ds.provider_kind='symphonya'
       AND ds.active=true
       AND df.external_order_id IS NOT NULL
       AND df.status NOT IN ('delivered','cancelled','failed','refunded')
       AND (df.last_synced_at IS NULL OR df.last_synced_at <= $1)
     ORDER BY df.reconciliation_required DESC,
              df.last_synced_at NULLS FIRST,
              df.updated_at,
              df.public_id
     LIMIT $2
  `, [staleBefore, Math.max(1, Math.min(250, limit))]);

  let updated = 0;
  let failed = 0;
  for (const target of targets.rows) {
    try {
      const order = await symphonya.adapter.getOrder(target.external_order_id);
      await persist(target.fulfilment_id, target.external_order_id, order, Date.now());
      updated += 1;
    } catch (error) {
      failed += 1;
      await runtime.nativePool.query(`
        UPDATE public.dropship_fulfilments
           SET last_synced_at=$2,last_error=$3,updated_at=$2
         WHERE public_id=$1
      `, [
        target.fulfilment_id,
        new Date(),
        (error instanceof Error ? error.message : String(error)).slice(0, 1000)
      ]);
    }
  }

  return { enabled: true, checked: targets.rows.length, updated, failed };
}

async function persist(
  fulfilmentId: string,
  externalOrderId: string,
  order: DropshipProviderOrder,
  now: number
): Promise<void> {
  const status = order.supplierPaymentRequired ? "supplier_payment_required" : order.status;
  await getProductionPostgresRuntime().nativePool.query(`
    UPDATE public.dropship_fulfilments
       SET status=$3,
           provider_status=$4,
           response_payload=$5::jsonb,
           last_synced_at=$6,
           reconciliation_required=false,
           last_error=NULL,
           updated_at=$6
     WHERE public_id=$1
       AND external_order_id=$2
  `, [
    fulfilmentId,
    externalOrderId,
    status,
    order.providerStatus.slice(0, 200),
    JSON.stringify({
      ...order.raw,
      tracking: order.tracking ?? null,
      supplierPaymentRequired: order.supplierPaymentRequired
    }),
    new Date(now)
  ]);
}
