import { randomUUID } from "node:crypto";
import type { DropshipAddress, DropshipCreateOrderRequest, DropshipProviderOrder } from "../../../../integrations/dropship-suppliers/src/index.ts";
import { createSymphonyaRuntime } from "../../../../integrations/dropship-suppliers/src/symphonya-runtime.ts";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type SymphonyaPaidFulfilmentResult = Readonly<{
  eligible: number;
  submitted: number;
  blocked: number;
  uncertain: number;
}>;

type Claim = Readonly<{
  fulfilmentId: string;
  claimToken: string;
  idempotencyKey: string;
  customerOrderId: string;
  customerOrderNumber: string;
  customerEmail?: string;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
}>;

type LineRow = Readonly<{
  order_line_id: string;
  external_product_id: string;
  external_variant_id: string;
  external_sku: string | null;
  ean: string | null;
  quantity: number | string;
  supplier_unit_cost_minor: number | string;
}>;

const SUPPLIER_CODE = "symphonya";

/**
 * At-most-once paid-order submitter for Symphonya.
 *
 * A fulfilment row is claimed transactionally before any supplier call. Once
 * submission_started_at is written, any exception is treated as uncertain and
 * is never blindly retried. This is deliberately conservative because the
 * supplier API does not expose a provider-side idempotency-key contract.
 */
export async function fulfilPaidSymphonyaOrder(
  orderId: string,
  now = Date.now()
): Promise<SymphonyaPaidFulfilmentResult> {
  if (!productionDatabaseConfigured()) return empty();

  const claims = await claimQueued(orderId, now);
  if (!claims.length) return empty();

  const symphonya = createSymphonyaRuntime();
  if (!symphonya) {
    for (const claim of claims) {
      await markBlocked(
        claim,
        "SYMPHONYA_ENABLED is not enabled in the production runtime",
        now
      );
    }
    return { eligible: claims.length, submitted: 0, blocked: claims.length, uncertain: 0 };
  }

  let submitted = 0;
  let blocked = 0;
  let uncertain = 0;

  for (const claim of claims) {
    try {
      const request = await createRequest(claim);
      await markSubmissionStarted(claim, Date.now());
      const providerOrder = await symphonya.adapter.createOrder(request);
      await markSubmitted(claim, providerOrder, Date.now());
      submitted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const started = await submissionStarted(claim);
      if (started) {
        await markUncertain(claim, message, error, Date.now());
        uncertain += 1;
      } else {
        await markBlocked(claim, message, Date.now());
        blocked += 1;
      }
    }
  }

  return { eligible: claims.length, submitted, blocked, uncertain };
}

async function claimQueued(orderId: string, now: number): Promise<Claim[]> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  const claims: Claim[] = [];

  try {
    await client.query("BEGIN");
    const candidates = await client.query<{
      fulfilment_id: string;
      idempotency_key: string;
      customer_order_id: string;
      customer_order_number: string;
      customer_email: string | null;
      shipping_address_snapshot: Record<string, unknown> | null;
      billing_address_snapshot: Record<string, unknown> | null;
    }>(`
      SELECT df.public_id AS fulfilment_id,
             df.idempotency_key,
             o.public_id AS customer_order_id,
             o.order_number AS customer_order_number,
             u.email AS customer_email,
             o.shipping_address_snapshot,
             o.billing_address_snapshot
        FROM public.dropship_fulfilments df
        JOIN public.dropship_suppliers ds ON ds.id=df.supplier_id
        JOIN public.customer_orders o ON o.id=df.order_id
        JOIN public.users u ON u.id=o.user_id
       WHERE o.public_id=$1
         AND df.status='queued'
         AND ds.code=$2
         AND ds.provider_kind='symphonya'
         AND ds.active=true
         AND ds.order_forwarding_enabled=true
       ORDER BY df.created_at,df.public_id
       FOR UPDATE OF df SKIP LOCKED
    `, [orderId, SUPPLIER_CODE]);

    for (const candidate of candidates.rows) {
      const claimToken = randomUUID();
      const claimed = await client.query(`
        UPDATE public.dropship_fulfilments
           SET status='creating',
               claim_token=$2::uuid,
               claimed_at=$3,
               attempt_count=attempt_count+1,
               last_error=NULL,
               updated_at=$3
         WHERE public_id=$1
           AND status='queued'
        RETURNING public_id
      `, [candidate.fulfilment_id, claimToken, new Date(now)]);
      if (!claimed.rowCount) continue;

      claims.push({
        fulfilmentId: candidate.fulfilment_id,
        claimToken,
        idempotencyKey: candidate.idempotency_key,
        customerOrderId: candidate.customer_order_id,
        customerOrderNumber: candidate.customer_order_number,
        customerEmail: candidate.customer_email?.trim() || undefined,
        shippingAddress: record(candidate.shipping_address_snapshot),
        billingAddress: record(candidate.billing_address_snapshot)
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

async function createRequest(claim: Claim): Promise<DropshipCreateOrderRequest> {
  const runtime = getProductionPostgresRuntime();
  const lines = await runtime.nativePool.query<LineRow>(`
    SELECT dfl.order_line_id::text AS order_line_id,
           dso.external_product_id,
           dso.external_variant_id,
           dso.external_sku,
           dso.ean,
           dfl.quantity,
           dfl.supplier_unit_cost_minor
      FROM public.dropship_fulfilments df
      JOIN public.dropship_fulfilment_lines dfl ON dfl.dropship_fulfilment_id=df.id
      JOIN public.dropship_supplier_offers dso ON dso.id=dfl.supplier_offer_id
     WHERE df.public_id=$1
     ORDER BY dfl.order_line_id
  `, [claim.fulfilmentId]);
  if (!lines.rowCount) throw new Error("Symphonya fulfilment has no supplier lines");

  return {
    idempotencyKey: claim.idempotencyKey,
    customerOrderId: claim.customerOrderId,
    customerOrderNumber: claim.customerOrderNumber,
    shippingAddress: address(claim.shippingAddress, claim.customerEmail, "shipping"),
    billingAddress: address(claim.billingAddress, claim.customerEmail, "billing"),
    lines: lines.rows.map((line) => ({
      orderLineId: line.order_line_id,
      externalProductId: required(line.external_product_id, "Symphonya product id"),
      externalVariantId: required(line.external_variant_id, "Symphonya variant id"),
      externalSku: optional(line.ean) ?? optional(line.external_sku),
      quantity: positiveInteger(line.quantity, "Symphonya quantity"),
      supplierUnitCostMinor: nonNegativeInteger(line.supplier_unit_cost_minor, "Symphonya supplier unit cost"),
      currency: "EUR"
    }))
  };
}

function address(
  snapshot: Record<string, unknown>,
  email: string | undefined,
  label: string
): DropshipAddress {
  const name = optional(snapshot.recipientName) ?? optional(snapshot.fullName);
  return {
    name: required(name, `${label} recipient name`),
    company: optional(snapshot.companyName),
    line1: required(snapshot.line1, `${label} address line 1`),
    line2: optional(snapshot.line2),
    postcode: required(snapshot.postcode, `${label} postcode`),
    city: required(snapshot.locality, `${label} city`),
    region: optional(snapshot.region),
    countryCode: (optional(snapshot.countryCode) ?? "GR").toUpperCase(),
    phone: optional(snapshot.phone),
    email
  };
}

async function markSubmissionStarted(claim: Claim, now: number): Promise<void> {
  await updateCreating(claim, `submission_started_at=$3,updated_at=$3`, [new Date(now)]);
}

async function submissionStarted(claim: Claim): Promise<boolean> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ started: boolean }>(`
    SELECT submission_started_at IS NOT NULL AS started
      FROM public.dropship_fulfilments
     WHERE public_id=$1
       AND claim_token=$2::uuid
     LIMIT 1
  `, [claim.fulfilmentId, claim.claimToken]);
  return result.rows[0]?.started === true;
}

async function markSubmitted(claim: Claim, order: DropshipProviderOrder, now: number): Promise<void> {
  const status = order.supplierPaymentRequired ? "supplier_payment_required" : order.status;
  await updateCreating(
    claim,
    `status=$3,
     external_order_id=$4,
     provider_status=$5,
     response_payload=$6::jsonb,
     submitted_at=$7,
     last_synced_at=$7,
     reconciliation_required=false,
     last_error=NULL,
     updated_at=$7`,
    [
      status,
      order.externalOrderId,
      order.providerStatus.slice(0, 200),
      JSON.stringify(order.raw),
      new Date(now)
    ]
  );
}

async function markBlocked(claim: Claim, message: string, now: number): Promise<void> {
  await updateCreating(
    claim,
    `status='supplier_action_required',last_error=$3,updated_at=$4`,
    [message.slice(0, 1000), new Date(now)]
  );
}

async function markUncertain(claim: Claim, message: string, raw: unknown, now: number): Promise<void> {
  await updateCreating(
    claim,
    `status='submission_uncertain',
     reconciliation_required=true,
     submission_uncertain_at=$3,
     response_payload=$4::jsonb,
     last_error=$5,
     updated_at=$3`,
    [new Date(now), JSON.stringify(errorPayload(raw)), message.slice(0, 1000)]
  );
}

async function updateCreating(claim: Claim, setSql: string, values: readonly unknown[]): Promise<void> {
  const params = [claim.fulfilmentId, claim.claimToken, ...values];
  const result = await getProductionPostgresRuntime().nativePool.query(`
    UPDATE public.dropship_fulfilments
       SET ${setSql}
     WHERE public_id=$1
       AND claim_token=$2::uuid
       AND status='creating'
    RETURNING public_id
  `, params);
  if (!result.rowCount) throw new Error(`Symphonya fulfilment ${claim.fulfilmentId} lost its submission claim`);
}

function empty(): SymphonyaPaidFulfilmentResult {
  return { eligible: 0, submitted: 0, blocked: 0, uncertain: 0 };
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function required(value: unknown, label: string): string {
  const result = optional(value);
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function errorPayload(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; status?: unknown; retryable?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      retryable: error.retryable
    };
  }
  return { value: String(value) };
}
