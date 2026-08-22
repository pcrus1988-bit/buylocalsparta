import { accountDashboard } from "../../../../lib/account-view";
import { requireAccountSession } from "../../../../lib/account-session";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json(await accountDashboard(principal), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
