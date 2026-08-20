import { requireDailySession } from "../../../../../lib/daily-session";
import { dailyPushStatus, removeDailyPushSubscription, saveDailyPushSubscription } from "../../../../../lib/daily-push";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
    await saveDailyPushSubscription(principal, { endpoint, keys: { p256dh, auth } }, request.headers.get("user-agent") ?? undefined);
    return Response.json(await dailyPushStatus(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_push_subscription_failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    await removeDailyPushSubscription(principal, endpoint);
    return Response.json(await dailyPushStatus(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_push_subscription_failed" }, { status: 400 });
  }
}
