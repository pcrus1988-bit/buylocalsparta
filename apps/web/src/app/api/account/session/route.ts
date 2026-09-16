import { accountHomeDashboard } from "../../../../lib/account-home-view";
import { requireAccountSession } from "../../../../lib/account-session";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json(await accountHomeDashboard(principal), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
