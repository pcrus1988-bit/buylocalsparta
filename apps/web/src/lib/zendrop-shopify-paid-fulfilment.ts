import { randomUUID } from "node:crypto";
import {
  ShopifyBridgeOrderRejectedError,
  createShopifyBridgeOrder,
  shopifyBridgeAddressFromSnapshot,
  shopifyBridgeConfigFromEnvironment
} from "./shopify-zendrop-bridge";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type ZendropShopifyPaidResult = Readonly<{
  eligible: number;
  submitted: number;
  blocked: number;
  uncertain: number;
}>;

type Claim = Readonly<{
  fulfilmentId: string;
  claimToken: string;
  customerOrderId: string;
  customerOrderNumber: string;
  shipping: Record<string, unknown>;
  billing: Record<string, unknown>;
}>;

type BridgeLine = Readonly<{
  external_variant_id: string;
  quantity: number | string;
  shop_domain: string | null;
  shopify_variant_id: string | null;
  sync_status: string | null;
}>;

export async function fulfilPaidZendropShopifyOrder(
  orderId: string,
  now = Date.now()
): Promise<ZendropShopifyPaidResult> {
  if (!productionDatabaseConfigured()) return empty();
  const claims = await claim(orderId, now);
  let submitted = 0;
  let blocked = 0;
  let uncertain = 0;

  for (const item of claims) {
    try {
      const request = await buildRequest(item);
      await update(item, "submission_started_at=$3,updated_at=$3", [new Date()]);
      const result = await createShopifyBridgeOrder(request);
      await update(
        item,
        "status='supplier_confirmation',external_order_id=$3,provider_status=$4,response_payload=$5::jsonb,submitted_at=$6,last_synced_at=$6,reconciliation_required=false,last_error=NULL,updated_at=$6",
        [
          result.order.id,
          `${result.order.financialStatus}/${result.order.fulfillmentStatus}`.slice(0, 200),
          JSON.stringify({
            bridge: "shopify",
            orderId: result.order.id,
            orderName: result.order.name,
            tracking: result.order.tracking
          }),
          new Date()
        ]
      );
      submitted += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      const started = await submissionStarted(item);
      if (started && !(error instanceof ShopifyBridgeOrderRejectedError)) {
        await update(
          item,
          "status='submission_uncertain',reconciliation_required=true,submission_uncertain_at=$3,last_error=$4,updated_at=$3",
          [new Date(), message]
        );
        uncertain += 1;
      } else {
        await update(item, "status='supplier_action_required',last_error=$3,updated_at=$4", [message, new Date()]);
        blocked += 1;
      }
    }
  }

  return { eligible: claims.length, submitted, blocked, uncertain };
}

async function claim(orderId: string, now: number): Promise<Claim[]> {
  const pool = getProductionPostgresRuntime().nativePool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query<{
      fulfilment_id: string;
      customer_order_id: string;
      customer_order_number: string;
      shipping_address_snapshot: Record<string, unknown> | null;
      billing_address_snapshot: Record<string, unknown> | null;
    }>(`
      SELECT df.public_id fulfilment_id,o.public_id customer_order_id,o.order_number customer_order_number,
             o.shipping_address_snapshot,o.billing_address_snapshot
        FROM public.dropship_fulfilments df
        JOIN public.dropship_suppliers ds ON ds.id=df.supplier_id
        JOIN public.customer_orders o ON o.id=df.order_id
       WHERE o.public_id=$1 AND df.status='queued' AND ds.code='zendrop'
         AND ds.active=true AND ds.order_forwarding_enabled=true
         AND ds.configuration->>'orderBridge'='shopify'
       ORDER BY df.created_at,df.public_id
       FOR UPDATE OF df SKIP LOCKED
    `, [orderId]);

    const out: Claim[] = [];
    for (const row of rows.rows) {
      const claimToken = randomUUID();
      const locked = await client.query(`
        UPDATE public.dropship_fulfilments
           SET status='creating',claim_token=$2::uuid,claimed_at=$3,
               attempt_count=attempt_count+1,last_error=NULL,updated_at=$3
         WHERE public_id=$1 AND status='queued'
         RETURNING public_id
      `, [row.fulfilment_id, claimToken, new Date(now)]);
      if (!locked.rowCount) continue;
      out.push({
        fulfilmentId: row.fulfilment_id,
        claimToken,
        customerOrderId: row.customer_order_id,
        customerOrderNumber: row.customer_order_number,
        shipping: object(row.shipping_address_snapshot),
        billing: object(row.billing_address_snapshot)
      });
    }
    await client.query("COMMIT");
    return out;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function buildRequest(item: Claim): Promise<Parameters<typeof createShopifyBridgeOrder>[0]> {
  const result = await getProductionPostgresRuntime().nativePool.query<BridgeLine>(`
    SELECT dfl.external_variant_id,dfl.quantity,b.shop_domain,b.shopify_variant_id,b.sync_status
      FROM public.dropship_fulfilments df
      JOIN public.dropship_fulfilment_lines dfl ON dfl.dropship_fulfilment_id=df.id
      LEFT JOIN public.dropship_shopify_bridge_variants b
        ON b.supplier_id=df.supplier_id AND b.external_variant_id=dfl.external_variant_id
     WHERE df.public_id=$1
     ORDER BY dfl.order_line_id
  `, [item.fulfilmentId]);

  if (!result.rowCount) throw new Error("Zendrop bridge fulfilment has no lines");
  const domain = `${shopifyBridgeConfigFromEnvironment().shop}.myshopify.com`;
  for (const line of result.rows) {
    if (line.sync_status !== "synced" || !line.shopify_variant_id) {
      throw new Error(`Zendrop variant ${line.external_variant_id} has no synced Shopify bridge mapping`);
    }
    if (line.shop_domain?.trim().toLowerCase() !== domain) {
      throw new Error(`Zendrop variant ${line.external_variant_id} is mapped to another Shopify store`);
    }
  }

  const shippingAddress = shopifyBridgeAddressFromSnapshot(item.shipping, "shipping");
  const billingSource = text(item.billing.line1) ? item.billing : item.shipping;
  return {
    customerOrderId: item.customerOrderId,
    customerOrderNumber: item.customerOrderNumber,
    shippingAddress,
    billingAddress: shopifyBridgeAddressFromSnapshot(billingSource, "billing"),
    lines: result.rows.map((line) => ({
      shopifyVariantId: required(line.shopify_variant_id),
      quantity: positive(line.quantity)
    }))
  };
}

async function submissionStarted(item: Claim): Promise<boolean> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ started: boolean }>(`
    SELECT submission_started_at IS NOT NULL started
      FROM public.dropship_fulfilments
     WHERE public_id=$1 AND claim_token=$2::uuid
  `, [item.fulfilmentId, item.claimToken]);
  return result.rows[0]?.started === true;
}

async function update(item: Claim, setSql: string, values: readonly unknown[]): Promise<void> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `UPDATE public.dropship_fulfilments SET ${setSql}
      WHERE public_id=$1 AND claim_token=$2::uuid AND status='creating' RETURNING public_id`,
    [item.fulfilmentId, item.claimToken, ...values]
  );
  if (!result.rowCount) throw new Error(`Zendrop bridge fulfilment ${item.fulfilmentId} lost its claim`);
}

function empty(): ZendropShopifyPaidResult {
  return { eligible: 0, submitted: 0, blocked: 0, uncertain: 0 };
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function required(value: unknown): string {
  const v = text(value); if (!v) throw new Error("Shopify bridge variant id is required"); return v;
}
function positive(value: unknown): number {
  const v = Number(value); if (!Number.isSafeInteger(v) || v <= 0) throw new Error("Invalid Zendrop quantity"); return v;
}
