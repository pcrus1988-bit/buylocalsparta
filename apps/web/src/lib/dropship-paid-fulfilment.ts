import { randomUUID } from "node:crypto";
import {
  fulfilPaidDropshipOrder,
  type PaidDropshipClaim,
  type PaidDropshipRepository
} from "../../../../integrations/dropship-suppliers/src/paid-fulfilment.ts";
import {
  NovaV1ApiError,
  NovaV1Client,
  novaApiKeyFromEnvironment,
  type NovaOrder
} from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PaidDropshipFinalization = Readonly<{
  orderId: string;
  prepared: number;
  forwardingEnabled: number;
  submitted: number;
  blocked: number;
  uncertain: number;
}>;

type DropshipOrderLineRow = Readonly<{
  order_uuid: string;
  order_id: string;
  order_number: string;
  billing_address_snapshot: Record<string, unknown>;
  shipping_address_snapshot: Record<string, unknown> | null;
  fulfilment_preference: string;
  order_line_uuid: string;
  quantity: number | string;
  supplier_unit_price_minor: number | string;
  supplier_uuid: string;
  supplier_public_id: string;
  supplier_code: string;
  provider_kind: string;
  owner_vendor_uuid: string;
  supplier_active: boolean;
  order_forwarding_enabled: boolean;
  supplier_configuration: Record<string, unknown>;
  supplier_offer_uuid: string;
  external_product_id: string;
  external_variant_id: string;
  warehouse_code: string | null;
  fulfilment_order_uuid: string | null;
}>;

type PreparedGroup = Readonly<{
  supplierUuid: string;
  supplierPublicId: string;
  supplierCode: string;
  providerKind: string;
  ownerVendorUuid: string;
  supplierActive: boolean;
  orderForwardingEnabled: boolean;
  configuration: Record<string, unknown>;
  warehouseKey: string;
  fulfilmentOrderUuid: string | null;
  lines: readonly DropshipOrderLineRow[];
}>;

/**
 * Paid-order bridge invoked after Mollie capture has been durably reconciled.
 *
 * It always records the dropship fulfilment graph idempotently. Actual supplier mutation
 * requires all of the following: active supplier, order_forwarding_enabled=true, a supported
 * provider, and a providerPayload that has been explicitly marked validated. Production Nova
 * currently keeps forwarding disabled, so deploying this bridge cannot create a supplier order.
 */
export async function finalizePaidDropshipFulfilment(orderId: string, now = Date.now()): Promise<PaidDropshipFinalization> {
  if (!productionDatabaseConfigured()) return emptyResult(orderId);
  const runtime = getProductionPostgresRuntime();
  const rows = await loadDropshipOrderLines(orderId);
  if (!rows.length) return emptyResult(orderId);

  const groups = groupLines(rows);
  await prepareFulfilmentRows(groups, now);

  const forwardingGroups = groups.filter((group) => group.supplierActive && group.orderForwardingEnabled);
  if (!forwardingGroups.length) {
    return { orderId, prepared: groups.length, forwardingEnabled: 0, submitted: 0, blocked: 0, uncertain: 0 };
  }

  const unsupported = forwardingGroups.filter((group) => group.providerKind !== "brandsgateway_shopwoo");
  for (const group of unsupported) {
    await runtime.nativePool.query(`
      UPDATE dropship_fulfilments
         SET status='supplier_action_required',last_error=$4,updated_at=$5
       WHERE supplier_id=$1 AND order_id=$2 AND warehouse_key=$3 AND status='queued'
    `, [group.supplierUuid, rows[0]!.order_uuid, group.warehouseKey, `Unsupported dropship provider ${group.providerKind}`, new Date(now)]);
  }

  // A validated provider payload is intentionally a separate rollout gate. NovaV1Client does
  // not invent the provider's POST /orders body. Until a validated mapper writes
  // request_payload.providerPayload + providerPayloadValidated=true, rows remain queued and no
  // external order can be created.
  const readyPayloads = await runtime.nativePool.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM dropship_fulfilments df
      JOIN dropship_suppliers ds ON ds.id=df.supplier_id
     WHERE df.order_id=$1
       AND df.status='queued'
       AND ds.active=true
       AND ds.order_forwarding_enabled=true
       AND ds.provider_kind='brandsgateway_shopwoo'
       AND df.request_payload->>'providerPayloadValidated'='true'
       AND jsonb_typeof(df.request_payload->'providerPayload')='object'
  `, [rows[0]!.order_uuid]);
  if (Number(readyPayloads.rows[0]?.count ?? 0) === 0) {
    return { orderId, prepared: groups.length, forwardingEnabled: forwardingGroups.length, submitted: 0, blocked: 0, uncertain: 0 };
  }

  const repository = new PostgresPaidDropshipRepository(orderId);
  const client = novaClientForGroups(forwardingGroups);
  const outcomes = await fulfilPaidDropshipOrder(repository, client, orderId, () => Date.now());
  return {
    orderId,
    prepared: groups.length,
    forwardingEnabled: forwardingGroups.length,
    submitted: outcomes.filter((outcome) => outcome.status === "submitted").length,
    blocked: outcomes.filter((outcome) => ["out_of_stock", "supplier_action_required", "supplier_rejected"].includes(outcome.status)).length,
    uncertain: outcomes.filter((outcome) => outcome.status === "submission_uncertain").length
  };
}

async function loadDropshipOrderLines(orderId: string): Promise<readonly DropshipOrderLineRow[]> {
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<DropshipOrderLineRow>(`
    SELECT o.id::text AS order_uuid,o.public_id AS order_id,o.order_number,
           o.billing_address_snapshot,o.shipping_address_snapshot,o.fulfilment_preference::text,
           ol.id::text AS order_line_uuid,ol.quantity,ol.supplier_unit_price_minor,
           ds.id::text AS supplier_uuid,ds.public_id AS supplier_public_id,ds.code AS supplier_code,
           ds.provider_kind,ds.owner_vendor_id::text AS owner_vendor_uuid,ds.active AS supplier_active,
           ds.order_forwarding_enabled,ds.configuration AS supplier_configuration,
           dso.id::text AS supplier_offer_uuid,dso.external_product_id,dso.external_variant_id,
           dso.warehouse_code,
           fo.id::text AS fulfilment_order_uuid
      FROM customer_orders o
      JOIN order_lines ol ON ol.order_id=o.id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=ol.assigned_offer_id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN fulfilment_order_lines fol ON fol.order_line_id=ol.id
      LEFT JOIN fulfilment_orders fo ON fo.id=fol.fulfilment_order_id
     WHERE o.public_id=$1
       AND o.status IN ('confirmed','partially_fulfilled','fulfilled','completed')
     ORDER BY ds.public_id,COALESCE(dso.warehouse_code,'default'),ol.created_at,ol.id
  `, [orderId]);
  return result.rows;
}

function groupLines(rows: readonly DropshipOrderLineRow[]): PreparedGroup[] {
  const groups = new Map<string, DropshipOrderLineRow[]>();
  for (const row of rows) {
    const warehouseKey = row.warehouse_code?.trim() || "default";
    const key = `${row.supplier_uuid}|${warehouseKey}`;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }
  return [...groups.values()].map((lines) => {
    const first = lines[0]!;
    const fulfilmentIds = [...new Set(lines.map((line) => line.fulfilment_order_uuid).filter((value): value is string => Boolean(value)))];
    return {
      supplierUuid: first.supplier_uuid,
      supplierPublicId: first.supplier_public_id,
      supplierCode: first.supplier_code,
      providerKind: first.provider_kind,
      ownerVendorUuid: first.owner_vendor_uuid,
      supplierActive: first.supplier_active,
      orderForwardingEnabled: first.order_forwarding_enabled,
      configuration: first.supplier_configuration,
      warehouseKey: first.warehouse_code?.trim() || "default",
      fulfilmentOrderUuid: fulfilmentIds.length === 1 ? fulfilmentIds[0]! : null,
      lines
    };
  });
}

async function prepareFulfilmentRows(groups: readonly PreparedGroup[], now: number): Promise<void> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    for (const group of groups) {
      const first = group.lines[0]!;
      const merchandiseMinor = group.lines.reduce((sum, line) => sum + safeInteger(line.supplier_unit_price_minor, "supplier unit price") * safeInteger(line.quantity, "dropship quantity"), 0);
      const internalPayload = {
        schema: "konta_mou_dropship_paid_order_v1",
        customerOrderId: first.order_id,
        customerOrderNumber: first.order_number,
        fulfilmentPreference: first.fulfilment_preference,
        billingAddress: first.billing_address_snapshot,
        shippingAddress: first.shipping_address_snapshot,
        supplierCode: group.supplierCode,
        warehouseKey: group.warehouseKey
      };
      const idempotencyKey = `dropship:${first.order_id}:${group.supplierPublicId}:${group.warehouseKey}`;
      const fulfilment = await client.query<{ id: string }>(`
        INSERT INTO dropship_fulfilments(
          supplier_id,order_id,fulfilment_order_id,vendor_id,warehouse_key,idempotency_key,
          status,supplier_currency,supplier_merchandise_minor,request_payload,created_at,updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,'queued','EUR',$7,$8::jsonb,$9,$9)
        ON CONFLICT(supplier_id,order_id,warehouse_key) DO UPDATE
          SET fulfilment_order_id=COALESCE(dropship_fulfilments.fulfilment_order_id,EXCLUDED.fulfilment_order_id),
              supplier_merchandise_minor=CASE WHEN dropship_fulfilments.status='queued' THEN EXCLUDED.supplier_merchandise_minor ELSE dropship_fulfilments.supplier_merchandise_minor END,
              request_payload=dropship_fulfilments.request_payload || EXCLUDED.request_payload,
              updated_at=EXCLUDED.updated_at
        RETURNING id::text AS id
      `, [group.supplierUuid, first.order_uuid, group.fulfilmentOrderUuid, group.ownerVendorUuid, group.warehouseKey, idempotencyKey, merchandiseMinor, JSON.stringify(internalPayload), new Date(now)]);
      const fulfilmentUuid = fulfilment.rows[0]?.id;
      if (!fulfilmentUuid) throw new Error("Failed to prepare dropship fulfilment");

      for (const line of group.lines) {
        await client.query(`
          INSERT INTO dropship_fulfilment_lines(
            dropship_fulfilment_id,order_line_id,supplier_offer_id,external_variant_id,quantity,supplier_unit_cost_minor
          ) VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(dropship_fulfilment_id,order_line_id) DO NOTHING
        `, [
          fulfilmentUuid,
          line.order_line_uuid,
          line.supplier_offer_uuid,
          line.external_variant_id,
          safeInteger(line.quantity, "dropship quantity"),
          safeInteger(line.supplier_unit_price_minor, "supplier unit price")
        ]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

class PostgresPaidDropshipRepository implements PaidDropshipRepository {
  constructor(private readonly orderId: string) {}

  async claimQueued(_orderId: string, now: number): Promise<readonly PaidDropshipClaim[]> {
    const runtime = getProductionPostgresRuntime();
    const client = await runtime.nativePool.connect();
    const claims: PaidDropshipClaim[] = [];
    try {
      await client.query("BEGIN");
      const order = await client.query<{ id: string }>("SELECT id::text AS id FROM customer_orders WHERE public_id=$1", [this.orderId]);
      const orderUuid = order.rows[0]?.id;
      if (!orderUuid) throw new Error("Paid dropship order not found");

      const candidates = await client.query<{
        fulfilment_id: string;
        store_id: string;
        provider_payload: Record<string, unknown>;
      }>(`
        SELECT df.public_id AS fulfilment_id,
               ds.configuration->>'storeId' AS store_id,
               df.request_payload->'providerPayload' AS provider_payload
          FROM dropship_fulfilments df
          JOIN dropship_suppliers ds ON ds.id=df.supplier_id
         WHERE df.order_id=$1 AND df.status='queued'
           AND ds.active=true AND ds.order_forwarding_enabled=true
           AND ds.provider_kind='brandsgateway_shopwoo'
           AND df.request_payload->>'providerPayloadValidated'='true'
           AND jsonb_typeof(df.request_payload->'providerPayload')='object'
         ORDER BY df.created_at,df.public_id
         FOR UPDATE OF df SKIP LOCKED
      `, [orderUuid]);

      for (const candidate of candidates.rows) {
        const claimToken = randomUUID();
        const claimed = await client.query<{ idempotency_key: string }>(`
          UPDATE dropship_fulfilments
             SET status='creating',claim_token=$2,claimed_at=$3,attempt_count=attempt_count+1,
                 last_error=NULL,updated_at=$3
           WHERE public_id=$1 AND status='queued'
           RETURNING idempotency_key
        `, [candidate.fulfilment_id, claimToken, new Date(now)]);
        if (!claimed.rowCount) continue;

        const lines = await client.query<{
          order_line_id: string;
          external_product_id: string;
          external_variant_id: string;
          quantity: number | string;
          supplier_unit_cost_minor: number | string;
        }>(`
          SELECT dfl.order_line_id::text AS order_line_id,dso.external_product_id,dfl.external_variant_id,
                 dfl.quantity,dfl.supplier_unit_cost_minor
            FROM dropship_fulfilments df
            JOIN dropship_fulfilment_lines dfl ON dfl.dropship_fulfilment_id=df.id
            JOIN dropship_supplier_offers dso ON dso.id=dfl.supplier_offer_id
           WHERE df.public_id=$1
           ORDER BY dfl.order_line_id
        `, [candidate.fulfilment_id]);
        const storeId = candidate.store_id?.trim();
        if (!storeId) throw new Error(`Nova storeId is missing for ${candidate.fulfilment_id}`);
        claims.push({
          fulfilmentId: candidate.fulfilment_id,
          claimToken,
          idempotencyKey: claimed.rows[0]!.idempotency_key,
          storeId,
          providerPayload: candidate.provider_payload,
          lines: lines.rows.map((line) => ({
            orderLineId: line.order_line_id,
            externalProductId: line.external_product_id,
            externalVariantId: line.external_variant_id,
            quantity: safeInteger(line.quantity, "dropship quantity"),
            supplierUnitCostMinor: safeInteger(line.supplier_unit_cost_minor, "supplier unit cost")
          }))
        });
      }
      await client.query("COMMIT");
      return claims;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async markSubmissionStarted(fulfilmentId: string, claimToken: string, now: number): Promise<void> {
    await this.updateCreating(fulfilmentId, claimToken, `submission_started_at=$3,updated_at=$3`, [new Date(now)]);
  }

  async markOutOfStock(fulfilmentId: string, claimToken: string, message: string, now: number): Promise<void> {
    await this.updateCreating(fulfilmentId, claimToken, `status='out_of_stock',last_error=$3,updated_at=$4`, [message.slice(0, 1000), new Date(now)]);
  }

  async markSupplierActionRequired(fulfilmentId: string, claimToken: string, message: string, now: number): Promise<void> {
    await this.updateCreating(fulfilmentId, claimToken, `status='supplier_action_required',last_error=$3,updated_at=$4`, [message.slice(0, 1000), new Date(now)]);
  }

  async markSupplierRejected(fulfilmentId: string, claimToken: string, error: NovaV1ApiError, now: number): Promise<void> {
    await this.updateCreating(fulfilmentId, claimToken,
      `status='supplier_rejected',provider_status=$3,response_payload=$4::jsonb,last_error=$5,updated_at=$6`,
      [`http_${error.status}`, JSON.stringify({ status: error.status, code: error.code, method: error.method, path: error.path }), error.message.slice(0, 1000), new Date(now)]);
  }

  async markSubmissionUncertain(fulfilmentId: string, claimToken: string, message: string, raw: unknown, now: number): Promise<void> {
    await this.updateCreating(fulfilmentId, claimToken,
      `status='submission_uncertain',reconciliation_required=true,submission_uncertain_at=$3,response_payload=$4::jsonb,last_error=$5,updated_at=$3`,
      [new Date(now), JSON.stringify(jsonObject(raw)), message.slice(0, 1000)]);
  }

  async markSubmitted(input: { fulfilmentId: string; claimToken: string; externalOrderId: string; providerStatus: string; raw: NovaOrder; now: number }): Promise<void> {
    await this.updateCreating(input.fulfilmentId, input.claimToken,
      `status='supplier_confirmation',external_order_id=$3,provider_status=$4,response_payload=$5::jsonb,
       submitted_at=$6,last_synced_at=$6,reconciliation_required=false,last_error=NULL,updated_at=$6`,
      [input.externalOrderId, input.providerStatus, JSON.stringify(input.raw), new Date(input.now)]);
  }

  async updateCreating(fulfilmentId: string, claimToken: string, setSql: string, values: readonly unknown[]): Promise<void> {
    const runtime = getProductionPostgresRuntime();
    const params = [fulfilmentId, claimToken, ...values];
    const result = await runtime.nativePool.query(`
      UPDATE dropship_fulfilments SET ${setSql}
       WHERE public_id=$1 AND claim_token=$2::uuid AND status='creating'
       RETURNING public_id
    `, params);
    if (!result.rowCount) throw new Error(`Dropship fulfilment ${fulfilmentId} lost its submission claim`);
  }
}

function novaClientForGroups(groups: readonly PreparedGroup[]): NovaV1Client {
  const nova = groups.find((group) => group.providerKind === "brandsgateway_shopwoo");
  if (!nova) throw new Error("No enabled Nova dropship supplier is available");
  const baseUrl = text(nova.configuration.apiBaseUrl);
  const requestsPerMinute = optionalPositiveInteger(nova.configuration.rateLimitPerMinute);
  return new NovaV1Client({
    apiKey: novaApiKeyFromEnvironment(),
    ...(baseUrl ? { baseUrl } : {}),
    ...(requestsPerMinute ? { requestsPerMinute } : {})
  });
}

function emptyResult(orderId: string): PaidDropshipFinalization {
  return { orderId, prepared: 0, forwardingEnabled: 0, submitted: 0, blocked: 0, uncertain: 0 };
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { value: String(value) };
}
