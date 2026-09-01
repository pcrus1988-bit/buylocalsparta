import { adminAssistantEnabled, adminAssistantProactiveEnabled } from "../../../../../lib/admin-assistant/config";
import { parseAssistantClientContext } from "../../../../../lib/admin-assistant/context";
import { buildAdminAssistantPhase1Snapshot } from "../../../../../lib/admin-assistant/phase1-snapshot";
import { requireAdminSession } from "../../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    if (!adminAssistantEnabled()) return Response.json({ error: "Assistant disabled" }, { status: 404 });
    const principal = await requireAdminSession(request, { csrf: true });
    const body = await request.json().catch(() => ({}));
    const context = parseAssistantClientContext(body);
    const snapshot = await buildAdminAssistantPhase1Snapshot(principal, context);
    return Response.json({ snapshot, proactive: adminAssistantProactiveEnabled() }, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "assistant_context_failed" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  }
}
