import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminSlaPolicyWorkspace, saveAdminSlaPolicy } from "../../../../../../lib/order-sla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "finance.read" });
    return Response.json(await adminSlaPolicyWorkspace(), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sla_policy_load_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "finance.write" });
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await saveAdminSlaPolicy(principal, body), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sla_policy_save_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
