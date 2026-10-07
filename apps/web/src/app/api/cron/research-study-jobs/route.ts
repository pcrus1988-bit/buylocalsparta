import { processResearchStudyJobs, type ResearchJobType } from "../../../../lib/research-survey-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMAIL_JOB_TYPES: readonly ResearchJobType[] = [
  "invite_batch",
  "invite_reminder",
  "reward_delivery",
  "results_notification"
];

const SERVERLESS_OPERATIONAL_JOB_TYPES: readonly ResearchJobType[] = [
  "sample_draw",
  "release",
  "identity_destruction"
];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Long-running frame acquisition and analysis are intentionally excluded
    // from Vercel. They run through the production one-shot Action where the
    // execution window is measured in hours rather than minutes.
    //
    // Drain one bounded operational job and one email job every invocation so
    // neither lane can starve the other. The email implementation still fails
    // closed unless the dedicated Research SES readiness gate is configured.
    const operational = await processResearchStudyJobs(1, SERVERLESS_OPERATIONAL_JOB_TYPES);
    const email = await processResearchStudyJobs(1, EMAIL_JOB_TYPES);

    return Response.json(
      { ok: true, operational, email },
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
