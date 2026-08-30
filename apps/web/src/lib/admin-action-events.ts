export const ADMIN_ACTION_COMPLETED_EVENT = "kontamou:admin-action-completed";

export type AdminActionCompletedDetail = Readonly<{
  actionType: string;
  endpoint: string;
  occurredAt: number;
}>;

export function publishAdminActionCompleted(detail: AdminActionCompletedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminActionCompletedDetail>(ADMIN_ACTION_COMPLETED_EVENT, { detail }));
}
