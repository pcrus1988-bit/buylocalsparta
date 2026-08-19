import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function bool(value: unknown): boolean { return value === true; }
function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type VerifiedProspectRecord = Readonly<{
  id: string;
  applicationId: string;
  applicationState: string;
  tradingName: string;
  legalName: string;
  taxNumber?: string;
  gemiNumber?: string;
  contactEmail: string;
  phone?: string;
  postcode?: string;
  requestedPlanCode: string;
  verificationNotes?: string;
  verificationCompletedAt?: string;
  publicDirectoryVisible: boolean;
  agreementId?: string;
  agreementCode?: string;
  agreementStatus?: string;
  agreementReady: boolean;
  locationCount: number;
  activeLocationCount: number;
  updatedAt?: string;
}>;

function prospectFromRow(row: SqlRow): VerifiedProspectRecord {
  const agreementStatus = optionalText(row.agreement_status);
  const signedDocumented = Boolean(row.signed_at && optionalText(row.source_document_reference));
  const govgrVerified = Boolean(
    row.signed_pdf_object_key &&
    row.signed_pdf_sha256 &&
    row.signed_document_received_at &&
    optionalText(row.govgr_reference) &&
    row.govgr_verified_at &&
    row.govgr_verified_by
  );
  const agreementReady = (agreementStatus === "active" && signedDocumented) ||
    (["govgr_verified", "eligible_for_activation"].includes(agreementStatus ?? "") && signedDocumented && govgrVerified);

  return {
    id: text(row.vendor_public_id),
    applicationId: text(row.application_public_id),
    applicationState: text(row.application_status),
    tradingName: text(row.trading_name),
    legalName: text(row.legal_name),
    taxNumber: optionalText(row.tax_number),
    gemiNumber: optionalText(row.gemi_number),
    contactEmail: text(row.contact_email),
    phone: optionalText(row.phone),
    postcode: optionalText(row.postcode),
    requestedPlanCode: text(row.requested_plan_code),
    verificationNotes: optionalText(row.verification_notes),
    verificationCompletedAt: optionalText(row.verification_completed_at),
    publicDirectoryVisible: bool(row.public_directory_visible),
    agreementId: optionalText(row.agreement_public_id),
    agreementCode: optionalText(row.agreement_code),
    agreementStatus,
    agreementReady,
    locationCount: numberValue(row.location_count),
    activeLocationCount: numberValue(row.active_location_count),
    updatedAt: optionalText(row.updated_at)
  };
}

export async function verifiedProspectsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) {
    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: false,
      summary: { total: 0, verification: 0, catalog: 0, testReady: 0, contractReady: 0, restricted: 0 },
      prospects: [] as VerifiedProspectRecord[]
    };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const rows = await tx.query<SqlRow>(`
      SELECT
        vb.public_id AS vendor_public_id,
        vb.trading_name,
        vb.legal_name,
        vb.tax_number,
        vb.gemi_number,
        vb.verification_completed_at::text AS verification_completed_at,
        vb.public_directory_visible,
        a.public_id AS application_public_id,
        a.status::text AS application_status,
        a.contact_email,
        a.phone,
        a.postcode,
        a.requested_plan_code,
        a.verification_notes,
        a.updated_at::text AS updated_at,
        COALESCE(loc.location_count,0)::int AS location_count,
        COALESCE(loc.active_location_count,0)::int AS active_location_count,
        ag.public_id AS agreement_public_id,
        ag.agreement_code,
        ag.status::text AS agreement_status,
        ag.signed_at,
        ag.source_document_reference,
        ag.signed_pdf_object_key,
        ag.signed_pdf_sha256,
        ag.signed_document_received_at,
        ag.govgr_reference,
        ag.govgr_verified_at,
        ag.govgr_verified_by
      FROM vendor_applications a
      JOIN vendor_businesses vb ON vb.id = a.vendor_id
      JOIN markets m ON m.id = a.market_id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS location_count,
               count(*) FILTER (WHERE active=true)::int AS active_location_count
        FROM vendor_locations l
        WHERE l.vendor_id = vb.id
      ) loc ON true
      LEFT JOIN LATERAL (
        SELECT ca.public_id,ca.agreement_code,ca.status,ca.signed_at,ca.source_document_reference,
               ca.signed_pdf_object_key,ca.signed_pdf_sha256,ca.signed_document_received_at,
               ca.govgr_reference,ca.govgr_verified_at,ca.govgr_verified_by
        FROM vendor_commercial_agreements ca
        WHERE ca.vendor_id = vb.id
        ORDER BY CASE ca.status
          WHEN 'active' THEN 0
          WHEN 'eligible_for_activation' THEN 1
          WHEN 'govgr_verified' THEN 2
          ELSE 3 END,
          ca.updated_at DESC NULLS LAST,ca.created_at DESC
        LIMIT 1
      ) ag ON true
      WHERE m.code='sparta'
        AND a.vendor_id IS NOT NULL
        AND a.status::text <> 'active'
      ORDER BY
        CASE a.status::text
          WHEN 'verification_pending' THEN 0
          WHEN 'catalog_onboarding' THEN 1
          WHEN 'test_ready' THEN 2
          WHEN 'restricted' THEN 3
          WHEN 'suspended' THEN 4
          WHEN 'closed' THEN 5
          ELSE 6 END,
        a.updated_at DESC,
        lower(vb.trading_name)
      LIMIT 500`);

    const prospects = rows.rows.map(prospectFromRow);
    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      summary: {
        total: prospects.length,
        verification: prospects.filter((item) => item.applicationState === "verification_pending").length,
        catalog: prospects.filter((item) => item.applicationState === "catalog_onboarding").length,
        testReady: prospects.filter((item) => item.applicationState === "test_ready").length,
        contractReady: prospects.filter((item) => item.agreementReady).length,
        restricted: prospects.filter((item) => ["restricted", "suspended", "closed"].includes(item.applicationState)).length
      },
      prospects
    };
  }, { readOnly: true });
}
