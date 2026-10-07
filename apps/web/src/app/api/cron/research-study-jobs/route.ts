import { processResearchStudyJobs, type ResearchJobType } from "../../../../../lib/research-survey-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

const EMAIL_JOB_TYPES: readonly ResearchJobType[] = [
  "invite_batch",
  "invite_reminder",
  "reward_delivery",
  "results_notification"
];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processResearchStudyJobs(1, EMAIL_JOB_TYPES);
    return Response.json(
      { ok: true, ...result },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "research_job_cron_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "research.job_cron_failed",
      message
    }));
    return Response.json({ error: message }, { status: 500 });
  }
}
