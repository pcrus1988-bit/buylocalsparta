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
function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
  sourceKind?: string;
  primaryCensusId?: number;
  majorBranch?: string;
  subBranch?: string;
  marketplaceScope?: string;
  distanceKm?: number;
  outreachPriority?: string;
  outreachScore?: number;
  regulationFlag?: string;
  recommendedCommerceMode?: string;
  storefrontStatus?: string;
  gemiResearch?: string;
  onlineShopActive?: string;
  onlineShopUrl?: string;
  latestIssueSeverity?: string;
  latestIssueType?: string;
  evidenceCount: number;
  verificationCount: number;
  researchSourceCount: number;
  subscriptionStatus?: string;
  planCode?: string;
  updatedAt?: string;
};

export type ResearchSourceRecord = {
  sourceType: string;
  sourceKey: string;
  title: string;
  linkRole: string;
  checkedAt?: string;
  payload: Record<string, unknown>;
};

export type ResearchVerificationRecord = {
  type: string;
  status: string;
  checkedAt?: string;
  expiresAt?: string;
  evidence: Record<string, unknown>;
};

export type ResearchVendorDossier = ResearchVendorRecord & {
  sellerRelationship?: string;
  taxNumber?: string;
  gemiNumber?: string;
  legalForm?: string;
  verificationCompletedAt?: string;
  candidateLegalName?: string;
  candidateGemi?: string;
  candidateVat?: string;
  verificationAction?: string;
  directoryCategories?: string;
  listingSource?: string;
  directoryProfile?: string;
  checkedAt?: string;
  profilePayload: Record<string, unknown>;
  sources: ResearchSourceRecord[];
  verifications: ResearchVerificationRecord[];
};

function researchVendorFromRow(row: SqlRow): ResearchVendorRecord {
  return {
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
    sourceKind: optionalText(row.source_kind),
    primaryCensusId: optionalNumber(row.primary_census_id),
    majorBranch: optionalText(row.major_branch),
    subBranch: optionalText(row.sub_branch),
    marketplaceScope: optionalText(row.marketplace_scope),
    distanceKm: optionalNumber(row.distance_km),
    outreachPriority: optionalText(row.outreach_priority),
    outreachScore: optionalNumber(row.outreach_score),
    regulationFlag: optionalText(row.regulation_flag),
    recommendedCommerceMode: optionalText(row.recommended_commerce_mode),
    storefrontStatus: optionalText(row.storefront_status),
    gemiResearch: optionalText(row.gemi_research),
    onlineShopActive: optionalText(row.online_shop_active),
    onlineShopUrl: optionalText(row.online_shop_url),
    latestIssueSeverity: optionalText(row.latest_issue_severity),
    latestIssueType: optionalText(row.latest_issue_type),
    evidenceCount: numberValue(row.evidence_count),
    verificationCount: numberValue(row.verified_count),
    researchSourceCount: numberValue(row.research_source_count),
    subscriptionStatus: optionalText(row.subscription_status),
    planCode: optionalText(row.plan_code),
    updatedAt: optionalText(row.updated_at)
  };
}

export async function researchVendorsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) {
    return {
      csrfToken: principal.csrfToken,
      summary: { total: 0, invited: 0, inProgress: 0, active: 0, restricted: 0, withEvidence: 0 },
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
        LEFT JOIN vendor_verification_checks vvc ON vvc.vendor_id = vb.id AND vvc.type = ANY($1::text[])
        WHERE m.code = 'sparta'
          AND (vb.public_id LIKE 'vendor_research_%' OR vvc.id IS NOT NULL)
      )
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'invited')::int AS invited,
        count(*) FILTER (WHERE status IN ('application_started','verification_pending','catalog_onboarding','test_ready'))::int AS in_progress,
        count(*) FILTER (WHERE status = 'active')::int AS active,
        count(*) FILTER (WHERE status IN ('restricted','suspended','closed'))::int AS restricted
      FROM research`, [evidenceTypes]);

    const withEvidenceResult = await tx.query<SqlRow>(`
      SELECT count(DISTINCT vb.id)::int AS with_evidence
      FROM vendor_businesses vb
      JOIN markets m ON m.id = vb.market_id
      JOIN vendor_verification_checks vvc ON vvc.vendor_id = vb.id AND vvc.type = ANY($1::text[])
      WHERE m.code = 'sparta'`, [evidenceTypes]);

    const rows = await tx.query<SqlRow>(`
      SELECT
        vb.public_id,
        vb.trading_name,
        vb.legal_name,
        vb.status::text AS status,
        COALESCE(vrp.research_address_line1, vl.address_line1) AS address_line1,
        COALESCE(vrp.research_locality, vl.locality) AS locality,
        COALESCE(vrp.research_postcode, vl.postcode) AS postcode,
        COALESCE(vrp.primary_phone, vl.phone) AS phone,
        COALESCE(vrp.primary_email, vl.public_email::text) AS public_email,
        vpt.short_description,
        vrp.source_kind,
        vrp.primary_census_id,
        vrp.major_branch,
        vrp.sub_branch,
        vrp.marketplace_scope,
        vrp.distance_km,
        vrp.outreach_priority,
        vrp.outreach_score,
        vrp.regulation_flag,
        vrp.recommended_commerce_mode,
        vrp.storefront_status,
        vrp.gemi_research,
        vrp.online_shop_active,
        vrp.online_shop_url,
        vrp.latest_issue_severity,
        vrp.latest_issue_type,
        COALESCE(ev.evidence_count,0)::int AS evidence_count,
        COALESCE(ev.verified_count,0)::int AS verified_count,
        COALESCE(rs.research_source_count,0)::int AS research_source_count,
        vs.status AS subscription_status,
        vp.code AS plan_code,
        vb.updated_at::text AS updated_at
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
        SELECT count(*)::int AS research_source_count
        FROM vendor_research_source_links rsl
        WHERE rsl.vendor_id = vb.id
      ) rs ON true
      LEFT JOIN LATERAL (
        SELECT s.status,s.plan_id
        FROM vendor_subscriptions s
        WHERE s.vendor_id = vb.id
        ORDER BY s.updated_at DESC NULLS LAST,s.created_at DESC
        LIMIT 1
      ) vs ON true
      LEFT JOIN vendor_plans vp ON vp.id = vs.plan_id
      WHERE m.code = 'sparta'
        AND (
          vb.public_id LIKE 'vendor_research_%'
          OR EXISTS (
            SELECT 1 FROM vendor_verification_checks c2
            WHERE c2.vendor_id = vb.id AND c2.type = ANY($1::text[])
          )
        )
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
        vrp.outreach_score DESC NULLS LAST,
        lower(vb.trading_name),vb.public_id
      LIMIT 500`, [evidenceTypes]);

    const summaryRow = summaryResult.rows[0] ?? {};
    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      summary: {
        total: numberValue(summaryRow.total),
        invited: numberValue(summaryRow.invited),
        inProgress: numberValue(summaryRow.in_progress),
        active: numberValue(summaryRow.active),
        restricted: numberValue(summaryRow.restricted),
        withEvidence: numberValue(withEvidenceResult.rows[0]?.with_evidence)
      },
      vendors: rows.rows.map(researchVendorFromRow)
    };
  }, { readOnly: true });
}

export async function researchVendorDossier(principal: SessionPrincipal, publicId: string) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) {
    return { csrfToken: principal.csrfToken, databaseConfigured: false, vendor: null as ResearchVendorDossier | null };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const evidenceTypes = [...researchEvidenceTypes];
    const vendorResult = await tx.query<SqlRow>(`
      SELECT
        vb.id AS vendor_uuid,
        vb.public_id,
        vb.trading_name,
        vb.legal_name,
        vb.status::text AS status,
        vb.tax_number,
        vb.gemi_number,
        vb.legal_form,
        vb.seller_relationship,
        vb.verification_completed_at::text AS verification_completed_at,
        COALESCE(vrp.research_address_line1, vl.address_line1) AS address_line1,
        COALESCE(vrp.research_locality, vl.locality) AS locality,
        COALESCE(vrp.research_postcode, vl.postcode) AS postcode,
        COALESCE(vrp.primary_phone, vl.phone) AS phone,
        COALESCE(vrp.primary_email, vl.public_email::text) AS public_email,
        vpt.short_description,
        vrp.source_kind,
        vrp.primary_census_id,
        vrp.major_branch,
        vrp.sub_branch,
        vrp.marketplace_scope,
        vrp.distance_km,
        vrp.outreach_priority,
        vrp.outreach_score,
        vrp.regulation_flag,
        vrp.recommended_commerce_mode,
        vrp.storefront_status,
        vrp.gemi_research,
        vrp.candidate_legal_name,
        vrp.candidate_gemi,
        vrp.candidate_vat,
        vrp.verification_action,
        vrp.directory_categories,
        vrp.listing_source,
        vrp.directory_profile,
        vrp.checked_at::text AS checked_at,
        vrp.online_shop_active,
        vrp.online_shop_url,
        vrp.latest_issue_severity,
        vrp.latest_issue_type,
        vrp.source_payload,
        COALESCE(ev.evidence_count,0)::int AS evidence_count,
        COALESCE(ev.verified_count,0)::int AS verified_count,
        COALESCE(rs.research_source_count,0)::int AS research_source_count,
        vs.status AS subscription_status,
        vp.code AS plan_code,
        vb.updated_at::text AS updated_at
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
        SELECT count(*)::int AS research_source_count
        FROM vendor_research_source_links rsl
        WHERE rsl.vendor_id = vb.id
      ) rs ON true
      LEFT JOIN LATERAL (
        SELECT s.status,s.plan_id
        FROM vendor_subscriptions s
        WHERE s.vendor_id = vb.id
        ORDER BY s.updated_at DESC NULLS LAST,s.created_at DESC
        LIMIT 1
      ) vs ON true
      LEFT JOIN vendor_plans vp ON vp.id = vs.plan_id
      WHERE m.code = 'sparta'
        AND vb.public_id = $2
        AND (
          vb.public_id LIKE 'vendor_research_%'
          OR EXISTS (
            SELECT 1 FROM vendor_verification_checks c2
            WHERE c2.vendor_id = vb.id AND c2.type = ANY($1::text[])
          )
        )
      LIMIT 1`, [evidenceTypes, publicId]);

    const row = vendorResult.rows[0];
    if (!row) return { csrfToken: principal.csrfToken, databaseConfigured: true, vendor: null as ResearchVendorDossier | null };

    const vendorUuid = text(row.vendor_uuid);
    const sourceRows = await tx.query<SqlRow>(`
      SELECT sr.source_type,sr.source_key,sr.title,sr.checked_at::text AS checked_at,sr.payload,rsl.link_role
      FROM vendor_research_source_links rsl
      JOIN vendor_research_source_records sr ON sr.id = rsl.source_id
      WHERE rsl.vendor_id = $1::uuid
      ORDER BY
        CASE sr.source_type
          WHEN 'merchant_census' THEN 0
          WHEN 'active_online_shop' THEN 1
          WHEN 'gemi_sample' THEN 2
          WHEN 'eshop_issue' THEN 3
          ELSE 4
        END,
        sr.checked_at DESC NULLS LAST,
        sr.source_key`, [vendorUuid]);

    const verificationRows = await tx.query<SqlRow>(`
      SELECT type,status,evidence,checked_at::text AS checked_at,expires_at::text AS expires_at
      FROM vendor_verification_checks
      WHERE vendor_id = $1::uuid AND type = ANY($2::text[])
      ORDER BY checked_at DESC NULLS LAST,created_at DESC`, [vendorUuid, evidenceTypes]);

    const base = researchVendorFromRow(row);
    const vendor: ResearchVendorDossier = {
      ...base,
      sellerRelationship: optionalText(row.seller_relationship),
      taxNumber: optionalText(row.tax_number),
      gemiNumber: optionalText(row.gemi_number),
      legalForm: optionalText(row.legal_form),
      verificationCompletedAt: optionalText(row.verification_completed_at),
      candidateLegalName: optionalText(row.candidate_legal_name),
      candidateGemi: optionalText(row.candidate_gemi),
      candidateVat: optionalText(row.candidate_vat),
      verificationAction: optionalText(row.verification_action),
      directoryCategories: optionalText(row.directory_categories),
      listingSource: optionalText(row.listing_source),
      directoryProfile: optionalText(row.directory_profile),
      checkedAt: optionalText(row.checked_at),
      profilePayload: objectValue(row.source_payload),
      sources: sourceRows.rows.map((source): ResearchSourceRecord => ({
        sourceType: text(source.source_type),
        sourceKey: text(source.source_key),
        title: text(source.title),
        linkRole: text(source.link_role),
        checkedAt: optionalText(source.checked_at),
        payload: objectValue(source.payload)
      })),
      verifications: verificationRows.rows.map((verification): ResearchVerificationRecord => ({
        type: text(verification.type),
        status: text(verification.status),
        checkedAt: optionalText(verification.checked_at),
        expiresAt: optionalText(verification.expires_at),
        evidence: objectValue(verification.evidence)
      }))
    };

    return { csrfToken: principal.csrfToken, databaseConfigured: true, vendor };
  }, { readOnly: true });
}
