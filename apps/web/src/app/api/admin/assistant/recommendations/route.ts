import { adminAssistantEnabled } from "../../../../../lib/admin-assistant/config";
import { setRecommendationLifecycleState } from "../../../../../lib/admin-assistant/recommendation-lifecycle";
import type { AdminAssistantRecommendationState } from "../../../../../lib/admin-assistant/types";
import { requireAdminSession } from "../../../../../lib/admin-session";

const ALLOWED_STATES = new Set<AdminAssistantRecommendationState>(["active", "dismissed", "snoozed", "intentional"]);

export async function POST(request: Request) {
  try {
    if (!adminAssistantEnabled()) return Response.json({ error: "Assistant disabled" }, { status: 404 });
    const principal = await requireAdminSession(request, { csrf: true });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const recommendationKey = typeof body.recommendationKey === "string" ? body.recommendationKey.trim().slice(0, 240) : "";
    const state = typeof body.state === "string" ? body.state as AdminAssistantRecommendationState : undefined;
    const snoozedUntil = typeof body.snoozedUntil === "number" ? body.snoozedUntil : undefined;
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : undefined;
    if (!recommendationKey) return Response.json({ error: "Recommendation key is required" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    if (!state || !ALLOWED_STATES.has(state)) return Response.json({ error: "Invalid recommendation state" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const updated = await setRecommendationLifecycleState(principal, { recommendationKey, state, snoozedUntil, reason });
    return Response.json({ recommendation: updated }, { headers: { "cache-control": "private, no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "assistant_recommendation_state_failed";
    const status = message === "ASSISTANT_RECOMMENDATION_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: message }, { status, headers: { "cache-control": "private, no-store" } });
  }
}
