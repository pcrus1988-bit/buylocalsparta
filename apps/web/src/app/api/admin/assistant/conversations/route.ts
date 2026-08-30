import { adminAssistantEnabled } from "../../../../../lib/admin-assistant/config";
import { getAssistantConversationMessages, listAssistantConversations } from "../../../../../lib/admin-assistant/repository";
import { requireAdminSession } from "../../../../../lib/admin-session";

export async function GET(request: Request) {
  try {
    if (!adminAssistantEnabled()) return Response.json({ error: "Assistant disabled" }, { status: 404 });
    const principal = await requireAdminSession();
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("id")?.trim();
    if (conversationId) return Response.json({ messages: await getAssistantConversationMessages(principal, conversationId, 120) }, { headers: { "cache-control": "private, no-store" } });
    return Response.json({ conversations: await listAssistantConversations(principal, 30) }, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "assistant_history_failed" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  }
}
