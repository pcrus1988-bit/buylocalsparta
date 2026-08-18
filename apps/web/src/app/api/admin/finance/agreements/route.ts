import { requireAdminSession } from "../../../../../lib/admin-session";
import { changeCommercialAgreementStatus, commercialAgreementWorkspace, createCommercialAgreement } from "../../../../../lib/admin-commercial-agreements";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "finance.read" });
    return Response.json(await commercialAgreementWorkspace());
  } catch (error) {
    const message = error instanceof Error ? error.message : "agreements_load_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "finance.write" });
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "create";
    if (action === "create") await createCommercialAgreement(principal, body);
    else if (action === "status") await changeCommercialAgreementStatus(principal, body);
    else throw new Error("Unsupported agreement action");
    return Response.json(await commercialAgreementWorkspace());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "agreement_action_failed" }, { status: 400 });
  }
}
