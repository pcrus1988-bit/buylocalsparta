import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { previewResearchRecruitmentEmail } from "../../../../../../../lib/research-survey-mail";
import { ABANDONED_RESEARCH_FOLLOWUP_SUBJECT, ABANDONED_RESEARCH_FOLLOWUP_BODY } from "../../../../../../../lib/research-survey-abandoned-followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  try {
    await requireAdminSession(request, { csrf: true, permission: "research.read" });
    const { slug } = await context.params;
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)) {
      return Response.json({ error: "Invalid survey" }, { status: 400 });
    }
    const raw = await request.text();
    if (raw.length > 30000) return Response.json({ error: "Preview too large" }, { status: 413 });
    const input = JSON.parse(raw) as Record<string, unknown>;
    const pick = (key: string, max: number) =>
      typeof input[key] === "string" ? (input[key] as string).slice(0, max) : "";
    const purpose = pick("purpose", 40);
    if (purpose !== "research_invitation" && purpose !== "research_reminder" && purpose !== "abandoned_followup") {
      return Response.json({ error: "Invalid preview type" }, { status: 400 });
    }
    const surveyUrl = "https://kontamou.site/research/" + encodeURIComponent(slug) + "/t/DEMO-PREVIEW-ONLY";
    const preview = previewResearchRecruitmentEmail({
      studyTitle: pick("studyTitle", 300),
      subjectTemplate: purpose === "abandoned_followup" ? ABANDONED_RESEARCH_FOLLOWUP_SUBJECT : pick("subject", 180),
      bodyTemplate: purpose === "abandoned_followup" ? ABANDONED_RESEARCH_FOLLOWUP_BODY : pick("bodyText", 12000),
      companyName: pick("companyName", 300),
      surveyUrl,
      methodologyUrl: "https://kontamou.site/research/" + encodeURIComponent(slug) + "/methodology",
      attemptKind: purpose === "research_invitation" ? "initial" : "reminder"
    });
    return Response.json(preview, {
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed";
    return Response.json({ error: message }, { status: /AUTH|CSRF|permission/i.test(message) ? 403 : 400 });
  }
}
