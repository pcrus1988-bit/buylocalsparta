import { adminAssignDeliveryJob, adminCreateDeliveryDriver, adminResetDeliveryDriverPassword, adminSetDeliveryDriverStatus, synchronizeDeliveryJobs } from "../../../../lib/delivery-driver-runtime";
import {
  approveRedModeAsAdmin,
  deliveryAdminControlWorkspace,
  grantDeliveryManager,
  requestRedModeAsAdmin,
  revokeDeliveryManager,
  runDeliveryDispatchNow,
} from "../../../../lib/delivery-control-runtime";
import { requireAdminSession } from "../../../../lib/admin-session";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request, { permission: "fulfilment.read" });
    return Response.json(await deliveryAdminControlWorkspace(principal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_auth_required" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "fulfilment.write" });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "create_driver") return Response.json(await adminCreateDeliveryDriver(principal, {
      partnerName: String(body.partnerName ?? ""), displayName: String(body.displayName ?? ""), email: String(body.email ?? ""),
      phone: String(body.phone ?? ""), password: String(body.password ?? ""),
    }));
    if (action === "set_driver_status") return Response.json(await adminSetDeliveryDriverStatus(principal, {
      driverId: String(body.driverId ?? ""), status: String(body.status ?? "") as "active" | "inactive" | "suspended",
    }));
    if (action === "reset_password") return Response.json(await adminResetDeliveryDriverPassword(principal, {
      driverId: String(body.driverId ?? ""), password: String(body.password ?? ""),
    }));
    if (action === "assign_job") return Response.json(await adminAssignDeliveryJob(principal, {
      jobId: String(body.jobId ?? ""), driverId: String(body.driverId ?? ""),
    }));
    if (action === "sync") { await synchronizeDeliveryJobs(); return Response.json({ ok: true }); }
    if (action === "run_dispatch") return Response.json(await runDeliveryDispatchNow());
    if (action === "grant_manager") return Response.json(await grantDeliveryManager(principal, String(body.email ?? "")));
    if (action === "revoke_manager") return Response.json(await revokeDeliveryManager(principal, String(body.managerId ?? "")));
    if (action === "request_red_mode") return Response.json(await requestRedModeAsAdmin(
      principal,
      String(body.reason ?? ""),
      body.scope && typeof body.scope === "object" && !Array.isArray(body.scope) ? body.scope as Record<string, unknown> : {},
      Number(body.expiresMinutes ?? 30),
    ));
    if (action === "approve_red_mode") return Response.json(await approveRedModeAsAdmin(principal, String(body.requestId ?? "")));
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_admin_operation_failed" }, { status: 400 });
  }
}
