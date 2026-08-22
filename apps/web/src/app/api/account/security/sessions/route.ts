import { requireAccountSession } from "../../../../../lib/account-session";
import { customerActiveSessions, revokeOtherCustomerSessions } from "../../../../../lib/customer-session-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const sessions = await customerActiveSessions(principal);
    return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "AUTH_REQUIRED";
    return Response.json({ error: auth ? "Απαιτείται σύνδεση." : "Οι ενεργές συνεδρίες δεν φορτώθηκαν." }, { status: auth ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const result = await revokeOtherCustomerSessions(principal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "AUTH_REQUIRED";
    return Response.json({ error: auth ? "Απαιτείται σύνδεση." : error instanceof Error ? error.message : "Οι άλλες συνεδρίες δεν αποσυνδέθηκαν." }, { status: auth ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
