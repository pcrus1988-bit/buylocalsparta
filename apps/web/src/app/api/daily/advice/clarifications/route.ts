import { requireDailySession } from "../../../../../lib/daily-session";
import { vendorRequestAskLocalClarification } from "../../../../../lib/ask-local-clarification-service";
import { vendorAdviceWorkspace } from "../../../../../lib/vendor-backoffice-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { requestId?: unknown; question?: unknown };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const question = typeof body.question === "string" ? body.question : "";
    if (!requestId) throw new Error("Ask Local request is required");
    await vendorRequestAskLocalClarification(principal, { requestId, question });
    return Response.json(await vendorAdviceWorkspace(principal));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_clarification_failed";
    return Response.json({ error: message }, { status: message === "VENDOR_REQUIRED" ? 403 : 400 });
  }
}
