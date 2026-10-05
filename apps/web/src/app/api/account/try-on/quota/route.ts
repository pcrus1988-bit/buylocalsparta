import { requireAccountSession } from "../../../../../lib/account-session";
import { customerTryOnMonthlyQuota } from "../../../../../lib/customer-state-runtime";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const quota = await customerTryOnMonthlyQuota({ userId: principal.userId, now: Date.now() });
    return Response.json({ quota }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_QUOTA_FAILED";
    return Response.json({ error: message }, {
      status: message === "AUTH_REQUIRED" ? 401 : 500,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
