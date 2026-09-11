import type { NovaOrder, NovaScalarId } from "./nova-v1.ts";

export type ReconciledDropshipStatus =
  | "queued"
  | "creating"
  | "out_of_stock"
  | "supplier_rejected"
  | "submission_uncertain"
  | "supplier_action_required"
  | "supplier_payment_required"
  | "supplier_confirmation"
  | "preparing"
  | "awaiting_courier"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "failed"
  | "partially_refunded"
  | "refunded";

export type DropshipReconciliationTarget = Readonly<{
  fulfilmentId: string;
  externalOrderId: string;
  storeId: NovaScalarId;
  currentStatus: ReconciledDropshipStatus;
}>;

export type DropshipReconciliationResult = Readonly<{
  checked: number;
  updated: number;
  unchanged: number;
  failed: number;
}>;

export interface NovaOrderReadClient {
  getOrder(storeId: NovaScalarId, orderId: NovaScalarId): Promise<NovaOrder>;
}

export interface DropshipOrderReconciliationRepository {
  listTargets(now: number, limit: number): Promise<readonly DropshipReconciliationTarget[]>;
  markSynced(input: {
    fulfilmentId: string;
    externalOrderId: string;
    providerStatus: string;
    status: ReconciledDropshipStatus;
    raw: NovaOrder;
    now: number;
  }): Promise<"updated" | "unchanged">;
  markSyncError(fulfilmentId: string, message: string, now: number): Promise<void>;
}

/**
 * Reconciles already-known supplier order IDs using Nova's read-only GET /orders/{id} API.
 *
 * This deliberately does not attempt to discover an order for a submission_uncertain row that
 * has no external_order_id. A loose match (customer name, amount, order number, etc.) is not
 * strong enough evidence to unlock a possibly duplicated supplier mutation.
 */
export async function reconcileNovaDropshipOrders(
  repository: DropshipOrderReconciliationRepository,
  clientForTarget: (target: DropshipReconciliationTarget) => NovaOrderReadClient,
  options: { now?: () => number; limit?: number } = {}
): Promise<DropshipReconciliationResult> {
  const now = options.now ?? Date.now;
  const startedAt = validNow(now());
  const limit = positiveLimit(options.limit ?? 50);
  const targets = await repository.listTargets(startedAt, limit);

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      validateTarget(target);
      const remote = await clientForTarget(target).getOrder(target.storeId, target.externalOrderId);
      const providerStatus = scalarText(remote.status) ?? scalarText(remote.order_status);
      if (!providerStatus) throw new Error("Nova order response did not contain a usable status");

      // If Nova includes its identifier, it must agree with the exact ID we requested. A response
      // without an explicit id is still authoritative because it came from GET /orders/{id}.
      const remoteOrderId = scalarText(remote.id ?? remote.order_id);
      if (remoteOrderId && remoteOrderId !== target.externalOrderId) {
        throw new Error(`Nova returned order ${remoteOrderId} while reconciling ${target.externalOrderId}`);
      }

      const mapped = mapNovaProviderStatus(providerStatus);
      const safeStatus = preventStatusRegression(target.currentStatus, mapped);
      const outcome = await repository.markSynced({
        fulfilmentId: target.fulfilmentId,
        externalOrderId: target.externalOrderId,
        providerStatus,
        status: safeStatus,
        raw: remote,
        now: validNow(now())
      });
      if (outcome === "updated") updated += 1;
      else unchanged += 1;
    } catch (error) {
      failed += 1;
      await repository.markSyncError(
        target.fulfilmentId,
        `Nova order reconciliation failed: ${errorMessage(error)}`,
        validNow(now())
      );
    }
  }

  return { checked: targets.length, updated, unchanged, failed };
}

/** Map Nova/BrandsGateway operational statuses into KONTA MOY fulfilment states. */
export function mapNovaProviderStatus(providerStatus: string): ReconciledDropshipStatus {
  const status = providerStatus.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (status) {
    case "pending":
    case "on_hold":
      return "supplier_confirmation";
    case "incomplete":
      return "supplier_action_required";
    case "pending_payment":
      return "supplier_payment_required";
    case "processing":
      return "preparing";
    case "processed":
      return "awaiting_courier";
    case "completed":
      return "shipped";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
      return "failed";
    case "partially_refunded":
      return "partially_refunded";
    case "refunded":
      return "refunded";
    // Nova exposes `trash` as a list filter. Treating it as a business cancellation would be
    // unsafe, so keep the order in a human-review state instead of inventing semantics.
    case "trash":
    default:
      return "supplier_confirmation";
  }
}

/** Never move a local fulfilment backwards merely because a supplier status lags behind. */
export function preventStatusRegression(
  current: ReconciledDropshipStatus,
  proposed: ReconciledDropshipStatus
): ReconciledDropshipStatus {
  if (current === "delivered" || current === "cancelled" || current === "failed" || current === "refunded") {
    return current;
  }
  if (current === "partially_refunded" && proposed !== "refunded") return current;
  if (current === "shipped" && !["delivered", "cancelled", "failed", "partially_refunded", "refunded"].includes(proposed)) {
    return current;
  }
  if (current === "awaiting_courier" && ["supplier_confirmation", "preparing"].includes(proposed)) return current;
  if (current === "preparing" && proposed === "supplier_confirmation") return current;
  return proposed;
}

function validateTarget(target: DropshipReconciliationTarget): void {
  required(target.fulfilmentId, "dropship fulfilment id");
  required(target.externalOrderId, "external supplier order id");
  const storeId = String(target.storeId).trim();
  if (!storeId) throw new Error("Nova store id is required for order reconciliation");
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function positiveLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 250) {
    throw new Error("Dropship reconciliation limit must be an integer between 1 and 250");
  }
  return value;
}

function scalarText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function validNow(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Dropship reconciliation clock returned an invalid timestamp");
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
