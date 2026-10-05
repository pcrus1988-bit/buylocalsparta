import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import {
  queueGreekRetailFrameBuild,
  queueGreekRetailSampleDraw
} from "../../../../../../../lib/research-survey-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  targetN?: number;
  randomSeed?: string;
  label?: string;
};

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.manage" });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    if (slug !== "greek-retail-2026") {
      return Response.json({ error: "RESEARCH_JOB_STUDY_UNSUPPORTED" }, { status: 400 });
    }
    const body = await request.json() as Body;

    if (body.action === "build_frame") {
      const result = await queueGreekRetailFrameBuild(principal);
      await recordAdminAudit(
        principal,
        "research.frame.queued",
        "research_study",
        slug,
        "Queue governed G.E.MI. frame snapshot",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "draw_sample") {
      const result = await queueGreekRetailSampleDraw(principal, {
        targetN: Number(body.targetN),
        randomSeed: body.randomSeed,
        label: body.label
      });
      await recordAdminAudit(
        principal,
        "research.sample.queued",
        "research_study",
        slug,
        "Queue reproducible stratified sample draw",
        { jobId: result.jobId, targetN: Number(body.targetN), randomSeed: result.randomSeed }
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "RESEARCH_JOB_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_JOB_QUEUE_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message === "RESEARCH_STUDY_NOT_FOUND" ? 404 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
