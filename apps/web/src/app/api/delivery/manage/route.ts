import {
  approveRedModeAsManager,
  deliveryManagerControlWorkspace,
  requestRedModeAsManager,
  runDeliveryDispatchNow,
} from "../../../../lib/delivery-control-runtime";
import { requireDeliveryManagerSession } from "../../../../lib/delivery-manager-session";

export async function GET(request: Request) {
  try {
    const principal = await requireDeliveryManagerSession(request, false);
    return Response.json(await deliveryManagerControlWorkspace(principal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_manager_auth_required" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireDeliveryManagerSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "run_dispatch") return Response.json(await runDeliveryDispatchNow());
    if (action === "request_red_mode") return Response.json(await requestRedModeAsManager(
      principal,
      String(body.reason ?? ""),
      body.scope && typeof body.scope === "object" && !Array.isArray(body.scope) ? body.scope as Record<string, unknown> : {},
      Number(body.expiresMinutes ?? 30),
    ));
    if (action === "approve_red_mode") return Response.json(await approveRedModeAsManager(principal, String(body.requestId ?? "")));
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_manager_operation_failed" }, { status: 400 });
  }
}
