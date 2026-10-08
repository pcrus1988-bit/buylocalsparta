import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import {
  createResearchSurveyDesignRevision,
  deleteResearchQuestionDraft,
  lockResearchAnalysisPlanDraft,
  moveResearchQuestionDraft,
  saveResearchAnalysisPlanDraft,
  saveResearchLaterEvaluation,
  saveResearchQuestionDraft,
  updateResearchStudyDraftSettings,
  updateResearchPilotDeadline,
  type ResearchQuestionDraftInput
} from "../../../../../../../lib/research-survey-admin-design";
import type { ResearchQuestionType } from "../../../../../../../lib/research-survey-model";
import { transitionResearchStudy, type ResearchLifecycleAction } from "../../../../../../../lib/research-survey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIFECYCLE_ACTIONS = new Set<ResearchLifecycleAction>([
  "lock_instrument", "start_pilot", "start_fielding", "close_fieldwork", "begin_analysis", "publish_release"
]);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.read" });
    const { slug: encodedSlug } = await context.params;
    const slug = decodeURIComponent(encodedSlug);
    const body = await request.json() as Record<string, unknown>;
    const action = stringValue(body.action);

    if (LIFECYCLE_ACTIONS.has(action as ResearchLifecycleAction)) {
      const result = await transitionResearchStudy(principal, { slug, action: action as ResearchLifecycleAction });
      await recordAdminAudit(principal, "research.lifecycle.transition", "research_study", slug, action, result);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "create_revision") {
      const result = await createResearchSurveyDesignRevision(principal, slug);
      await recordAdminAudit(principal, "research.design.revision", "research_study", slug, "Created editable survey design revision", result);
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "save_question") {
      const raw = objectValue(body.question);
      const question: ResearchQuestionDraftInput = {
        id: stringValue(raw.id) || undefined,
        code: stringValue(raw.code),
        sectionCode: stringValue(raw.sectionCode),
        type: stringValue(raw.type) as ResearchQuestionType,
        prompt: stringValue(raw.prompt),
        help: stringValue(raw.help) || undefined,
        required: raw.required !== false,
        analysisKey: stringValue(raw.analysisKey),
        config: objectValue(raw.config)
      };
      const result = await saveResearchQuestionDraft(principal, slug, question);
      await recordAdminAudit(principal, "research.question.save", "research_question", result.id, question.code, { slug });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "delete_question") {
      const questionId = stringValue(body.questionId);
      if (!questionId) return Response.json({ error: "RESEARCH_QUESTION_ID_REQUIRED" }, { status: 400 });
      const result = await deleteResearchQuestionDraft(principal, slug, questionId);
      await recordAdminAudit(principal, "research.question.delete", "research_question", questionId, "Deleted question from draft", { slug });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "move_question") {
      const questionId = stringValue(body.questionId);
      const direction = stringValue(body.direction);
      if (!questionId || !["up", "down"].includes(direction)) {
        return Response.json({ error: "RESEARCH_QUESTION_MOVE_INVALID" }, { status: 400 });
      }
      const result = await moveResearchQuestionDraft(principal, slug, questionId, direction as "up" | "down");
      await recordAdminAudit(principal, "research.question.move", "research_question", questionId, direction, { slug });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "save_study_settings") {
      await updateResearchStudyDraftSettings(principal, slug, {
        title: stringValue(body.title),
        subtitle: stringValue(body.subtitle) || undefined,
        populationDefinition: stringValue(body.populationDefinition),
        methodologySummary: stringValue(body.methodologySummary),
        defaultLocale: stringValue(body.defaultLocale),
        fieldworkEndsAt: stringValue(body.fieldworkEndsAt) || undefined,
        publicResultsUrl: stringValue(body.publicResultsUrl) || undefined
      });
      await recordAdminAudit(principal, "research.study.settings.update", "research_study", slug, "Updated draft survey settings", {});
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "save_pilot_deadline") {
      const changed = await updateResearchPilotDeadline(principal, slug, stringValue(body.fieldworkEndsAt));
      await recordAdminAudit(
        principal, "research.study.pilot_deadline.set", "research_study", slug,
        "Set Athens-time fieldwork deadline during Pilot before invitations",
        { previousDeadline: changed.previousDeadline ?? null, newDeadline: changed.newDeadline }
      );
      return Response.json({ ok: true, deadline: changed.newDeadline }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "save_analysis_plan") {
      const result = await saveResearchAnalysisPlanDraft(principal, slug, {
        title: stringValue(body.title),
        plan: objectValue(body.plan)
      });
      await recordAdminAudit(principal, "research.analysis_plan.save", "research_study", slug, "Updated draft evaluation plan", { contentSha256: result.contentSha256 });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "lock_analysis_plan") {
      const result = await lockResearchAnalysisPlanDraft(principal, slug);
      await recordAdminAudit(principal, "research.analysis_plan.lock", "research_study", slug, result.version, { contentSha256: result.contentSha256 });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "save_later_evaluation") {
      const result = await saveResearchLaterEvaluation(principal, slug, {
        priorEventId: stringValue(body.priorEventId) || undefined,
        title: stringValue(body.title),
        researchQuestion: stringValue(body.researchQuestion),
        metricKey: stringValue(body.metricKey),
        method: stringValue(body.method),
        segments: Array.isArray(body.segments) ? body.segments.map(stringValue) : [],
        filters: stringValue(body.filters) || undefined,
        interpretation: stringValue(body.interpretation) || undefined,
        publicationLabel: stringValue(body.publicationLabel) || undefined
      });
      await recordAdminAudit(principal, "research.later_evaluation.save", "research_study", slug, stringValue(body.title), {
        eventId: result.eventId,
        definitionId: result.definitionId,
        revision: result.revision,
        classification: "exploratory_post_registration",
        contentSha256: result.contentSha256
      });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "RESEARCH_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_ADMIN_ACTION_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message === "RESEARCH_STUDY_NOT_FOUND" ? 404 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
