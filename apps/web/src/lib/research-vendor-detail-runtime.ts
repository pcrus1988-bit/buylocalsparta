import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const s = typeof value === "string" ? value.trim() : ""; return s || undefined; }
function optionalNumber(value: unknown): number | undefined { if (value == null || value === "") return undefined; const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export type ResearchSourceRecord = {
  id: string;
  type: string;
  key: string;
  title: string;
  checkedAt?: string;
  role: string;
  payload: Record<string, unknown>;
};

export type ResearchVendorDossier = {
  csrfToken: string;
  databaseConfigured: boolean;
  vendor: {
    id: string;
    tradingName: string;
    legalName: string;
    status: string;
    claimStatus?: string;
    onboardingStatus?: string;
    sourceKind?: string;
    censusId?: number;
    majorBranch?: string;
    subBranch?: string;
    scope?: string;
    distanceKm?: number;
    outreachPriority?: string;
    outreachScore?: number;
    regulationFlag?: string;
    recommendedCommerceMode?: string;
    storefrontStatus?: string;
    gemiResearch?: string;
    candidateLegalName?: string;
    candidateGemi?: string;
    candidateVat?: string;
    verificationAction?: string;
    directoryCategories?: string;
    listingSource?: string;
    directoryProfile?: string;
    checkedAt?: string;
    onlineShopStatus?: string;
    onlineShopUrl?: string;
    phone?: string;
    email?: string;
    latestIssueSeverity?: string;
    latestIssueType?: string;
    sourcePayload: Record<string, unknown>;
  };
  sources: ResearchSourceRecord[];
};

export async function researchVendorDetailWorkspace(principal: SessionPrincipal, publicId: string): Promise<ResearchVendorDossier | null> {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) return null;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT
        vb.id AS vendor_uuid,vb.public_id,vb.trading_name,vb.legal_name,vb.status::text AS status,
        vb.claim_status::text AS claim_status,vb.onboarding_status::text AS onboarding_status,
        vrp.source_kind,vrp.primary_census_id,vrp.major_branch,vrp.sub_branch,vrp.marketplace_scope,
        vrp.distance_km,vrp.outreach_priority,vrp.outreach_score,vrp.regulation_flag,
        vrp.recommended_commerce_mode,vrp.storefront_status,vrp.gemi_research,vrp.candidate_legal_name,
        vrp.candidate_gemi,vrp.candidate_vat,vrp.verification_action,vrp.directory_categories,
        vrp.listing_source,vrp.directory_profile,vrp.checked_at::text AS checked_at,
        vrp.online_shop_active,vrp.online_shop_url,vrp.primary_phone,vrp.primary_email::text AS primary_email,
        vrp.latest_issue_severity,vrp.latest_issue_type,vrp.source_payload
      FROM vendor_businesses vb
      JOIN markets m ON m.id=vb.market_id AND m.code='sparta'
      LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id=vb.id
      WHERE vb.public_id=$1 AND (vb.public_id LIKE 'vendor_research_%' OR vrp.vendor_id IS NOT NULL)
      LIMIT 1`, [publicId]);
    const row = result.rows[0];
    if (!row) return null;

    const sourceResult = await tx.query<SqlRow>(`
      SELECT s.id::text,s.source_type,s.source_key,s.title,s.checked_at::text AS checked_at,l.link_role,s.payload
      FROM vendor_research_source_links l
      JOIN vendor_research_source_records s ON s.id=l.source_id
      WHERE l.vendor_id=$1::uuid
      ORDER BY s.checked_at DESC NULLS LAST,
        CASE s.source_type WHEN 'merchant_census' THEN 0 WHEN 'gemi_sample' THEN 1 WHEN 'active_online_shop' THEN 2 WHEN 'eshop_issue' THEN 3 ELSE 4 END,
        s.source_key`, [text(row.vendor_uuid)]);

    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      vendor: {
        id: text(row.public_id), tradingName: text(row.trading_name), legalName: text(row.legal_name), status: text(row.status),
        claimStatus: optionalText(row.claim_status), onboardingStatus: optionalText(row.onboarding_status),
        sourceKind: optionalText(row.source_kind), censusId: optionalNumber(row.primary_census_id), majorBranch: optionalText(row.major_branch),
        subBranch: optionalText(row.sub_branch), scope: optionalText(row.marketplace_scope), distanceKm: optionalNumber(row.distance_km),
        outreachPriority: optionalText(row.outreach_priority), outreachScore: optionalNumber(row.outreach_score), regulationFlag: optionalText(row.regulation_flag),
        recommendedCommerceMode: optionalText(row.recommended_commerce_mode), storefrontStatus: optionalText(row.storefront_status), gemiResearch: optionalText(row.gemi_research),
        candidateLegalName: optionalText(row.candidate_legal_name), candidateGemi: optionalText(row.candidate_gemi), candidateVat: optionalText(row.candidate_vat),
        verificationAction: optionalText(row.verification_action), directoryCategories: optionalText(row.directory_categories), listingSource: optionalText(row.listing_source),
        directoryProfile: optionalText(row.directory_profile), checkedAt: optionalText(row.checked_at), onlineShopStatus: optionalText(row.online_shop_active), onlineShopUrl: optionalText(row.online_shop_url),
        phone: optionalText(row.primary_phone), email: optionalText(row.primary_email), latestIssueSeverity: optionalText(row.latest_issue_severity), latestIssueType: optionalText(row.latest_issue_type),
        sourcePayload: objectValue(row.source_payload)
      },
      sources: sourceResult.rows.map((source): ResearchSourceRecord => ({
        id: text(source.id), type: text(source.source_type), key: text(source.source_key), title: text(source.title),
        checkedAt: optionalText(source.checked_at), role: text(source.link_role), payload: objectValue(source.payload)
      }))
    };
  }, { readOnly: true });
}
