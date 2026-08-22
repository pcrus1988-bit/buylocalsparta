import { requireAccountSession } from "../../../../lib/account-session";
import { updateCustomerPreferences } from "../../../../lib/customer-state-runtime";
import { customerBrowserPreferences } from "../../../../lib/customer-account-browser-view";

export async function PUT(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as { recommendationsEnabled?: unknown; recentlyViewedEnabled?: unknown };
    const preferences = await updateCustomerPreferences({
      userId: principal.userId,
      recommendationsEnabled: typeof body.recommendationsEnabled === "boolean" ? body.recommendationsEnabled : undefined,
      recentlyViewedEnabled: typeof body.recentlyViewedEnabled === "boolean" ? body.recentlyViewedEnabled : undefined,
      now: Date.now()
    });
    return Response.json({ preferences: customerBrowserPreferences(preferences) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preferences_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
