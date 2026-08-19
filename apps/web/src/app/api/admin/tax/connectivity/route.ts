import { adminAadeConnectivity } from "../../../../../lib/admin-tax-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true });
    const result = await adminAadeConnectivity(principal);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "aade_connectivity_failed" }, { status: 400 });
  }
}
