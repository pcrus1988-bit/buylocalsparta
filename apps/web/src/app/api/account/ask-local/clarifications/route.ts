import { getAccountSession, requireAccountSession } from "../../../../../lib/account-session";
import { customerAskLocalRequests } from "../../../../../lib/ask-local-service";
import { askLocalClarificationMessages, customerReplyAskLocalClarification } from "../../../../../lib/ask-local-clarification-service";
import { customerAskLocalRequestViews } from "../../../../../lib/customer-ask-local-view";

export async function GET(request: Request) {
  try {
    const principal = await getAccountSession();
    if (!principal?.roles.includes("customer")) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const requestId = new URL(request.url).searchParams.get("requestId")?.trim() ?? "";
    if (!requestId) throw new Error("Ask Local request is required");
    const messages = await askLocalClarificationMessages(principal, requestId);
    return Response.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_clarification_load_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    if (!principal.roles.includes("customer")) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const body = await request.json() as { requestId?: unknown; reply?: unknown };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const reply = typeof body.reply === "string" ? body.reply : "";
    if (!requestId) throw new Error("Ask Local request is required");
    await customerReplyAskLocalClarification(principal, { requestId, reply });
    const [messages, requests] = await Promise.all([
      askLocalClarificationMessages(principal, requestId),
      customerAskLocalRequests(principal)
    ]);
    return Response.json({ messages, requests: customerAskLocalRequestViews(requests) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_clarification_reply_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
