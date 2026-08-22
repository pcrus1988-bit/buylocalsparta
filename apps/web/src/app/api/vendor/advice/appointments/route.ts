import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorAdviceWorkspace } from "../../../../../lib/vendor-backoffice-service";
import { vendorAppointmentLifecycleAction, type VendorAppointmentAction } from "../../../../../lib/vendor-appointments-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { appointmentId?: unknown; action?: unknown };
    const action = typeof body.action === "string" && ["complete", "cancel", "no_show"].includes(body.action)
      ? body.action as VendorAppointmentAction
      : undefined;
    if (!action) throw new Error("Unsupported appointment action");
    await vendorAppointmentLifecycleAction(principal, typeof body.appointmentId === "string" ? body.appointmentId : "", action);
    return Response.json(await vendorAdviceWorkspace(principal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "appointment_action_failed";
    return Response.json({ error: message }, { status: message === "VENDOR_AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
