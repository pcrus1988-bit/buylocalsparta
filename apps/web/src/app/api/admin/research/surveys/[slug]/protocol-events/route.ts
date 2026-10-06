import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { recordResearchProtocolEvent } from "../../../../../../../lib/research-survey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.read" });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    const body = await request.json() as Record<string, unknown>;
    const result = await recordResearchProtocolEvent(principal, {
      slug,
      eventType: String(body.eventType ?? "") as "deviation" | "amendment" | "resolution",
      lifecyclePhase: String(body.lifecyclePhase ?? "") as "design" | "pilot" | "main" | "analysis" | "publication",
      category: String(body.category ?? "") as "instrument" | "sampling" | "recruitment" | "fieldwork" | "privacy" | "analysis" | "publication" | "operations",
      severity: String(body.severity ?? "") as "info" | "minor" | "material" | "critical",
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      rationale: String(body.rationale ?? ""),
      impactAssessment: String(body.impactAssessment ?? ""),
      correctiveAction: String(body.correctiveAction ?? ""),
      relatedEventId: String(body.relatedEventId ?? ""),
      occurredAt: body.occurredAt ? String(body.occurredAt) : undefined
    });
    await recordAdminAudit(
      principal,
      "research.protocol_event.recorded",
      "research_study",
      slug,
      String(body.eventType ?? "protocol_event"),
      { ...result, lifecyclePhase: body.lifecyclePhase, category: body.category, severity: body.severity }
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_PROTOCOL_EVENT_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message.includes("NOT_FOUND") ? 404 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
