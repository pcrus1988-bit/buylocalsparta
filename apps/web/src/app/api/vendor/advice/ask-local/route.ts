import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorAdviceWorkspace, vendorReturnAskLocalRequest } from "../../../../../lib/vendor-backoffice-service";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    await vendorReturnAskLocalRequest(principal, typeof body.requestId === "string" ? body.requestId : "", typeof body.reason === "string" ? body.reason : "");
    return Response.json(await vendorAdviceWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ask_local_vendor_return_failed" }, { status: 400 });
  }
}
