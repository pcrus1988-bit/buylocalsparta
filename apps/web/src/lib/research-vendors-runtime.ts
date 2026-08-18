import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

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

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return { value };
    }
  }
  return {};
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
  checkedAt?: string;
  onlineShopActive?: string;
  onlineShopUrl?: string;
  latestIssueSeverity?: string;
  latestIssueType?: string;
  sourceCount: number;
  issueCount: number;
  verificationCount: number;
  subscriptionStatus?: string;
  planCode?: string;
  updatedAt?: string;
};

export type ResearchVendorLocation = {
  id: string;
  name: string;
  address: string;
  locality: string;
  postcode: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  active: boolean;
};

export type ResearchVendorSourceRecord = {
  id: string;
  sourceType: string;
  sourceKey: string;
  title: string;
  checkedAt?: string;
  linkRole: string;
  payload: Record<string, unknown>;
};

export type ResearchVendorDetail = ResearchVendorRecord & {
  taxNumber?: string;
  gemiNumber?: string;
  legalForm?: string;
  gemiResearch?: string;
  candidateLegalName?: string;
  candidateGemi?: string;
  candidateVat?: string;
  verificationAction?: string;
  directoryCategories?: string;
  listingSource?: string;
  directoryProfile?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  profileSourcePayload: Record<string, unknown>;
  locations: ResearchVendorLocation[];
  sources: ResearchVendorSourceRecord[];
};

const baseResearchSelect = `
  SELECT
    vb.id::text AS vendor_uuid,
    vb.public_id,
    vb.trading_name,
    vb.legal_name,
    vb.status::text AS status,
    vl.address_line1,
    vl.locality,
    vl.postcode,
    vl.phone,
    vl.public_email::text AS public_email,
    vpt.short_description,
    p.source_kind,
    p.primary_census_id,
    p.major_branch,
    p.sub_branch,
    p.marketplace_scope,
    p.distance_km,
    p.outreach_priority,
    p.outreach_score,
    p.regulation_flag,
    p.recommended_commerce_mode,
    p.storefront_status,
    p.checked_at::text AS checked_at,
    p.online_shop_active,
    p.online_shop_url,
    p.latest_issue_severity,
    p.latest_issue_type,
    COALESCE(src.source_count,0)::int AS source_count,
    COALESCE(src.issue_count,0)::int AS issue_count,
    COALESCE(ver.verified_count,0)::int AS verified_count,
    vs.status AS subscription_status,
    vp.code AS plan_code,
    vb.updated_at::text AS updated_at
  FROM vendor_businesses vb
  JOIN markets m ON m.id = vb.market_id
  JOIN vendor_research_profiles p ON p.vendor_id = vb.id
  LEFT JOIN LATERAL (
    SELECT l.address_line1,l.locality,l.postcode,l.phone,l.public_email
    FROM vendor_locations l
    WHERE l.vendor_id = vb.id
    ORDER BY l.is_primary DESC NULLS LAST,l.active DESC,l.created_at ASC
    LIMIT 1
  ) vl ON true
  LEFT JOIN vendor_profile_translations vpt ON vpt.vendor_id = vb.id AND vpt.locale = 'el'
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS source_count,
      count(*) FILTER (WHERE s.source_type = 'eshop_issue')::int AS issue_count
    FROM vendor_research_source_links l
    JOIN vendor_research_source_records s ON s.id = l.source_id
    WHERE l.vendor_id = vb.id
  ) src ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE status IN ('verified','passed','approved'))::int AS verified_count
    FROM vendor_verification_checks c
    WHERE c.vendor_id = vb.id
  ) ver ON true
  LEFT JOIN LATERAL (
    SELECT s.status,s.plan_id
    FROM vendor_subscriptions s
    WHERE s.vendor_id = vb.id
    ORDER BY s.updated_at DESC NULLS LAST,s.created_at DESC
    LIMIT 1
  ) vs ON true
  LEFT JOIN vendor_plans vp ON vp.id = vs.plan_id
`;

function mapResearchVendor(row: SqlRow): ResearchVendorRecord {
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
    checkedAt: optionalText(row.checked_at),
    onlineShopActive: optionalText(row.online_shop_active),
    onlineShopUrl: optionalText(row.online_shop_url),
    latestIssueSeverity: optionalText(row.latest_issue_severity),
    latestIssueType: optionalText(row.latest_issue_type),
    sourceCount: numberValue(row.source_count),
    issueCount: numberValue(row.issue_count),
    verificationCount: numberValue(row.verified_count),
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
    const summaryResult = await tx.query<SqlRow>(`
      WITH research AS (
        SELECT vb.id, vb.status::text AS status
        FROM vendor_businesses vb
        JOIN markets m ON m.id = vb.market_id
        JOIN vendor_research_profiles p ON p.vendor_id = vb.id
        WHERE m.code = 'sparta'
      )
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'invited')::int AS invited,
        count(*) FILTER (WHERE status IN ('application_started','verification_pending','catalog_onboarding','test_ready'))::int AS in_progress,
        count(*) FILTER (WHERE status = 'active')::int AS active,
        count(*) FILTER (WHERE status IN ('restricted','suspended','closed'))::int AS restricted,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM vendor_research_source_links l
            WHERE l.vendor_id = research.id
          )
        )::int AS with_evidence
      FROM research`);

    const rows = await tx.query<SqlRow>(`${baseResearchSelect}
      WHERE m.code = 'sparta'
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
        COALESCE(p.outreach_score,0) DESC,
        lower(vb.trading_name),vb.public_id
      LIMIT 500`);

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
        withEvidence: numberValue(summaryRow.with_evidence)
      },
      vendors: rows.rows.map(mapResearchVendor)
    };
  }, { readOnly: true });
}

export async function researchVendorDetail(principal: SessionPrincipal, publicId: string): Promise<ResearchVendorDetail | null> {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) return null;

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const detailResult = await tx.query<SqlRow>(`${baseResearchSelect.replace(
      "vb.updated_at::text AS updated_at",
      `vb.tax_number,
    vb.gemi_number,
    vb.legal_form,
    p.gemi_research,
    p.candidate_legal_name,
    p.candidate_gemi,
    p.candidate_vat,
    p.verification_action,
    p.directory_categories,
    p.listing_source,
    p.directory_profile,
    p.primary_phone,
    p.primary_email,
    p.source_payload,
    vb.updated_at::text AS updated_at`
    )}
      WHERE m.code = 'sparta' AND vb.public_id = $1
      LIMIT 1`, [publicId]);

    const row = detailResult.rows[0];
    if (!row) return null;

    const vendorId = text(row.vendor_uuid);
    if (!vendorId) return null;

    const [locationsResult, sourcesResult] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT public_id,name,address_line1,locality,postcode,phone,public_email::text AS public_email,is_primary,active
        FROM vendor_locations
        WHERE vendor_id = $1
        ORDER BY is_primary DESC NULLS LAST,active DESC,created_at ASC`, [vendorId]),
      tx.query<SqlRow>(`
        SELECT
          s.id::text AS id,
          s.source_type,
          s.source_key,
          s.title,
          s.checked_at::text AS checked_at,
          l.link_role,
          s.payload
        FROM vendor_research_source_links l
        JOIN vendor_research_source_records s ON s.id = l.source_id
        WHERE l.vendor_id = $1
        ORDER BY
          CASE s.source_type
            WHEN 'merchant_census' THEN 0
            WHEN 'gemi_sample' THEN 1
            WHEN 'active_online_shop' THEN 2
            WHEN 'eshop_issue' THEN 3
            ELSE 4
          END,
          s.checked_at DESC NULLS LAST,
          s.source_key`, [vendorId])
    ]);

    const base = mapResearchVendor(row);
    return {
      ...base,
      taxNumber: optionalText(row.tax_number),
      gemiNumber: optionalText(row.gemi_number),
      legalForm: optionalText(row.legal_form),
      gemiResearch: optionalText(row.gemi_research),
      candidateLegalName: optionalText(row.candidate_legal_name),
      candidateGemi: optionalText(row.candidate_gemi),
      candidateVat: optionalText(row.candidate_vat),
      verificationAction: optionalText(row.verification_action),
      directoryCategories: optionalText(row.directory_categories),
      listingSource: optionalText(row.listing_source),
      directoryProfile: optionalText(row.directory_profile),
      primaryPhone: optionalText(row.primary_phone),
      primaryEmail: optionalText(row.primary_email),
      profileSourcePayload: jsonObject(row.source_payload),
      locations: locationsResult.rows.map((location): ResearchVendorLocation => ({
        id: text(location.public_id),
        name: text(location.name),
        address: text(location.address_line1),
        locality: text(location.locality),
        postcode: text(location.postcode),
        phone: optionalText(location.phone),
        email: optionalText(location.public_email),
        isPrimary: Boolean(location.is_primary),
        active: Boolean(location.active)
      })),
      sources: sourcesResult.rows.map((source): ResearchVendorSourceRecord => ({
        id: text(source.id),
        sourceType: text(source.source_type),
        sourceKey: text(source.source_key),
        title: text(source.title),
        checkedAt: optionalText(source.checked_at),
        linkRole: text(source.link_role),
        payload: jsonObject(source.payload)
      }))
    };
  }, { readOnly: true });
}
