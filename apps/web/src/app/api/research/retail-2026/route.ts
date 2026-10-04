import { cookies } from "next/headers";
import { RETAIL_STUDY_2026_DEFINITION } from "../../../lib/retail-study-2026";
import {
  RETAIL_STUDY_COOKIE,
  getRetailStudyParticipantState,
  requestKontaMouInformation,
  startRetailStudyResponse,
  submitRetailStudyResponse
} from "../../../lib/retail-study-2026-runtime";

export const dynamic = "force-dynamic";

async function invitationToken(): Promise<string> {
  const store = await cookies();
  return store.get(RETAIL_STUDY_COOKIE)?.value?.trim() ?? "";
}

export async function GET() {
  try {
    const token = await invitationToken();
    if (!token) return Response.json({ error: "INVITATION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const state = await getRetailStudyParticipantState(token);
    if (!state) return Response.json({ error: "INVITATION_INVALID" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({
      instrument: {
        title: RETAIL_STUDY_2026_DEFINITION.title,
        introduction: RETAIL_STUDY_2026_DEFINITION.introduction,
        estimatedMinutes: RETAIL_STUDY_2026_DEFINITION.estimatedMinutes,
        questions: RETAIL_STUDY_2026_DEFINITION.questions
      },
      state
    }, { status: 200, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "retail_study.state_failed", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "RESEARCH_STATE_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const token = await invitationToken();
    if (!token) return Response.json({ error: "INVITATION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const body = await request.json().catch(() => null) as { action?: string; answers?: Record<string, unknown> } | null;
    if (!body?.action) return Response.json({ error: "ACTION_REQUIRED" }, { status: 400 });

    if (body.action === "start") {
      const state = await startRetailStudyResponse(token);
      return Response.json({ state }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "submit") {
      const state = await submitRetailStudyResponse(token, body.answers ?? {});
      return Response.json({ state }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "request_konta_mou_information") {
      const pending = await requestKontaMouInformation(token);
      return Response.json({ accepted: true, confirmationRequired: true, confirmationPrepared: Boolean(pending.confirmationToken) }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "ACTION_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /INVALID|required|NOT_FOUND|NOT_ACTIVE|MUST_BE_COMPLETED|FIELDWORK/i.test(message) ? 400 : 500;
    console.error(JSON.stringify({ level: "error", event: "retail_study.action_failed", message }));
    return Response.json({ error: message.split(":")[0] || "RESEARCH_ACTION_FAILED" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
