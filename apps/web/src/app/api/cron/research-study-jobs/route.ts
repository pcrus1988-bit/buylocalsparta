import {
  ensureGreekRetailAutomaticReminderBatch,
  processResearchStudyJobs,
  RESEARCH_JOB_TYPES,
  type ResearchJobType
} from "../../../../lib/research-survey-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMAIL_JOB_TYPES: readonly ResearchJobType[] = [
  "invite_batch",
  "invite_reminder",
  "reward_delivery",
  "results_notification"
];

const EMAIL_JOB_TYPE_SET = new Set<ResearchJobType>(EMAIL_JOB_TYPES);
const OPERATIONAL_JOB_TYPES = RESEARCH_JOB_TYPES.filter(
  (jobType) => !EMAIL_JOB_TYPE_SET.has(jobType)
);

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Always drain governed non-email work first so frame/sample/analysis/release
    // jobs cannot be stranded behind the email-delivery lane. Email jobs keep
    // their separate delivery readiness guard inside the worker implementation.
    const operational = await processResearchStudyJobs(3, OPERATIONAL_JOB_TYPES);
    if (operational.claimed > 0) {
      return Response.json(
        { ok: true, lane: "operational", ...operational },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const automaticReminder = await ensureGreekRetailAutomaticReminderBatch();
    const email = await processResearchStudyJobs(1, EMAIL_JOB_TYPES);
    return Response.json(
      { ok: true, lane: "email", automaticReminder, ...email },
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
