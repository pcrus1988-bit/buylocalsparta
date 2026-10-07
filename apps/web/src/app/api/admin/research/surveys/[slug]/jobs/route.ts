import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import {
  queueGreekRetailAnalysis,
  queueGreekRetailFrameBuild,
  queueGreekRetailInviteBatch,
  queueGreekRetailInviteReminderBatch,
  queueGreekRetailResultsNotifications,
  queueGreekRetailRewardDelivery,
  queueGreekRetailSampleDraw,
  previewGreekRetailEmailSend,
  saveGreekRetailRecruitmentTemplate
} from "../../../../../../../lib/research-survey-jobs";
import { queueGreekRetailRelease } from "../../../../../../../lib/research-survey-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  targetN?: number;
  desiredCompleteN?: number;
  expectedResponseRate?: number;
  randomSeed?: string;
  fieldworkPhase?: "pilot" | "main";
  label?: string;
  limit?: number;
  subject?: string;
  bodyText?: string;
  version?: string;
  releaseVersion?: string;
  purpose?: "research_invitation" | "research_reminder";
  minAgeDays?: number;
  minGapDays?: number;
  maxReminders?: number;
  emailPurpose?: "initial_invitations" | "reminders" | "thank_you_codes" | "published_results";
  confirmedEmailSend?: boolean;
  confirmedRecipientCount?: number;
  confirmedEmailPurpose?: "initial_invitations" | "reminders" | "thank_you_codes" | "published_results";
  confirmedSurveySlug?: string;
};


function assertBulkEmailConfirmation(
  body: Body,
  input: Readonly<{ slug: string; purpose: NonNullable<Body["confirmedEmailPurpose"]>; candidateCount: number }>
): void {
  if (
    body.confirmedEmailSend !== true
    || body.confirmedSurveySlug !== input.slug
    || body.confirmedEmailPurpose !== input.purpose
    || Number(body.confirmedRecipientCount) !== input.candidateCount
  ) {
    throw new Error("RESEARCH_EMAIL_DOUBLE_CONFIRMATION_REQUIRED");
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.read" });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    if (slug !== "greek-retail-2026") {
      return Response.json({ error: "RESEARCH_JOB_STUDY_UNSUPPORTED" }, { status: 400 });
    }
    const body = await request.json() as Body;

    if (body.action === "preview_email_send") {
      if (!body.emailPurpose) {
        return Response.json({ error: "RESEARCH_EMAIL_PURPOSE_REQUIRED" }, { status: 400 });
      }
      const preview = await previewGreekRetailEmailSend(principal, {
        purpose: body.emailPurpose,
        limit: Number(body.limit || 100),
        minAgeDays: Number(body.minAgeDays || 5),
        minGapDays: Number(body.minGapDays || 5),
        maxReminders: Number(body.maxReminders || 2),
        confirmedRecipientCount: preview.candidateCount
      });
      return Response.json(preview, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "save_recruitment_template") {
      const result = await saveGreekRetailRecruitmentTemplate(principal, {
        subject: String(body.subject ?? ""),
        bodyText: String(body.bodyText ?? ""),
        version: body.version,
        purpose: body.purpose
      });
      await recordAdminAudit(
        principal,
        "research.recruitment_template.locked",
        "research_study",
        slug,
        "Lock versioned research invitation copy",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "build_frame") {
      const result = await queueGreekRetailFrameBuild(principal);
      await recordAdminAudit(
        principal,
        "research.frame.queued",
        "research_study",
        slug,
        "Queue governed G.E.MI. frame snapshot",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "draw_sample") {
      const result = await queueGreekRetailSampleDraw(principal, {
        targetN: Number(body.targetN),
        desiredCompleteN: body.desiredCompleteN === undefined ? undefined : Number(body.desiredCompleteN),
        expectedResponseRate: body.expectedResponseRate === undefined ? undefined : Number(body.expectedResponseRate),
        randomSeed: body.randomSeed,
        fieldworkPhase: body.fieldworkPhase,
        label: body.label
      });
      await recordAdminAudit(
        principal,
        "research.sample.queued",
        "research_study",
        slug,
        "Queue reproducible stratified sample draw",
{ jobId: result.jobId, targetN: Number(body.targetN), desiredCompleteN: body.desiredCompleteN ?? null, expectedResponseRate: body.expectedResponseRate ?? null, randomSeed: result.randomSeed, fieldworkPhase: result.fieldworkPhase }
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "send_invites") {
      const preview = await previewGreekRetailEmailSend(principal, {
        purpose: "initial_invitations",
        limit: Number(body.limit || 100)
      });
      if (preview.candidateCount < 1) throw new Error("RESEARCH_EMAIL_NO_ELIGIBLE_RECIPIENTS");
      assertBulkEmailConfirmation(body, {
        slug,
        purpose: "initial_invitations",
        candidateCount: preview.candidateCount
      });
      const result = await queueGreekRetailInviteBatch(principal, {
        limit: Number(body.limit || 100),
        label: body.label,
        confirmedRecipientCount: preview.candidateCount
      });
      await recordAdminAudit(
        principal,
        "research.invite_batch.queued",
        "research_study",
        slug,
        "Queue governed SES research invitation batch",
        { ...result, limit: Number(body.limit || 100), confirmedRecipientCount: preview.candidateCount }
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "send_reminders") {
      const preview = await previewGreekRetailEmailSend(principal, {
        purpose: "reminders",
        limit: Number(body.limit || 100),
        minAgeDays: Number(body.minAgeDays || 5),
        minGapDays: Number(body.minGapDays || 5),
        maxReminders: Number(body.maxReminders || 2),
        confirmedRecipientCount: preview.candidateCount
      });
      if (preview.candidateCount < 1) throw new Error("RESEARCH_EMAIL_NO_ELIGIBLE_RECIPIENTS");
      assertBulkEmailConfirmation(body, {
        slug,
        purpose: "reminders",
        candidateCount: preview.candidateCount
      });
      const result = await queueGreekRetailInviteReminderBatch(principal, {
        limit: Number(body.limit || 100),
        label: body.label,
        minAgeDays: Number(body.minAgeDays || 5),
        minGapDays: Number(body.minGapDays || 5),
        maxReminders: Number(body.maxReminders || 2)
      });
      await recordAdminAudit(
        principal,
        "research.invite_reminder.queued",
        "research_study",
        slug,
        "Queue governed SES research reminder batch",
        {
          ...result,
          limit: Number(body.limit || 100),
          minAgeDays: Number(body.minAgeDays || 5),
          minGapDays: Number(body.minGapDays || 5),
          maxReminders: Number(body.maxReminders || 2),
          confirmedRecipientCount: preview.candidateCount
        }
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "deliver_rewards") {
      const preview = await previewGreekRetailEmailSend(principal, {
        purpose: "thank_you_codes",
        limit: Number(body.limit || 100)
      });
      if (preview.candidateCount < 1) throw new Error("RESEARCH_EMAIL_NO_ELIGIBLE_RECIPIENTS");
      assertBulkEmailConfirmation(body, {
        slug,
        purpose: "thank_you_codes",
        candidateCount: preview.candidateCount
      });
      const result = await queueGreekRetailRewardDelivery(principal, {
        limit: Number(body.limit || 100),
        label: body.label,
        confirmedRecipientCount: preview.candidateCount
      });
      await recordAdminAudit(
        principal,
        "research.reward_delivery.queued",
        "research_study",
        slug,
        "Queue consent-scoped participant thank-you delivery",
        { ...result, limit: Number(body.limit || 100), confirmedRecipientCount: preview.candidateCount }
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "notify_results") {
      const preview = await previewGreekRetailEmailSend(principal, {
        purpose: "published_results",
        limit: Number(body.limit || 100)
      });
      if (preview.candidateCount < 1) throw new Error("RESEARCH_EMAIL_NO_ELIGIBLE_RECIPIENTS");
      assertBulkEmailConfirmation(body, {
        slug,
        purpose: "published_results",
        candidateCount: preview.candidateCount
      });
      const result = await queueGreekRetailResultsNotifications(principal, {
        limit: Number(body.limit || 100),
        label: body.label,
        confirmedRecipientCount: preview.candidateCount
      });
      await recordAdminAudit(
        principal,
        "research.results_notification.queued",
        "research_study",
        slug,
        "Queue consent-scoped published-results notification",
        { ...result, limit: Number(body.limit || 100), confirmedRecipientCount: preview.candidateCount }
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "run_analysis") {
      const result = await queueGreekRetailAnalysis(principal);
      await recordAdminAudit(
        principal,
        "research.analysis.queued",
        "research_study",
        slug,
        "Queue governed weighted research analysis",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "build_release") {
      const result = await queueGreekRetailRelease(principal, {
        releaseVersion: body.releaseVersion
      });
      await recordAdminAudit(
        principal,
        "research.release.queued",
        "research_study",
        slug,
        "Queue reproducible public research release",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "RESEARCH_JOB_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_JOB_QUEUE_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message === "RESEARCH_STUDY_NOT_FOUND" ? 404 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
