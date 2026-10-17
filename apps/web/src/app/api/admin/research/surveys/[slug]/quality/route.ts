import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import {
  researchQualityReviewPendingCount,
  researchQualityReviewQueue,
  resolveResearchQualityReview
} from "../../../../../../../lib/research-survey-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { permission: "research.read" });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    const requestedOffset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
    const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0
      ? Math.min(requestedOffset, 100000) : 0;
    const [items, total] = await Promise.all([
      researchQualityReviewQueue(principal, slug, offset),
      researchQualityReviewPendingCount(principal, slug)
    ]);
    return Response.json({ items, total, pageSize: 50 }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_QA_LOAD_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.manage" });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    const body = await request.json() as Record<string, unknown>;
    const decision = body.decision === "include" ? "include" : body.decision === "exclude" ? "exclude" : undefined;
    if (!decision) {
      return Response.json({ error: "RESEARCH_QA_DECISION_INVALID" }, { status: 400 });
    }

    const result = await resolveResearchQualityReview(principal, {
      slug,
      responseId: String(body.responseId ?? ""),
      decision,
      note: typeof body.note === "string" ? body.note : undefined
    });
    await recordAdminAudit(
      principal,
      "research.quality_review.resolved",
      "research_response",
      result.responseId,
      "Resolve research response quality review",
      { studySlug: slug, decision: result.decision }
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_QA_RESOLVE_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401
        : message === "RESEARCH_QA_RESPONSE_NOT_FOUND" ? 404
          : message === "RESEARCH_QA_ALREADY_RESOLVED" ? 409
            : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
