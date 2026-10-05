import { accountHomeDashboard } from "../../../../lib/account-home-view";
import { requireAccountSession } from "../../../../lib/account-session";
import { customerTryOnGenerationConfigured } from "../../../../lib/try-on-config";
import { customerTryOnBrowserStorageScope } from "../../../../lib/try-on-security";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const dashboard = await accountHomeDashboard(principal);
    return Response.json({
      ...dashboard,
      tryOnStorageScope: customerTryOnBrowserStorageScope(principal.userId),
      tryOnAvailable: customerTryOnGenerationConfigured()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
