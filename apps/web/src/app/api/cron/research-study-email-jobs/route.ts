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
    // Drain existing authorized invitation/reward work FIRST. A costly
    // reminder-eligibility scan must not consume the cron wall-clock budget
    // before the main campaign's next checkpoint. No new emails are authorized.
    const email = await processResearchStudyJobs(1, EMAIL_JOB_TYPES);
    let automaticReminder: Awaited<ReturnType<typeof ensureGreekRetailAutomaticReminderBatch>> | {state:string;reason:string};
    try {
      automaticReminder = await ensureGreekRetailAutomaticReminderBatch();
    } catch(error) {
      const reason = error instanceof Error ? error.message : "automatic_reminder_failed";
      console.error(JSON.stringify({level:"error",event:"research.automatic_reminder_failed",reason}));
      automaticReminder = {state:"unavailable",reason};
    }
    return Response.json(
      { ok: true, lane: "email", automaticReminder, ...email },
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
