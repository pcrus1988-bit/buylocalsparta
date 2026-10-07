import { refusePublicResearchInvite, savePublicResearchSurvey, updatePublicResearchConsents } from "../../../../../../lib/research-survey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusFor(message: string): number {
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("EXPIRED") || message.includes("INVITE_CLOSED")) return 410;
  if (message.includes("ALREADY_COMPLETED") || message.includes("RESPONSE_CLOSED")) return 409;
  if (message.includes("DATABASE_UNAVAILABLE")) return 503;
  if (message.includes("NOT_OPEN")) return 403;
  return 400;
}

export async function POST(request: Request, context: { params: Promise<{ slug: string; token: string }> }) {
  try {
    const { slug, token } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "preferences") {
      const result = await updatePublicResearchConsents({
        slug,
        token,
        optionalConsents: body.optionalConsents && typeof body.optionalConsents === "object" && !Array.isArray(body.optionalConsents)
          ? body.optionalConsents as never
          : {}
      });
      return Response.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }
    if (body.action === "refuse") {
      const result = await refusePublicResearchInvite({
        slug,
        token,
        suppressFutureResearch: body.suppressFutureResearch === true
      });
      return Response.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }
    const result = await savePublicResearchSurvey({
      slug,
      token,
      researchConsent: body.researchConsent === true,
      complete: body.complete === true,
      answers: body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? body.answers as never
        : undefined,
      experimentChoices: body.experimentChoices && typeof body.experimentChoices === "object" && !Array.isArray(body.experimentChoices)
        ? body.experimentChoices as never
        : undefined
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SURVEY_SAVE_FAILED";
    return Response.json({ error: message }, {
      status: statusFor(message),
      headers: { "Cache-Control": "no-store" }
    });
  }
}
