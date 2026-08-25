import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminLocalDeliverySettings, updateAdminLocalDeliverySettings } from "../../../../../lib/admin-local-delivery-service";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request, { permission: "fulfilment.read" });
    return Response.json(await adminLocalDeliverySettings(principal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_auth_required" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "fulfilment.write" });
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await updateAdminLocalDeliverySettings(principal, {
      active: body.active !== false,
      postcodePrefixes: body.postcodePrefixes,
      baseChargeMinor: body.baseChargeMinor,
      freeAboveSubtotalMinor: body.freeAboveSubtotalMinor,
      minimumSubtotalMinor: body.minimumSubtotalMinor,
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "local_delivery_settings_failed" }, { status: 400 });
  }
}
