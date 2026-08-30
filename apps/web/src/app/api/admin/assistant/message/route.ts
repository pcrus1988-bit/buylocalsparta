import { adminAssistantEnabled } from "../../../../../lib/admin-assistant/config";
import { parseAssistantClientContext } from "../../../../../lib/admin-assistant/context";
import { buildAdminAssistantIntelligenceSnapshot } from "../../../../../lib/admin-assistant/intelligence";
import { consumeAdminAssistantRateLimit } from "../../../../../lib/admin-assistant/rate-limit";
import { answerAdminAssistant } from "../../../../../lib/admin-assistant/service";
import { boundedText } from "../../../../../lib/admin-assistant/types";
import { ensureAssistantConversation, getAssistantConversationMessages, saveAssistantMessage } from "../../../../../lib/admin-assistant/repository";
import { requireAdminSession } from "../../../../../lib/admin-session";

function titleFor(question: string): string { return question.replace(/\s+/g, " ").trim().slice(0, 80) || "Admin investigation"; }

export async function POST(request: Request) {
  try {
    if (!adminAssistantEnabled()) return Response.json({ error: "Assistant disabled" }, { status: 404 });
    const principal = await requireAdminSession(request, { csrf: true });
    const limit = consumeAdminAssistantRateLimit(principal.userId);
    if (!limit.allowed) return Response.json({ error: "Assistant rate limit reached", retryAfterMs: limit.retryAfterMs }, { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1_000)) } });
    const body = await request.json() as Record<string, unknown>;
    const question = boundedText(body.message, 4_000);
    if (!question) return Response.json({ error: "Message is required" }, { status: 400 });
    const clientContext = parseAssistantClientContext(body.context);
    const snapshot = await buildAdminAssistantIntelligenceSnapshot(principal, clientContext);
    const conversation = await ensureAssistantConversation(principal, { conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined, title: titleFor(question), context: snapshot.context });
    await saveAssistantMessage(principal, conversation.id, { role: "user", content: question, context: snapshot.context });
    const history = await getAssistantConversationMessages(principal, conversation.id, 16);
    const answer = await answerAdminAssistant(principal, { question, snapshot, history, conversationId: conversation.id, signal: request.signal });
    const stored = await saveAssistantMessage(principal, conversation.id, { role: "assistant", content: answer.summary, structured: answer, context: snapshot.context });
    return Response.json({ conversationId: conversation.id, message: stored, answer, snapshot }, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "assistant_message_failed" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  }
}
