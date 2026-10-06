import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export type ResearchQualityReviewItem = Readonly<{
  responseId: string;
  completedAt?: string;
  durationSeconds: number;
  regionCode: string;
  sectorCode: string;
  reasonCodes: readonly string[];
  metrics: Record<string, unknown>;
  digitalReadinessScore?: number;
  frictionOverallScore?: number;
}>;

export async function researchQualityReviewQueue(
  principal: SessionPrincipal,
  slug: string
): Promise<readonly ResearchQualityReviewItem[]> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (qr.response_id)
        qr.response_id,
        qr.decision,
        qr.reason_codes,
        qr.metrics,
        qr.created_at
      FROM research_response_quality_reviews qr
      JOIN research_responses rr ON rr.id=qr.response_id
      JOIN research_invites ri ON ri.id=rr.invite_id
      JOIN research_studies s ON s.id=rr.study_id
      WHERE s.slug=$1
        AND rr.status='completed'
        AND ri.fieldwork_phase=CASE WHEN s.status IN ('draft','pilot') THEN 'pilot' ELSE 'main' END
      ORDER BY qr.response_id,qr.created_at DESC,qr.id DESC
    )
    SELECT
      rr.id AS response_id,
      rr.completed_at,
      rr.duration_seconds,
      COALESCE(fu.region_code,'unknown') AS region_code,
      COALESCE(fu.sector_code,'unknown') AS sector_code,
      latest.reason_codes,
      latest.metrics,
      scores.digital_readiness_score,
      scores.friction_overall_score
    FROM latest
    JOIN research_responses rr ON rr.id=latest.response_id
    JOIN research_invites ri ON ri.id=rr.invite_id
    LEFT JOIN research_sample_units su ON su.id=ri.sample_unit_id
    LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id
    LEFT JOIN research_response_scores scores ON scores.response_id=rr.id
    WHERE latest.decision='review'
    ORDER BY rr.completed_at,rr.id
    LIMIT 200
  `, [slug]);

  return result.rows.map((row) => ({
    responseId: text(row.response_id),
    completedAt: row.completed_at ? new Date(row.completed_at as string | Date).toISOString() : undefined,
    durationSeconds: numberValue(row.duration_seconds),
    regionCode: text(row.region_code),
    sectorCode: text(row.sector_code),
    reasonCodes: stringArray(row.reason_codes),
    metrics: objectValue(row.metrics),
    digitalReadinessScore: row.digital_readiness_score == null ? undefined : numberValue(row.digital_readiness_score),
    frictionOverallScore: row.friction_overall_score == null ? undefined : numberValue(row.friction_overall_score)
  }));
}

export async function resolveResearchQualityReview(
  principal: SessionPrincipal,
  input: Readonly<{
    slug: string;
    responseId: string;
    decision: "include" | "exclude";
    note?: string;
  }>
): Promise<Readonly<{ responseId: string; decision: "include" | "exclude" }>> {
  assertAdminPermission(principal, "research.quality.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  if (!/^[0-9a-f-]{36}$/i.test(input.responseId)) throw new Error("RESEARCH_QA_RESPONSE_INVALID");

  const note = input.note?.trim().replace(/[\r\n]+/g, " ").slice(0, 500) || "";
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const responseResult = await client.query<SqlRow>(`
      SELECT rr.id,rr.status
      FROM research_responses rr
      JOIN research_studies s ON s.id=rr.study_id
      WHERE s.slug=$1 AND rr.id=$2
      LIMIT 1
      FOR UPDATE OF rr
    `, [input.slug, input.responseId]);
    const response = responseResult.rows[0];
    if (!response) throw new Error("RESEARCH_QA_RESPONSE_NOT_FOUND");
    if (text(response.status) !== "completed") throw new Error("RESEARCH_QA_RESPONSE_NOT_COMPLETED");

    const latestResult = await client.query<SqlRow>(`
      SELECT decision
      FROM research_response_quality_reviews
      WHERE response_id=$1
      ORDER BY created_at DESC,id DESC
      LIMIT 1
    `, [input.responseId]);
    if (text(latestResult.rows[0]?.decision) !== "review") {
      throw new Error("RESEARCH_QA_ALREADY_RESOLVED");
    }

    await client.query(`
      INSERT INTO research_response_quality_reviews (
        response_id,rule_version,decision,reason_codes,metrics,source
      )
      VALUES (
        $1,'greek-retail-2026-manual-qc-v1',$2,$3::text[],
        jsonb_build_object(
          'reviewNote',$4::text,
          'reviewedBy',$5::text,
          'resolution','manual'
        ),
        'admin'
      )
    `, [
      input.responseId,
      input.decision,
      [input.decision === "include" ? "manual_include" : "manual_exclude"],
      note,
      principal.userId
    ]);
    await client.query("COMMIT");
    return { responseId: input.responseId, decision: input.decision };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
