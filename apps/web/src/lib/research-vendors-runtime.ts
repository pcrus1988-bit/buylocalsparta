import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const researchEvidenceTypes = [
  "merchant_census_2026_08",
  "online_store_active_2026_08",
  "gemi_public_record_candidate_2026_08",
  "eshop_health_audit_2026_08"
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
function optionalText(value: unknown): string | undefined {
  const valueText = typeof value === "string" ? value.trim() : "";
  return valueText || undefined;
}
function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type ResearchVendorRecord = {
  id: string;
  tradingName: string;
  legalName: string;
  status: string;
  address?: string;
  locality?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  shortDescription?: string;
  evidenceCount: number;
  verificationCount: number;
  sourceRecordCount: number;
  subscriptionStatus?: string;
  planCode?: string;
  updatedAt?: string;
  sourceKind?: string;
  censusId?: number;
  majorBranch?: string;
  subBranch?: string;
  scope?: string;
  distanceKm?: number;
  outreachPriority?: string;
  outreachScore?: number;
  regulationFlag?: string;
  onlineShopStatus?: string;
  onlineShopUrl?: string;
  gemiResearch?: string;
  latestIssueSeverity?: string;
  latestIssueType?: string;
};

export async function researchVendorsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) {
    return {
      csrfToken: principal.csrfToken,
      summary: { total: 0, invited: 0, inProgress: 0, active: 0, restricted: 0, withEvidence: 0, priorityA: 0, online: 0 },
      vendors: [] as ResearchVendorRecord[],
      databaseConfigured: false
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const evidenceTypes = [...researchEvidenceTypes];
    const summaryResult = await tx.query<SqlRow>(`
      WITH research AS (
        SELECT DISTINCT vb.id, vb.status::text AS status
        FROM vendor_businesses vb
        JOIN markets m ON m.id = vb.market_id
        LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id = vb.id
        LEFT JOIN vendor_verification_checks vvc ON vvc.vendor_id = vb.id AND vvc.type = ANY($1::text[])
        WHERE m.code = 'sparta'
          AND (vb.public_id LIKE 'vendor_research_%' OR vrp.vendor_id IS NOT NULL OR vvc.id IS NOT NULL)
      )
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'invited')::int AS invited,
        count(*) FILTER (WHERE status IN ('application_started','verification_pending','catalog_onboarding','test_ready'))::int AS in_progress,
        count(*) FILTER (WHERE status = 'active')::int AS active,
        count(*) FILTER (WHERE status IN ('restricted','suspended','closed'))::int AS restricted
      FROM research`, [evidenceTypes]);

    const evidenceResult = await tx.query<SqlRow>(`
      SELECT
        count(DISTINCT vb.id)::int AS with_evidence,
        count(DISTINCT vb.id) FILTER (WHERE vrp.outreach_priority LIKE 'A —%')::int AS priority_a,
        count(DISTINCT vb.id) FILTER (WHERE COALESCE(vrp.online_shop_active,'') NOT IN ('','Not verified'))::int AS online
      FROM vendor_businesses vb
      JOIN markets m ON m.id = vb.market_id
      LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id = vb.id
      LEFT JOIN vendor_research_source_links vrsl ON vrsl.vendor_id = vb.id
      WHERE m.code = 'sparta' AND vb.public_id LIKE 'vendor_research_%'`);

    const rows = await tx.query<SqlRow>(`
      SELECT
        vb.public_id,
        vb.trading_name,
        vb.legal_name,
        vb.status::text AS status,
        COALESCE(vrp.primary_phone,vl.phone) AS phone,
        COALESCE(vrp.primary_email::text,vl.public_email::text) AS public_email,
        vl.address_line1,
        vl.locality,
        vl.postcode,
        vpt.short_description,
        COALESCE(ev.evidence_count,0)::int AS evidence_count,
        COALESCE(ev.verified_count,0)::int AS verified_count,
        COALESCE(src.source_record_count,0)::int AS source_record_count,
        vs.status AS subscription_status,
        vp.code AS plan_code,
        vb.updated_at::text AS updated_at,
        vrp.source_kind,
        vrp.primary_census_id,
        vrp.major_branch,
        vrp.sub_branch,
        vrp.marketplace_scope,
        vrp.distance_km,
        vrp.outreach_priority,
        vrp.outreach_score,
        vrp.regulation_flag,
        vrp.online_shop_active,
        vrp.online_shop_url,
        vrp.gemi_research,
        vrp.latest_issue_severity,
        vrp.latest_issue_type
      FROM vendor_businesses vb
      JOIN markets m ON m.id = vb.market_id
      LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id = vb.id
      LEFT JOIN LATERAL (
        SELECT l.address_line1,l.locality,l.postcode,l.phone,l.public_email
        FROM vendor_locations l
        WHERE l.vendor_id = vb.id
        ORDER BY l.is_primary DESC NULLS LAST,l.active DESC,l.created_at ASC
        LIMIT 1
      ) vl ON true
      LEFT JOIN vendor_profile_translations vpt ON vpt.vendor_id = vb.id AND vpt.locale = 'el'
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS evidence_count,
               count(*) FILTER (WHERE status IN ('verified','passed','approved'))::int AS verified_count
        FROM vendor_verification_checks c
        WHERE c.vendor_id = vb.id AND c.type = ANY($1::text[])
      ) ev ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS source_record_count
        FROM vendor_research_source_links l
        WHERE l.vendor_id = vb.id
      ) src ON true
      LEFT JOIN LATERAL (
        SELECT s.status,s.plan_id
        FROM vendor_subscriptions s
        WHERE s.vendor_id = vb.id
        ORDER BY s.updated_at DESC NULLS LAST,s.created_at DESC
        LIMIT 1
      ) vs ON true
      LEFT JOIN vendor_plans vp ON vp.id = vs.plan_id
      WHERE m.code = 'sparta'
        AND (vb.public_id LIKE 'vendor_research_%' OR vrp.vendor_id IS NOT NULL)
      ORDER BY
        CASE vb.status::text
          WHEN 'invited' THEN 0
          WHEN 'application_started' THEN 1
          WHEN 'verification_pending' THEN 2
          WHEN 'catalog_onboarding' THEN 3
          WHEN 'test_ready' THEN 4
          WHEN 'active' THEN 5
          ELSE 6
        END,
        COALESCE(vrp.outreach_score,0) DESC,
        lower(vb.trading_name),vb.public_id
      LIMIT 500`, [evidenceTypes]);

    const summaryRow = summaryResult.rows[0] ?? {};
    const evidenceRow = evidenceResult.rows[0] ?? {};
    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      summary: {
        total: numberValue(summaryRow.total),
        invited: numberValue(summaryRow.invited),
        inProgress: numberValue(summaryRow.in_progress),
        active: numberValue(summaryRow.active),
        restricted: numberValue(summaryRow.restricted),
        withEvidence: numberValue(evidenceRow.with_evidence),
        priorityA: numberValue(evidenceRow.priority_a),
        online: numberValue(evidenceRow.online)
      },
      vendors: rows.rows.map((row): ResearchVendorRecord => ({
        id: text(row.public_id),
        tradingName: text(row.trading_name),
        legalName: text(row.legal_name),
        status: text(row.status),
        address: optionalText(row.address_line1),
        locality: optionalText(row.locality),
        postcode: optionalText(row.postcode),
        phone: optionalText(row.phone),
        email: optionalText(row.public_email),
        shortDescription: optionalText(row.short_description),
        evidenceCount: numberValue(row.evidence_count),
        verificationCount: numberValue(row.verified_count),
        sourceRecordCount: numberValue(row.source_record_count),
        subscriptionStatus: optionalText(row.subscription_status),
        planCode: optionalText(row.plan_code),
        updatedAt: optionalText(row.updated_at),
        sourceKind: optionalText(row.source_kind),
        censusId: row.primary_census_id == null ? undefined : numberValue(row.primary_census_id),
        majorBranch: optionalText(row.major_branch),
        subBranch: optionalText(row.sub_branch),
        scope: optionalText(row.marketplace_scope),
        distanceKm: row.distance_km == null ? undefined : numberValue(row.distance_km),
        outreachPriority: optionalText(row.outreach_priority),
        outreachScore: row.outreach_score == null ? undefined : numberValue(row.outreach_score),
        regulationFlag: optionalText(row.regulation_flag),
        onlineShopStatus: optionalText(row.online_shop_active),
        onlineShopUrl: optionalText(row.online_shop_url),
        gemiResearch: optionalText(row.gemi_research),
        latestIssueSeverity: optionalText(row.latest_issue_severity),
        latestIssueType: optionalText(row.latest_issue_type)
      }))
    };
  }, { readOnly: true });
}
