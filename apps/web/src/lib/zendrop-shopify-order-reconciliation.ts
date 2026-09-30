import {
  findShopifyBridgeOrderByTag,
  getShopifyBridgeOrder,
  shopifyBridgeOrderTag,
  type ShopifyBridgeOrderDetails
} from "./shopify-zendrop-bridge";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_LIMIT = 50;
const STALE_AFTER_MS = 5 * 60 * 1000;

export type ZendropShopifyReconciliationResult = Readonly<{
  enabled: boolean;
  checked: number;
  discovered: number;
  updated: number;
  failed: number;
}>;

type Target = Readonly<{
  fulfilment_id: string;
  external_order_id: string | null;
  customer_order_id: string;
}>;

export async function runZendropShopifyOrderReconciliationSweep(
  now = Date.now(),
  limit = DEFAULT_LIMIT
): Promise<ZendropShopifyReconciliationResult> {
  if (!productionDatabaseConfigured()) {
    return { enabled: false, checked: 0, discovered: 0, updated: 0, failed: 0 };
  }

  const runtime = getProductionPostgresRuntime();
  const staleBefore = new Date(now - STALE_AFTER_MS);
  const targets = await runtime.nativePool.query<Target>(`
    SELECT df.public_id AS fulfilment_id,
           df.external_order_id,
           o.public_id AS customer_order_id
      FROM public.dropship_fulfilments df
      JOIN public.dropship_suppliers ds ON ds.id=df.supplier_id
      JOIN public.customer_orders o ON o.id=df.order_id
     WHERE ds.code='zendrop'
       AND ds.active=true
       AND ds.configuration->>'orderBridge'='shopify'
       AND (df.reconciliation_required=true OR ds.tracking_sync_enabled=true)
       AND df.status NOT IN ('delivered','cancelled','failed','refunded')
       AND (df.last_synced_at IS NULL OR df.last_synced_at <= $1)
     ORDER BY df.reconciliation_required DESC,
              df.last_synced_at NULLS FIRST,
              df.updated_at,
              df.public_id
     LIMIT $2
  `, [staleBefore, Math.max(1, Math.min(250, limit))]);

  let discovered = 0;
  let updated = 0;
  let failed = 0;

  for (const target of targets.rows) {
    try {
      let remote: ShopifyBridgeOrderDetails;
      let externalOrderId = target.external_order_id?.trim() || "";
      if (externalOrderId) {
        remote = await getShopifyBridgeOrder(externalOrderId);
      } else {
        const tag = shopifyBridgeOrderTag(target.customer_order_id);
        const found = await findShopifyBridgeOrderByTag(tag);
        if (!found) {
          await markSyncError(
            target.fulfilment_id,
            "Shopify bridge reconciliation did not find an order for the exact KONTA MOY idempotency tag",
            Date.now()
          );
          failed += 1;
          continue;
        }
        remote = found;
        externalOrderId = found.id;
        discovered += 1;
      }

      await persist(target.fulfilment_id, externalOrderId, remote, Date.now());
      updated += 1;
    } catch (error) {
      failed += 1;
      await markSyncError(
        target.fulfilment_id,
        `Shopify bridge reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        Date.now()
      );
    }
  }

  return { enabled: true, checked: targets.rows.length, discovered, updated, failed };
}

export function mapShopifyBridgeOrderStatus(
  order: Pick<ShopifyBridgeOrderDetails, "financialStatus" | "fulfillmentStatus" | "cancelledAt" | "tracking">
): string {
  if (order.cancelledAt) return "cancelled";

  const financial = order.financialStatus.trim().toUpperCase();
  if (financial === "REFUNDED") return "refunded";
  if (financial === "PARTIALLY_REFUNDED") return "partially_refunded";

  const fulfillment = order.fulfillmentStatus.trim().toUpperCase();
  if (order.tracking.length > 0) return "shipped";
  if (["FULFILLED", "PARTIALLY_FULFILLED"].includes(fulfillment)) return "shipped";
  if (["IN_PROGRESS", "SCHEDULED"].includes(fulfillment)) return "preparing";
  return "supplier_confirmation";
}

async function persist(
  fulfilmentId: string,
  externalOrderId: string,
  order: ShopifyBridgeOrderDetails,
  now: number
): Promise<void> {
  const status = mapShopifyBridgeOrderStatus(order);
  const providerStatus = `${order.financialStatus}/${order.fulfillmentStatus}`.slice(0, 200);
  await getProductionPostgresRuntime().nativePool.query(`
    UPDATE public.dropship_fulfilments
       SET external_order_id=COALESCE(external_order_id,$2),
           status=$3,
           provider_status=$4,
           response_payload=$5::jsonb,
           last_synced_at=$6,
           reconciliation_required=false,
           last_error=NULL,
           updated_at=$6
     WHERE public_id=$1
       AND (external_order_id IS NULL OR external_order_id=$2)
  `, [
    fulfilmentId,
    externalOrderId,
    status,
    providerStatus,
    JSON.stringify({
      bridge: "shopify",
      orderId: order.id,
      orderName: order.name,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      cancelledAt: order.cancelledAt,
      tracking: order.tracking
    }),
    new Date(now)
  ]);
}

async function markSyncError(fulfilmentId: string, message: string, now: number): Promise<void> {
  await getProductionPostgresRuntime().nativePool.query(`
    UPDATE public.dropship_fulfilments
       SET last_synced_at=$2,last_error=$3,updated_at=$2
     WHERE public_id=$1
  `, [fulfilmentId, new Date(now), message.slice(0, 1000)]);
}
