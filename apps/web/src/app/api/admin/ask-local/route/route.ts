import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminAskLocalWorkspace, adminRouteAskLocalRequest } from "../../../../../lib/ask-local-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true });
    const body = await request.json() as Record<string, unknown>;
    await adminRouteAskLocalRequest(principal, {
      requestId: typeof body.requestId === "string" ? body.requestId : "",
      vendorId: typeof body.vendorId === "string" ? body.vendorId : "",
      category: typeof body.category === "string" ? body.category : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return Response.json(await adminAskLocalWorkspace(principal));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_admin_route_failed";
    return Response.json({ error: message }, { status: message === "ADMIN_AUTH_REQUIRED" ? 401 : 400 });
  }
}
