import { requireDailySession } from "../../../../../../lib/daily-session";
import { vendorSendAskLocalMessage } from "../../../../../../lib/ask-local-clarification-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { requestId?: unknown; body?: unknown; imageDataUrl?: unknown };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const message = typeof body.body === "string" ? body.body : "";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : undefined;
    if (!requestId) throw new Error("Ask Local request is required");
    await vendorSendAskLocalMessage(principal, { requestId, body: message, imageDataUrl });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_vendor_message_failed";
    return Response.json({ error: message }, { status: message === "VENDOR_REQUIRED" ? 403 : 400 });
  }
}
