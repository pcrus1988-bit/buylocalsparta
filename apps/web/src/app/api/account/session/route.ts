import { accountDashboard } from "../../../../lib/account-view";
import { requireAccountSession } from "../../../../lib/account-session";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json(await accountDashboard(principal));
  } catch {
    return Response.json({ authenticated: false }, { status: 401 });
  }
}
