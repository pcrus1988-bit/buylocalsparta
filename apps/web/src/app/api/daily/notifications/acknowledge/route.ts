import { requireDailySession } from "../../../../../lib/daily-session";
import { acknowledgeDailyOrderNotification } from "../../../../../lib/daily-order-inbox";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { notificationId?: unknown };
    const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : "";
    return Response.json(await acknowledgeDailyOrderNotification(principal, notificationId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "notification_acknowledgement_failed" }, { status: 400 });
  }
}
