export const ADMIN_ACTION_COMPLETED_EVENT = "kontamou:admin-action-completed";

export type AdminActionState = string | number | boolean | null;

export type AdminActionCompletedDetail = Readonly<{
  actionType: string;
  endpoint: string;
  occurredAt: number;
  entityType?: string;
  entityId?: string;
  beforeState?: AdminActionState;
  afterState?: AdminActionState;
}>;

const ENTITY_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["orderId", "order"],
  ["returnId", "return"],
  ["vendorId", "vendor"],
  ["applicationId", "vendor_application"],
  ["productId", "product"],
  ["canonicalVariantId", "canonical_product"],
  ["documentId", "tax_document"],
  ["giftCardId", "gift_card"],
  ["agreementId", "vendor_agreement"],
  ["pageId", "content_page"],
  ["reviewId", "review"],
  ["requestId", "request"]
];

function safeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) return undefined;
  return normalized;
}

function safeState(value: unknown): AdminActionState | undefined {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized && normalized.length <= 120 ? normalized : undefined;
  }
  return undefined;
}

export function inferAdminActionEntity(payload: Readonly<Record<string, unknown>>): Readonly<{ entityType?: string; entityId?: string }> {
  for (const [key, entityType] of ENTITY_KEYS) {
    const entityId = safeId(payload[key]);
    if (entityId) return { entityType, entityId };
  }
  return {};
}

export function inferAdminActionAfterState(result: Readonly<Record<string, unknown>>): AdminActionState | undefined {
  for (const key of ["to", "status", "state", "active", "visible"] as const) {
    const value = safeState(result[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function publishAdminActionCompleted(detail: AdminActionCompletedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminActionCompletedDetail>(ADMIN_ACTION_COMPLETED_EVENT, { detail }));
}
