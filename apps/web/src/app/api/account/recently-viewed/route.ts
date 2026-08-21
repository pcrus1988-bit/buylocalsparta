import { requireAccountSession } from "../../../../lib/account-session";
import { clearCustomerRecentlyViewed } from "../../../../lib/customer-recent-history";

export async function DELETE(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const removed = await clearCustomerRecentlyViewed(principal);
    return Response.json({ removed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "recent_history_clear_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
