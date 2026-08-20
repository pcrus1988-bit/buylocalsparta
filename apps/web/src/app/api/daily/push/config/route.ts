import { requireDailySession } from "../../../../../lib/daily-session";
import { dailyPushStatus } from "../../../../../lib/daily-push";

export async function GET() {
  try {
    const principal = await requireDailySession();
    return Response.json({ ...(await dailyPushStatus(principal)), csrfToken: principal.csrfToken });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_push_config_failed" }, { status: 403 });
  }
}
