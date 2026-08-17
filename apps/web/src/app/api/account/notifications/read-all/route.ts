import { requireAccountSession } from "../../../../../lib/account-session";
import { markAllCustomerNotificationsRead } from "../../../../../lib/customer-state-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const updated = await markAllCustomerNotificationsRead({ userId: principal.userId, now: Date.now() });
    return Response.json({ updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "notification_update_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
