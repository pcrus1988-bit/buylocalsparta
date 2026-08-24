import { requireAccountSession } from "../../../../lib/account-session";
import { customerCartRecoveryPreference, setCustomerCartRecoveryPreference } from "../../../../lib/customer-cart-recovery-preference";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json({ enabled: await customerCartRecoveryPreference(principal) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preference_read_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") throw new Error("Μη έγκυρη ρύθμιση.");
    return Response.json({ enabled: await setCustomerCartRecoveryPreference(principal, body.enabled) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preference_update_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
