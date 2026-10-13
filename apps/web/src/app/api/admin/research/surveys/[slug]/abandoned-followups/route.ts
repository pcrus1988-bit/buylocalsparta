import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate-only live eligibility preview. No identity or answer values are
 * returned. Recipients are checked again inside the queue worker before SES.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  try {
    await requireAdminSession(request, { permission: "research.read" });
    const { slug } = await context.params;
    if (slug !== "greek-retail-2026") return Response.json({ error: "RESEARCH_STUDY_UNSUPPORTED" }, { status: 400 });
    if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");

    const result = await getProductionPostgresRuntime().sqlPool.query<{
      q27_unsubmitted: number | string;
      eligible_for_followup: number | string;
    }>(`
      SELECT
        count(*)::int AS q27_unsubmitted,
        count(*) FILTER (
          WHERE a.answered_at <= now() - interval '1 day'
            AND ri.sent_at <= now() - interval '1 day'
            AND (ri.expires_at IS NULL OR ri.expires_at > now())
            AND rs.status='fielding'
            AND NOT EXISTS (
              SELECT 1 FROM research_invite_messages m
              WHERE m.invite_id=ri.id AND m.attempt_kind='reminder'
            )
            AND NOT EXISTS (
              SELECT 1 FROM research_invite_messages pending_delay
              WHERE pending_delay.invite_id=ri.id
                AND pending_delay.status='sent'
                AND pending_delay.last_error LIKE 'SES delivery delay:%'
            )
        )::int AS eligible_for_followup
      FROM research_responses rr
      JOIN research_invites ri ON ri.id=rr.invite_id
      JOIN research_studies rs ON rs.id=rr.study_id
      JOIN research_contact_points cp ON cp.id=ri.contact_point_id
      JOIN research_answers a ON a.response_id=rr.id
      JOIN research_questions q ON q.id=a.question_id AND q.code='Q27'
      WHERE rs.slug=$1
        AND rr.status='in_progress'
        AND ri.status='started'
        AND ri.fieldwork_phase='main'
        AND cp.contact_type='email'
        AND cp.suppression_status='active'
        AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
        AND EXISTS (SELECT 1 FROM research_consents consent
          WHERE consent.response_id=rr.id AND consent.consent_kind='research_participation'
          AND consent.granted=true)
        AND NOT EXISTS (SELECT 1 FROM research_consents revoked
          WHERE revoked.response_id=rr.id AND revoked.consent_kind='research_participation'
          AND revoked.granted=false)
    `, [slug]);

    return Response.json({
      q27Unsubmitted: Number(result.rows[0]?.q27_unsubmitted ?? 0),
      eligibleNow: Number(result.rows[0]?.eligible_for_followup ?? 0),
      minimumSinceLastAnswerHours: 24,
      scope: "Q27-only, active, unsuppressed, main fieldwork",
      sendsEmails: false
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_ABANDONED_COUNTS_UNAVAILABLE";
    return Response.json({ error: message }, {
      status: /ADMIN_AUTH/.test(message) ? 401 : /ADMIN_PERMISSION/.test(message) ? 403 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
