import {
  ensureGreekRetailAutomaticReminderBatch,
  processResearchStudyJobs,
  type ResearchJobType
} from "../../../../lib/research-survey-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Only email delivery work runs here. In particular, no GEMI frame fetch or
// long-running frame_snapshot/sample_draw task can starve approved invitations.
const CAMPAIGN_JOB_TYPES: readonly ResearchJobType[] = ["invite_batch"];
const OTHER_EMAIL_JOB_TYPES: readonly ResearchJobType[] = [
  "invite_reminder", "reward_delivery", "results_notification"
];
const MAX_CAMPAIGN_DRAIN_MS = 225_000;
const MAX_CAMPAIGN_CHECKPOINTS = 200;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // A 50-recipient checkpoint must not be the limit for an entire minute.
    // Run repeated, separately claimed and audited checkpoints under the
    // function's time budget. The job's DB lease prevents overlapping sends.
    const started = Date.now();
    const email = { claimed:0, processed:0, requeued:0, failed:0 };
    let campaignCheckpoints = 0;
    while (campaignCheckpoints < MAX_CAMPAIGN_CHECKPOINTS &&
           Date.now() - started < MAX_CAMPAIGN_DRAIN_MS) {
      const tick = await processResearchStudyJobs(1, CAMPAIGN_JOB_TYPES);
      if (!tick.claimed) break;
      campaignCheckpoints += 1;
      email.claimed += tick.claimed;
      email.processed += tick.processed;
      email.requeued += tick.requeued;
      email.failed += tick.failed;
      if (tick.failed > 0) break;
    }
    const durationMs = Date.now() - started;
    console.info(JSON.stringify({
      level:"info",event:"research.campaign_drain",
      campaignCheckpoints,durationMs,...email
    }));
    // Keep non-campaign notifications on their own queue. Never allow the
    // reminder eligibility scan to consume the active campaign's time budget.
    let automaticReminder: Awaited<ReturnType<typeof ensureGreekRetailAutomaticReminderBatch>> | {state:string;reason:string};
    if (Date.now() - started < MAX_CAMPAIGN_DRAIN_MS) {
      const other = await processResearchStudyJobs(1, OTHER_EMAIL_JOB_TYPES);
      email.claimed += other.claimed;
      email.processed += other.processed;
      email.requeued += other.requeued;
      email.failed += other.failed;
      try {
        automaticReminder = await ensureGreekRetailAutomaticReminderBatch();
      } catch(error) {
        const reason = error instanceof Error ? error.message : "automatic_reminder_failed";
        console.error(JSON.stringify({level:"error",event:"research.automatic_reminder_failed",reason}));
        automaticReminder = {state:"unavailable",reason};
      }
    } else {
      automaticReminder = {state:"deferred",reason:"campaign_drain_budget"};
    }
    return Response.json(
      { ok: true, lane: "email", campaignCheckpoints, durationMs, automaticReminder, ...email },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "research_email_job_cron_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "research.email_job_cron_failed",
      message
    }));
    return Response.json({ error: message }, { status: 500 });
  }
}
