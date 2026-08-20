import { requireDailySession } from "../../../../../lib/daily-session";
import { vendorAdviceWorkspace, vendorSendAdviceMessage } from "../../../../../lib/vendor-backoffice-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as { conversationId?: unknown; body?: unknown };
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const message = typeof body.body === "string" ? body.body.trim() : "";
    if (!conversationId || !message) throw new Error("Conversation and message are required");
    await vendorSendAdviceMessage(principal, conversationId, message);
    return Response.json(await vendorAdviceWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "advice_message_failed" }, { status: 400 });
  }
}
