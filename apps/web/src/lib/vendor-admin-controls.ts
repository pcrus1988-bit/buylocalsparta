import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

export type AdminVendorAgreementSummary = Readonly<{
  id: string;
  code: string;
  version: number;
  status: string;
  startsAt?: string;
  endsAt?: string;
  signedAt?: string;
  commissionRateBps: number;
  listingFeeMinor?: number;
  recurringFeeMinor?: number;
  recurringFeePeriod?: string;
  sourceDocumentReference?: string;
}>;

export type AdminManagedVendorShop = Readonly<{
  id: string;
  tradingName: string;
  legalName: string;
  status: string;
  operationalActive: boolean;
  publicDirectoryVisible: boolean;
  publicDirectoryVisibilityUpdatedAt?: string;
  publicDirectoryVisibilityReason?: string;
  applicationId?: string;
  applicationState?: string;
  researchVendor: boolean;
  locationCount: number;
  activeLocationCount: number;
  approvedOfferCount: number;
  agreementCount: number;
  cooperationDocumented: boolean;
  agreement?: AdminVendorAgreementSummary;
}>;

export async function adminVendorShopsWorkspace(principal: SessionPrincipal) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) {
    return { csrfToken: principal.csrfToken, databaseConfigured: false, shops: [] as AdminManagedVendorShop[] };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const rows = await tx.query<SqlRow>(`
      SELECT
        v.public_id,
        v.trading_name,
        v.legal_name,
        v.status::text AS vendor_status,
        v.public_directory_visible,
        v.public_directory_visibility_updated_at,
        v.public_directory_visibility_reason,
        app.public_id AS application_public_id,
        app.status::text AS application_status,
        (v.public_id LIKE 'vendor_research_%') AS research_vendor,
        COALESCE(loc.location_count,0)::int AS location_count,
        COALESCE(loc.active_location_count,0)::int AS active_location_count,
        COALESCE(offers.approved_offer_count,0)::int AS approved_offer_count,
        COALESCE(agreements.agreement_count,0)::int AS agreement_count,
        agreement.public_id AS agreement_public_id,
        agreement.agreement_code,
        agreement.agreement_version,
        agreement.status AS agreement_status,
        agreement.starts_at,
        agreement.ends_at,
        agreement.signed_at,
        agreement.commission_rate_bps,
        agreement.listing_fee_minor,
        agreement.recurring_fee_minor,
        agreement.recurring_fee_period,
        agreement.source_document_reference
      FROM vendor_businesses v
      JOIN markets m ON m.id=v.market_id
      LEFT JOIN LATERAL (
        SELECT a.public_id,a.status
        FROM vendor_applications a
        WHERE a.vendor_id=v.id
        ORDER BY a.updated_at DESC,a.created_at DESC
        LIMIT 1
      ) app ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS location_count,
               count(*) FILTER (WHERE active=true)::int AS active_location_count
        FROM vendor_locations l WHERE l.vendor_id=v.id
      ) loc ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS approved_offer_count
        FROM vendor_offers o WHERE o.vendor_id=v.id AND o.status='approved'
      ) offers ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS agreement_count
        FROM vendor_commercial_agreements a WHERE a.vendor_id=v.id
      ) agreements ON true
      LEFT JOIN LATERAL (
        SELECT a.*
        FROM vendor_commercial_agreements a
        WHERE a.vendor_id=v.id
        ORDER BY
          CASE a.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
          a.updated_at DESC,a.created_at DESC
        LIMIT 1
      ) agreement ON true
      WHERE m.code='sparta'
        AND (
          v.public_id NOT LIKE 'vendor_research_%'
          OR app.public_id IS NOT NULL
          OR v.status::text <> 'invited'
        )
      ORDER BY
        CASE v.status::text WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 WHEN 'restricted' THEN 2 WHEN 'closed' THEN 3 ELSE 4 END,
        lower(v.trading_name),v.public_id
    `);

    const shops = rows.rows.map((row): AdminManagedVendorShop => {
      const agreementId = optionalText(row.agreement_public_id);
      const sourceDocumentReference = optionalText(row.source_document_reference);
      const signedAt = iso(row.signed_at);
      const agreement = agreementId ? {
        id: agreementId,
        code: text(row.agreement_code),
        version: numberValue(row.agreement_version),
        status: text(row.agreement_status),
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        signedAt,
        commissionRateBps: numberValue(row.commission_rate_bps),
        listingFeeMinor: optionalNumber(row.listing_fee_minor),
        recurringFeeMinor: optionalNumber(row.recurring_fee_minor),
        recurringFeePeriod: optionalText(row.recurring_fee_period),
        sourceDocumentReference
      } satisfies AdminVendorAgreementSummary : undefined;
      return {
        id: text(row.public_id),
        tradingName: text(row.trading_name),
        legalName: text(row.legal_name),
        status: text(row.vendor_status),
        operationalActive: text(row.vendor_status) === "active",
        publicDirectoryVisible: bool(row.public_directory_visible),
        publicDirectoryVisibilityUpdatedAt: iso(row.public_directory_visibility_updated_at),
        publicDirectoryVisibilityReason: optionalText(row.public_directory_visibility_reason),
        applicationId: optionalText(row.application_public_id),
        applicationState: optionalText(row.application_status),
        researchVendor: bool(row.research_vendor),
        locationCount: numberValue(row.location_count),
        activeLocationCount: numberValue(row.active_location_count),
        approvedOfferCount: numberValue(row.approved_offer_count),
        agreementCount: numberValue(row.agreement_count),
        cooperationDocumented: agreement?.status === "active" && Boolean(agreement.signedAt && agreement.sourceDocumentReference),
        agreement
      };
    });
    return { csrfToken: principal.csrfToken, databaseConfigured: true, shops };
  }, { readOnly: true });
}

export async function setAdminVendorOperationalState(principal: SessionPrincipal, input: { vendorId: string; active: boolean; reason: string; now?: number }) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("Vendor shop controls require the production database");
  if (input.reason.trim().length < 3) throw new Error("Operational-state reason is required");

  const now = input.now ?? Date.now();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const vendorResult = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,status::text AS status
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1
      FOR UPDATE`, [input.vendorId]);
    const vendor = vendorResult.rows[0];
    if (!vendor) throw new Error("Vendor shop not found");
    const vendorUuid = text(vendor.vendor_uuid);
    const vendorPublicId = text(vendor.public_id);
    const from = text(vendor.status);
    const researchOnly = vendorPublicId.startsWith("vendor_research_");

    const applications = await tx.query<SqlRow>(`
      SELECT id::text AS application_uuid,public_id,status::text AS status
      FROM vendor_applications
      WHERE vendor_id=$1::uuid
      FOR UPDATE`, [vendorUuid]);

    if (input.active) {
      if (from === "closed") throw new Error("Closed shops cannot be reopened with the operational toggle");
      if (researchOnly && applications.rowCount === 0) throw new Error("Research prospects must complete formal onboarding before activation");
      await tx.query(`UPDATE vendor_businesses
        SET status='active',contract_started_at=COALESCE(contract_started_at,$2),contract_ended_at=NULL,updated_at=$2
        WHERE id=$1::uuid`, [vendorUuid, new Date(now)]);
    } else {
      if (from === "closed") throw new Error("Closed shops are already non-operational");
      await tx.query(`UPDATE vendor_businesses
        SET status='suspended',updated_at=$2
        WHERE id=$1::uuid`, [vendorUuid, new Date(now)]);
    }

    const target = input.active ? "active" : "suspended";
    for (const application of applications.rows) {
      const applicationFrom = text(application.status);
      if (applicationFrom === target) continue;
      if (!["active", "restricted", "suspended"].includes(applicationFrom)) continue;
      await tx.query("UPDATE vendor_applications SET status=$2,updated_at=$3 WHERE id=$1::uuid", [text(application.application_uuid), target, new Date(now)]);
      await tx.query(`INSERT INTO vendor_application_events(id,public_id,application_id,from_status,to_status,actor_user_id,actor_public_id,reason,occurred_at)
        VALUES($1,$2,$3::uuid,$4,$5,(SELECT id FROM users WHERE public_id=$6 OR id::text=$6 LIMIT 1),$6,$7,$8)`, [
        randomUUID(), `vapp_event_${randomUUID().replaceAll("-", "").slice(0, 20)}`, text(application.application_uuid), applicationFrom, target,
        principal.userId, input.reason.trim(), new Date(now)
      ]);
    }

    return { vendorId: vendorPublicId, from, to: target, applicationCount: applications.rowCount };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, input.active ? "vendor.shop_activated" : "vendor.shop_deactivated", "vendor_business", result.vendorId, input.reason.trim(), result);
  return result;
}

export async function setAdminVendorDirectoryVisibility(principal: SessionPrincipal, input: { vendorId: string; visible: boolean; reason?: string; now?: number }) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("Vendor visibility controls require the production database");
  const now = input.now ?? Date.now();
  const reason = input.reason?.trim() || (input.visible ? "Admin published vendor directory profile" : "Admin hid vendor directory profile");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const vendorResult = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,status::text AS status,public_directory_visible
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1
      FOR UPDATE`, [input.vendorId]);
    const vendor = vendorResult.rows[0];
    if (!vendor) throw new Error("Vendor shop not found");
    const vendorUuid = text(vendor.vendor_uuid);
    const vendorPublicId = text(vendor.public_id);
    const status = text(vendor.status);
    const isResearchListing = vendorPublicId.startsWith("vendor_research_") && status === "invited";

    if (input.visible && status !== "active" && !isResearchListing) {
      throw new Error("Only active shops or invited research listings can be made publicly visible");
    }

    if (input.visible && status === "active") {
      const agreement = await tx.query<SqlRow>(`
        SELECT status,signed_at,source_document_reference
        FROM vendor_commercial_agreements
        WHERE vendor_id=$1::uuid
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,updated_at DESC,created_at DESC
        LIMIT 1`, [vendorUuid]);
      const current = agreement.rows[0];
      if (!current || text(current.status) !== "active" || !current.signed_at || !optionalText(current.source_document_reference)) {
        throw new Error("Record an active signed cooperation agreement with a document reference before publishing this shop");
      }
    }

    await tx.query(`UPDATE vendor_businesses
      SET public_directory_visible=$2,
          public_directory_visibility_updated_at=$3,
          public_directory_visibility_updated_by=(SELECT id FROM users WHERE public_id=$4 OR id::text=$4 LIMIT 1),
          public_directory_visibility_reason=$5,
          updated_at=$3
      WHERE id=$1::uuid`, [vendorUuid, input.visible, new Date(now), principal.userId, reason]);

    return { vendorId: vendorPublicId, visible: input.visible, status };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, input.visible ? "vendor.directory_published" : "vendor.directory_hidden", "vendor_business", result.vendorId, reason, result);
  return result;
}

export async function recordAdminVendorAgreement(principal: SessionPrincipal, input: {
  vendorId: string;
  agreementCode: string;
  status: "draft" | "active" | "suspended" | "expired" | "terminated";
  sourceDocumentReference?: string;
  commissionRateBps: number;
  listingFeeMinor?: number;
  recurringFeeMinor?: number;
  recurringFeePeriod?: "month" | "year" | "term";
  startsAt?: string;
  endsAt?: string;
  reason: string;
  now?: number;
}) {
  assertAdminPermission(principal, "vendor.manage");
  if (!productionDatabaseConfigured()) throw new Error("Cooperation records require the production database");
  const code = input.agreementCode.trim();
  const reason = input.reason.trim();
  if (code.length < 2 || code.length > 80) throw new Error("Agreement code is required");
  if (reason.length < 3) throw new Error("Agreement audit reason is required");
  if (!Number.isSafeInteger(input.commissionRateBps) || input.commissionRateBps < 0 || input.commissionRateBps > 10_000) throw new Error("Commission must be between 0% and 100%");
  for (const value of [input.listingFeeMinor, input.recurringFeeMinor]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Agreement fees must be non-negative amounts");
  }
  const documentReference = input.sourceDocumentReference?.trim() || undefined;
  if (input.status === "active" && !documentReference) throw new Error("An active cooperation agreement requires a document reference");

  const now = input.now ?? Date.now();
  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date(now);
  if (!Number.isFinite(startsAt.getTime())) throw new Error("Invalid agreement start date");
  const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
  if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt)) throw new Error("Agreement end date must be after the start date");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const vendorResult = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,market_id::text AS market_uuid
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1
      FOR UPDATE`, [input.vendorId]);
    const vendor = vendorResult.rows[0];
    if (!vendor) throw new Error("Vendor shop not found");
    const vendorUuid = text(vendor.vendor_uuid);
    const vendorPublicId = text(vendor.public_id);
    const marketUuid = text(vendor.market_uuid);

    const versionResult = await tx.query<SqlRow>(`SELECT COALESCE(MAX(agreement_version),0)::int + 1 AS next_version
      FROM vendor_commercial_agreements WHERE vendor_id=$1::uuid AND agreement_code=$2`, [vendorUuid, code]);
    const version = numberValue(versionResult.rows[0]?.next_version) || 1;
    const subscription = await tx.query<SqlRow>(`SELECT id::text AS subscription_uuid FROM vendor_subscriptions
      WHERE vendor_id=$1::uuid ORDER BY updated_at DESC,created_at DESC LIMIT 1`, [vendorUuid]);
    const publicId = `agreement_${randomUUID().replaceAll("-", "").slice(0, 24)}`;

    if (input.status === "active") {
      await tx.query(`UPDATE vendor_commercial_agreements
        SET status='terminated',ends_at=CASE WHEN starts_at < $2 THEN $2 ELSE ends_at END,updated_at=$2
        WHERE vendor_id=$1::uuid AND status='active'`, [vendorUuid, new Date(now)]);
    }

    await tx.query(`INSERT INTO vendor_commercial_agreements(
      id,public_id,market_id,vendor_id,subscription_id,agreement_code,agreement_version,status,starts_at,ends_at,signed_at,
      commission_rate_bps,commission_basis,commission_tax_mode,commission_tax_rate_bps,commission_applies_to_shipping,
      listing_fee_minor,recurring_fee_minor,recurring_fee_period,source_document_reference,terms_snapshot,created_by,created_at,updated_at
    ) VALUES(
      $1,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,$9,$10,$11,
      $12,'merchandise_gross','included',2400,false,
      $13,$14,$15,$16,$17::jsonb,(SELECT id FROM users WHERE public_id=$18 OR id::text=$18 LIMIT 1),$19,$19
    )`, [
      randomUUID(), publicId, marketUuid, vendorUuid, optionalText(subscription.rows[0]?.subscription_uuid) ?? null, code, version, input.status,
      startsAt, endsAt ?? null, input.status === "active" ? new Date(now) : null, input.commissionRateBps,
      input.listingFeeMinor ?? null, input.recurringFeeMinor ?? null, input.recurringFeePeriod ?? null, documentReference ?? null,
      JSON.stringify({ recordedByAdmin: true, auditReason: reason }), principal.userId, new Date(now)
    ]);

    if (input.status === "active") {
      await tx.query(`UPDATE vendor_businesses SET contract_started_at=COALESCE(contract_started_at,$2),contract_ended_at=NULL,updated_at=$2 WHERE id=$1::uuid`, [vendorUuid, new Date(now)]);
    }

    return { vendorId: vendorPublicId, agreementId: publicId, agreementCode: code, agreementVersion: version, status: input.status, sourceDocumentReference: documentReference };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, "vendor.cooperation_documented", "vendor_commercial_agreement", result.agreementId, reason, result);
  return result;
}
