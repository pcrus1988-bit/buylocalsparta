import { requireAccountSession } from "../../../../../lib/account-session";
import { archiveCustomerNotification, markCustomerNotificationRead } from "../../../../../lib/customer-engagement-actions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "read") await markCustomerNotificationRead(principal, id);
    else if (body.action === "archive") await archiveCustomerNotification(principal, id);
    else throw new Error("Μη έγκυρη ενέργεια ειδοποίησης.");
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "notification_action_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
