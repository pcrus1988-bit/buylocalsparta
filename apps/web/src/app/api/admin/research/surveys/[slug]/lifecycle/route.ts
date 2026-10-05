import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { transitionResearchStudy, type ResearchLifecycleAction } from "../../../../../../../lib/research-survey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<ResearchLifecycleAction>([
  "lock_instrument", "start_pilot", "start_fielding", "close_fieldwork", "begin_analysis"
]);

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.manage" });
    const { slug } = await context.params;
    const body = await request.json() as { action?: string };
    if (!body.action || !ACTIONS.has(body.action as ResearchLifecycleAction)) {
      return Response.json({ error: "RESEARCH_ACTION_INVALID" }, { status: 400 });
    }
    const result = await transitionResearchStudy(principal, {
      slug: decodeURIComponent(slug),
      action: body.action as ResearchLifecycleAction
    });
    await recordAdminAudit(principal, "research.lifecycle.transition", "research_study", slug, body.action, result);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_LIFECYCLE_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message === "RESEARCH_STUDY_NOT_FOUND" ? 404 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
