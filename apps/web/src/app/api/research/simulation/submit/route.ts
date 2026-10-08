import {
  createSimulationReceipt, readSimulationToken
} from "../../../../../lib/research-workflow-simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try {
    const raw = await request.text();
    if (raw.length > 5000) throw new Error("SIMULATION_INPUT_TOO_LARGE");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const token = typeof data.token === "string" ? data.token : "";
    const invitation = readSimulationToken(token, "invitation");
    const answers = data.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      throw new Error("SIMULATION_ANSWERS_INVALID");
    }
    const receipt = createSimulationReceipt(invitation, answers as Record<string, string>);
    return Response.json({
      ok: true, receipt, runId: invitation.runId,
      submittedAt: new Date().toISOString(),
      notice: "Test answers validated but never inserted into Research tables."
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SIMULATION_SUBMISSION_FAILED";
    return Response.json({ error: message }, {
      status: message.includes("EXPIRED") ? 410 : 400, headers
    });
  }
}
