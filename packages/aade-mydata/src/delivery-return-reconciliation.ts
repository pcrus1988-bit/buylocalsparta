import type { ConfirmDeliveryReturnResult, DeliveryNoteStatusResponse } from "./digital-movement.ts";

export type DeliveryReturnReconciliation = Readonly<{
  resolved: boolean;
  deliveryReturnMark?: string;
  reason: string;
}>;

export function deliveryReturnNeedsReconciliation(result: ConfirmDeliveryReturnResult): boolean {
  return result.ok && !result.deliveryReturnMark;
}

export function reconcileDeliveryReturnFromStatus(status: DeliveryNoteStatusResponse): DeliveryReturnReconciliation {
  const event = [...status.lifecycleHistory]
    .reverse()
    .find(candidate => normalizeEventType(candidate.eventType) === "confirmreturn");
  const deliveryReturnMark = event?.mark?.trim();
  if (deliveryReturnMark && !/^\d{1,40}$/.test(deliveryReturnMark)) {
    return { resolved: false, reason: "AADE ConfirmReturn lifecycle event contains an invalid MARK; do not resend blindly." };
  }
  if (deliveryReturnMark) {
    return { resolved: true, deliveryReturnMark, reason: "Recovered delivery return MARK from AADE lifecycle history." };
  }
  if (status.statusName === "Completed" || status.statusCode === 8 || status.status?.trim().toLowerCase() === "completed") {
    return { resolved: false, reason: "Delivery is completed but no ConfirmReturn MARK was found; manual reconciliation is required before any retry." };
  }
  return { resolved: false, reason: "No ConfirmReturn event is present in AADE lifecycle history; refresh status before deciding whether any retry is safe." };
}

function normalizeEventType(value: string | undefined): string {
  return value?.replace(/[\s_-]+/g, "").toLowerCase() ?? "";
}
