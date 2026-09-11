import { revalidateNovaCheckoutStock, type NovaCheckoutReadClient } from "./nova-checkout-revalidation.ts";
import {
  NovaV1ApiError,
  NovaV1OrderSubmissionUncertainError,
  type NovaCreateOrderPayload,
  type NovaOrder,
  type NovaScalarId
} from "./nova-v1.ts";

export type PaidDropshipLine = Readonly<{
  orderLineId: string;
  externalProductId: string;
  externalVariantId: string;
  quantity: number;
  supplierUnitCostMinor: number;
}>;

export type PaidDropshipClaim = Readonly<{
  fulfilmentId: string;
  claimToken: string;
  idempotencyKey: string;
  storeId: NovaScalarId;
  providerPayload: NovaCreateOrderPayload;
  lines: readonly PaidDropshipLine[];
}>;

export type PaidDropshipOutcomeStatus =
  | "submitted"
  | "out_of_stock"
  | "supplier_action_required"
  | "supplier_rejected"
  | "submission_uncertain";

export type PaidDropshipOutcome = Readonly<{
  fulfilmentId: string;
  status: PaidDropshipOutcomeStatus;
  externalOrderId?: string;
  providerStatus?: string;
  message?: string;
}>;

export interface PaidDropshipRepository {
  /** Atomically transitions eligible queued rows to creating and returns only claims won by this caller. */
  claimQueued(orderId: string, now: number): Promise<readonly PaidDropshipClaim[]>;
  /** Persisted immediately before POST /orders. A row with this timestamp must never be blindly retried. */
  markSubmissionStarted(fulfilmentId: string, claimToken: string, now: number): Promise<void>;
  markOutOfStock(fulfilmentId: string, claimToken: string, message: string, now: number): Promise<void>;
  markSupplierActionRequired(fulfilmentId: string, claimToken: string, message: string, now: number): Promise<void>;
  markSupplierRejected(fulfilmentId: string, claimToken: string, error: NovaV1ApiError, now: number): Promise<void>;
  markSubmissionUncertain(fulfilmentId: string, claimToken: string, message: string, raw: unknown, now: number): Promise<void>;
  markSubmitted(input: {
    fulfilmentId: string;
    claimToken: string;
    externalOrderId: string;
    providerStatus: string;
    raw: NovaOrder;
    now: number;
  }): Promise<void>;
}

export interface NovaPaidFulfilmentClient extends NovaCheckoutReadClient {
  createOrder(storeId: NovaScalarId, payload: NovaCreateOrderPayload): Promise<NovaOrder>;
}

/**
 * Submit already-paid dropship fulfilments with at-most-once automatic mutation semantics.
 *
 * The repository owns the database claim. This function never retries POST /orders. If Nova
 * may have accepted a request but its response is unknown, the fulfilment is persisted as
 * submission_uncertain and must be reconciled with Nova before any human-authorised retry.
 */
export async function fulfilPaidDropshipOrder(
  repository: PaidDropshipRepository,
  client: NovaPaidFulfilmentClient,
  orderId: string,
  now: () => number = Date.now
): Promise<readonly PaidDropshipOutcome[]> {
  const startedAt = validNow(now());
  const claims = await repository.claimQueued(required(orderId, "customer order id"), startedAt);
  const outcomes: PaidDropshipOutcome[] = [];

  for (const claim of claims) {
    validateClaim(claim);

    let blockedReason: string | undefined;
    let costIncrease: string | undefined;
    try {
      for (const line of claim.lines) {
        const evidence = await revalidateNovaCheckoutStock(client, {
          storeId: claim.storeId,
          externalProductId: line.externalProductId,
          externalVariantId: line.externalVariantId,
          quantity: line.quantity
        }, now);
        if (!evidence.eligible) {
          blockedReason = `${line.externalVariantId}: ${evidence.blockReasons.join(",") || "supplier-unavailable"}`;
          break;
        }
        if (evidence.supplierCostMinor === null || evidence.supplierCostMinor > line.supplierUnitCostMinor) {
          costIncrease = `${line.externalVariantId}: supplier cost changed from ${line.supplierUnitCostMinor} to ${evidence.supplierCostMinor ?? "unknown"}`;
          break;
        }
      }
    } catch (error) {
      const message = `Nova pre-submission revalidation failed: ${errorMessage(error)}`;
      await repository.markSupplierActionRequired(claim.fulfilmentId, claim.claimToken, message, validNow(now()));
      outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "supplier_action_required", message });
      continue;
    }

    if (blockedReason) {
      await repository.markOutOfStock(claim.fulfilmentId, claim.claimToken, blockedReason, validNow(now()));
      outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "out_of_stock", message: blockedReason });
      continue;
    }
    if (costIncrease) {
      await repository.markSupplierActionRequired(claim.fulfilmentId, claim.claimToken, costIncrease, validNow(now()));
      outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "supplier_action_required", message: costIncrease });
      continue;
    }

    const submissionStartedAt = validNow(now());
    await repository.markSubmissionStarted(claim.fulfilmentId, claim.claimToken, submissionStartedAt);

    let created: NovaOrder;
    try {
      created = await client.createOrder(claim.storeId, claim.providerPayload);
    } catch (error) {
      if (error instanceof NovaV1OrderSubmissionUncertainError) {
        const message = error.message;
        await repository.markSubmissionUncertain(claim.fulfilmentId, claim.claimToken, message, safeErrorPayload(error.originalError), validNow(now()));
        outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "submission_uncertain", message });
        continue;
      }
      if (error instanceof NovaV1ApiError && error.status >= 400 && error.status < 500) {
        await repository.markSupplierRejected(claim.fulfilmentId, claim.claimToken, error, validNow(now()));
        outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "supplier_rejected", message: error.message });
        continue;
      }

      // Defensive fallback: once submission_started_at is persisted, any unexpected
      // failure is treated as ambiguous rather than risking a duplicate supplier order.
      const message = `Nova order submission outcome is uncertain: ${errorMessage(error)}`;
      await repository.markSubmissionUncertain(claim.fulfilmentId, claim.claimToken, message, safeErrorPayload(error), validNow(now()));
      outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "submission_uncertain", message });
      continue;
    }

    const externalOrderId = scalarText(created.id ?? created.order_id);
    const providerStatus = scalarText(created.status) ?? "created";
    if (!externalOrderId) {
      const message = "Nova accepted POST /orders but returned no usable order id; reconciliation is required";
      await repository.markSubmissionUncertain(claim.fulfilmentId, claim.claimToken, message, created, validNow(now()));
      outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "submission_uncertain", providerStatus, message });
      continue;
    }

    await repository.markSubmitted({
      fulfilmentId: claim.fulfilmentId,
      claimToken: claim.claimToken,
      externalOrderId,
      providerStatus,
      raw: created,
      now: validNow(now())
    });
    outcomes.push({ fulfilmentId: claim.fulfilmentId, status: "submitted", externalOrderId, providerStatus });
  }

  return outcomes;
}

function validateClaim(claim: PaidDropshipClaim): void {
  required(claim.fulfilmentId, "dropship fulfilment id");
  required(claim.claimToken, "dropship claim token");
  required(claim.idempotencyKey, "dropship idempotency key");
  if (!claim.providerPayload || typeof claim.providerPayload !== "object" || Array.isArray(claim.providerPayload) || Object.keys(claim.providerPayload).length === 0) {
    throw new Error("Validated Nova provider payload is required before supplier submission");
  }
  if (!claim.lines.length) throw new Error("Dropship fulfilment claim requires at least one line");
  for (const line of claim.lines) {
    required(line.orderLineId, "order line id");
    required(line.externalProductId, "external product id");
    required(line.externalVariantId, "external variant id");
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("Dropship line quantity must be a positive integer");
    if (!Number.isSafeInteger(line.supplierUnitCostMinor) || line.supplierUnitCostMinor < 0) throw new Error("Dropship supplier cost must be a non-negative integer");
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function validNow(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Dropship fulfilment clock returned an invalid timestamp");
  return value;
}

function scalarText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeErrorPayload(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof NovaV1ApiError) {
    return { name: error.name, message: error.message, status: error.status, method: error.method, path: error.path, code: error.code };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}
