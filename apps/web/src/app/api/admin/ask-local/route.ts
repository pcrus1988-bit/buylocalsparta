import { adminAssignAskLocal } from "../../../../lib/admin-ask-local";
import { requireAdminSession } from "../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "customer.manage" });
    const body = await request.json() as Record<string, unknown>;
    const owner = String(body.owner ?? "");
    if (owner !== "admin" && owner !== "vendor") throw new Error("Choose Admin or vendor ownership");
    const result = await adminAssignAskLocal(principal, {
      requestId: String(body.requestId ?? ""),
      owner,
      vendorId: typeof body.vendorId === "string" ? body.vendorId : undefined,
      reason: String(body.reason ?? "")
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ask_local_assignment_failed" }, { status: 400 });
  }
}
