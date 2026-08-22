import { requireAccountSession } from "../../../../../../lib/account-session";
import { markCustomerNotificationRead } from "../../../../../../lib/customer-state-runtime";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    const notificationId = id.trim();
    if (!notificationId) throw new Error("Notification is required");
    await markCustomerNotificationRead({ userId: principal.userId, notificationId, now: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "notification_read_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}