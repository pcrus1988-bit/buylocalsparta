"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PostgresUnitOfWork, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { assertAdminCsrf, assertAdminPermission, recordAdminAudit, transitionVendorApplication } from "../../../lib/admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../lib/postgres-runtime";
import { ensureExistingHubProspectTrial, hubProspectDisplayReference } from "../../../lib/hub-prospect-application-runtime";
import { sendHubProspectApplicationReceiptEmail, sendHubProspectStateEmail } from "../../../lib/vendor-email-workflows";
import { buildVendorTrialAccessUrl, createVendorTrialAccessToken } from "../../../lib/vendor-trial-runtime";

const text = (value: unknown) => typeof value === "string" ? value : String(value ?? "");
const optionalText = (value: unknown) => {
  const result = text(value).trim();
  return result || undefined;
};

async function requireVendorAdmin(csrfToken: string) {
  const principal = await getAdminSession();
  if (!principal) throw new Error("Admin session required");
  assertAdminPermission(principal, "vendor.manage");
  assertAdminCsrf(principal, csrfToken);
  if (!productionDatabaseConfigured()) throw new Error("Production database is required");
  return principal;
}

function revalidateVendorLifecycle(vendorPublicId?: string) {
  revalidatePath("/admin/applications");
  revalidatePath("/admin/partners/pipeline");
  revalidatePath("/admin/research-vendors");
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/partners");
  if (vendorPublicId) {
    revalidatePath(`/admin/partners/${encodeURIComponent(vendorPublicId)}/catalogue`);
    revalidatePath(`/demo/vendor/${encodeURIComponent(vendorPublicId)}`);
  }
}

export async function promoteResearchVendorToApplications(formData: FormData) {
  const principal = await requireVendorAdmin(text(formData.get("csrfToken")));
  const vendorId = text(formData.get("vendorId")).trim();
  const reason = text(formData.get("reason")).trim();
  if (!vendorId) throw new Error("Vendor is required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character reason is required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const current = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,trading_name,status::text AS status,demo_mode
      FROM vendor_businesses
      WHERE public_id=$1 OR id::text=$1
      FOR UPDATE
    `, [vendorId]);
    if (!current.rowCount) throw new Error("Research vendor not found");
    const vendor = current.rows[0];
    const status = text(vendor.status);
    if (status === "invited") {
      await tx.query("UPDATE vendor_businesses SET status='application_started',updated_at=now() WHERE id=$1::uuid", [text(vendor.vendor_uuid)]);
    } else if (!["application_started", "verification_pending", "catalog_onboarding", "test_ready"].includes(status)) {
      throw new Error(`Vendor cannot be moved to Applications while status is ${status}`);
    }
    return { publicId: text(vendor.public_id), previousStatus: status, tradingName: text(vendor.trading_name) };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, "vendor.research_promoted_to_application", "vendor", result.publicId, reason, {
    fromStatus: result.previousStatus,
    toStatus: result.previousStatus === "invited" ? "application_started" : result.previousStatus,
    source: "research_vendors"
  });
  revalidateVendorLifecycle(result.publicId);
}

type ApplicationRow = SqlRow & {
  application_uuid: string;
  application_public_id: string;
  application_status: string;
  owner_uuid: string;
  market_uuid: string;
  legal_name: string;
  trading_name: string;
  tax_number: string | null;
  gemi_number: string | null;
  contact_email: string;
  phone: string | null;
  address_line1: string;
  postcode: string;
  shop_story: string | null;
  vendor_uuid: string | null;
  vendor_public_id: string | null;
};

async function ensureApplicationVendor(tx: SqlExecutor, applicationId: string) {
  const applicationResult = await tx.query<ApplicationRow>(`
    SELECT a.id::text AS application_uuid,a.public_id AS application_public_id,a.status::text AS application_status,
           a.owner_user_id::text AS owner_uuid,a.market_id::text AS market_uuid,a.legal_name,a.trading_name,
           a.tax_number,a.gemi_number,a.contact_email::text AS contact_email,a.phone,a.address_line1,a.postcode,a.shop_story,
           a.vendor_id::text AS vendor_uuid,v.public_id AS vendor_public_id
    FROM vendor_applications a
    LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
    WHERE a.public_id=$1 OR a.id::text=$1
    FOR UPDATE OF a
  `, [applicationId]);
  if (!applicationResult.rowCount) throw new Error("Vendor application not found");
  const application = applicationResult.rows[0];
  const applicationStatus = text(application.application_status);
  if (["active", "restricted", "suspended", "closed"].includes(applicationStatus)) {
    throw new Error(`DEMO preparation is not available for ${applicationStatus} applications`);
  }

  let vendorUuid = optionalText(application.vendor_uuid);
  let vendorPublicId = optionalText(application.vendor_public_id);

  if (!vendorUuid) {
    const candidate = await tx.query<SqlRow>(`
      SELECT id::text AS vendor_uuid,public_id,status::text AS status
      FROM vendor_businesses
      WHERE market_id=$1::uuid
        AND (($2::text IS NOT NULL AND tax_number=$2) OR lower(trading_name)=lower($3))
      ORDER BY CASE WHEN $2::text IS NOT NULL AND tax_number=$2 THEN 0 ELSE 1 END,updated_at DESC
      LIMIT 1
      FOR UPDATE
    `, [text(application.market_uuid), optionalText(application.tax_number) ?? null, text(application.trading_name)]);

    if (candidate.rowCount) {
      const existing = candidate.rows[0];
      const existingStatus = text(existing.status);
      if (["active", "restricted", "suspended", "closed"].includes(existingStatus)) {
        throw new Error(`A matching vendor already exists with status ${existingStatus}; review the partner record before linking this application`);
      }
      vendorUuid = text(existing.vendor_uuid);
      vendorPublicId = text(existing.public_id);
      if (existingStatus === "invited") {
        await tx.query("UPDATE vendor_businesses SET status='application_started',updated_at=now() WHERE id=$1::uuid", [vendorUuid]);
      }
    } else {
      vendorUuid = randomUUID();
      vendorPublicId = `vendor_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      await tx.query(`
        INSERT INTO vendor_businesses(id,public_id,market_id,legal_name,trading_name,tax_number,gemi_number,status,created_at,updated_at)
        VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7,'application_started',now(),now())
      `, [vendorUuid, vendorPublicId, text(application.market_uuid), text(application.legal_name), text(application.trading_name), optionalText(application.tax_number) ?? null, optionalText(application.gemi_number) ?? null]);
    }

    await tx.query("UPDATE vendor_applications SET vendor_id=$2::uuid,updated_at=now() WHERE id=$1::uuid", [text(application.application_uuid), vendorUuid]);

    const location = await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_locations WHERE vendor_id=$1::uuid ORDER BY created_at LIMIT 1", [vendorUuid]);
    if (!location.rowCount) {
      await tx.query(`
        INSERT INTO vendor_locations(id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,phone,public_email,active,created_at,updated_at)
        VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,'Sparta',$7,'GR',$8,$9,true,now(),now())
      `, [randomUUID(), `location_${randomUUID().replaceAll("-", "").slice(0, 20)}`, vendorUuid, text(application.market_uuid), text(application.trading_name), text(application.address_line1), text(application.postcode), optionalText(application.phone) ?? null, text(application.contact_email)]);
    }

    await tx.query(`
      INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at)
      VALUES($1::uuid,$2,$3::uuid,$4::uuid,NULL,true,now())
      ON CONFLICT DO NOTHING
    `, [randomUUID(), `vuser_${randomUUID().replaceAll("-", "").slice(0, 20)}`, vendorUuid, text(application.owner_uuid)]);
    const membership = await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_users WHERE vendor_id=$1::uuid AND user_id=$2::uuid AND location_id IS NULL LIMIT 1", [vendorUuid, text(application.owner_uuid)]);
    if (membership.rowCount) {
      await tx.query("INSERT INTO vendor_user_roles(vendor_user_id,role) VALUES($1::uuid,'vendor_owner') ON CONFLICT DO NOTHING", [text(membership.rows[0].id)]);
    }
    if (optionalText(application.shop_story)) {
      await tx.query(`
        INSERT INTO vendor_profile_translations(vendor_id,locale,story)
        VALUES($1::uuid,'el',$2)
        ON CONFLICT(vendor_id,locale) DO UPDATE SET story=COALESCE(NULLIF(vendor_profile_translations.story,''),EXCLUDED.story)
      `, [vendorUuid, optionalText(application.shop_story)]);
    }
  }

  return { vendorUuid, vendorPublicId: vendorPublicId!, applicationPublicId: text(application.application_public_id), applicationStatus };
}

export async function setApplicationDemoMode(formData: FormData) {
  const principal = await requireVendorAdmin(text(formData.get("csrfToken")));
  const applicationId = text(formData.get("applicationId")).trim();
  const directVendorId = text(formData.get("vendorId")).trim();
  const enabled = text(formData.get("enabled")) === "true";
  const reason = text(formData.get("reason")).trim();
  if (!applicationId && !directVendorId) throw new Error("Application or vendor is required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character reason is required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    let vendorUuid: string;
    let vendorPublicId: string;
    let applicationPublicId: string | undefined;

    if (applicationId) {
      const ensured = await ensureApplicationVendor(tx, applicationId);
      vendorUuid = ensured.vendorUuid!;
      vendorPublicId = ensured.vendorPublicId;
      applicationPublicId = ensured.applicationPublicId;
    } else {
      const vendorResult = await tx.query<SqlRow>(`
        SELECT id::text AS vendor_uuid,public_id,status::text AS status
        FROM vendor_businesses
        WHERE public_id=$1 OR id::text=$1
        FOR UPDATE
      `, [directVendorId]);
      if (!vendorResult.rowCount) throw new Error("Vendor not found");
      vendorUuid = text(vendorResult.rows[0].vendor_uuid);
      vendorPublicId = text(vendorResult.rows[0].public_id);
    }

    const vendorResult = await tx.query<SqlRow>("SELECT status::text AS status,demo_mode FROM vendor_businesses WHERE id=$1::uuid FOR UPDATE", [vendorUuid]);
    const status = text(vendorResult.rows[0]?.status);
    if (enabled && ["active", "restricted", "suspended", "closed"].includes(status)) {
      throw new Error(`DEMO mode cannot be enabled while vendor status is ${status}`);
    }
    await tx.query("UPDATE vendor_businesses SET demo_mode=$2,demo_mode_updated_at=now(),updated_at=now() WHERE id=$1::uuid", [vendorUuid, enabled]);
    return { vendorPublicId, status, applicationPublicId };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, enabled ? "vendor.demo.enabled" : "vendor.demo.disabled", "vendor", result.vendorPublicId, reason, {
    demoMode: enabled,
    operationalStatus: result.status,
    applicationId: result.applicationPublicId ?? null,
    source: "admin_applications"
  });
  revalidateVendorLifecycle(result.vendorPublicId);
}

export async function advanceApplicationToVerification(formData: FormData) {
  const principal = await requireVendorAdmin(text(formData.get("csrfToken")));
  const applicationId = text(formData.get("applicationId")).trim();
  const reason = text(formData.get("reason")).trim();
  if (!applicationId) throw new Error("Application is required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character reason is required");
  await transitionVendorApplication(principal, { applicationId, to: "verification_pending", reason });
  revalidateVendorLifecycle();
}


type HubProspectStatus = "pending" | "contacted" | "qualified" | "verified" | "approved" | "declined" | "converted";

const HUB_PROSPECT_TRANSITIONS: Readonly<Record<HubProspectStatus, readonly HubProspectStatus[]>> = {
  pending: ["contacted", "declined"],
  contacted: ["qualified", "declined"],
  qualified: ["verified", "declined"],
  verified: ["approved", "declined"],
  approved: ["converted", "declined"],
  declined: ["contacted"],
  converted: []
};

function hubProspectStatus(value: unknown): HubProspectStatus {
  const status = text(value).trim() as HubProspectStatus;
  if (!Object.prototype.hasOwnProperty.call(HUB_PROSPECT_TRANSITIONS, status)) {
    throw new Error("Invalid HUB application status");
  }
  return status;
}

export async function setHubProspectStatus(formData: FormData) {
  const principal = await requireVendorAdmin(text(formData.get("csrfToken")));
  const applicationId = text(formData.get("applicationId")).trim();
  const target = hubProspectStatus(formData.get("status"));
  const reason = text(formData.get("reason")).trim();
  if (!applicationId) throw new Error("HUB application is required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character reason is required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const current = await tx.query<SqlRow>(`
      SELECT public_id,hub_slug,business_name,email,status::text AS status,created_at
      FROM hub_expansion_prospects
      WHERE public_id=$1 OR id::text=$1
      LIMIT 1
      FOR UPDATE
    `, [applicationId]);
    if (!current.rowCount) throw new Error("HUB application not found");
    const row = current.rows[0];
    const from = hubProspectStatus(row.status);
    if (from === target) {
      return {
        publicId: text(row.public_id),
        from,
        to: target,
        email: text(row.email),
        businessName: text(row.business_name),
        reference: hubProspectDisplayReference(text(row.public_id), text(row.hub_slug), new Date(String(row.created_at)).getTime()),
        changed: false
      };
    }
    if (!HUB_PROSPECT_TRANSITIONS[from].includes(target)) {
      throw new Error(`HUB application cannot move from ${from} to ${target}`);
    }
    await tx.query("UPDATE hub_expansion_prospects SET status=$2,updated_at=now() WHERE public_id=$1", [text(row.public_id), target]);
    return {
      publicId: text(row.public_id),
      from,
      to: target,
      email: text(row.email),
      businessName: text(row.business_name),
      reference: hubProspectDisplayReference(text(row.public_id), text(row.hub_slug), new Date(String(row.created_at)).getTime()),
      changed: true
    };
  }, { isolation: "serializable" });

  if (result.changed) {
    await recordAdminAudit(principal, "hub_prospect.status_changed", "hub_prospect", result.publicId, reason, {
      fromStatus: result.from,
      toStatus: result.to,
      source: "admin_applications"
    });
    await sendHubProspectStateEmail({
      to: result.email,
      businessName: result.businessName,
      reference: result.reference,
      state: result.to as Exclude<HubProspectStatus, "pending">,
      reason
    });
  }
  revalidateVendorLifecycle();
}

export async function provisionHubProspectTrialAction(formData: FormData) {
  const principal = await requireVendorAdmin(text(formData.get("csrfToken")));
  const applicationId = text(formData.get("applicationId")).trim();
  const reason = text(formData.get("reason")).trim();
  if (!applicationId) throw new Error("HUB application is required");
  if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character reason is required");

  const result = await ensureExistingHubProspectTrial({ applicationId, now: Date.now() });
  const access = createVendorTrialAccessToken({
    applicationId: result.trial.applicationId,
    ownerUserId: result.trial.ownerUserId,
    vendorId: result.trial.vendorId,
    trialStartedAt: result.trial.startedAt
  });
  const trialAccessUrl = buildVendorTrialAccessUrl(access.token);
  const delivery = await sendHubProspectApplicationReceiptEmail({
    to: result.email,
    businessName: result.businessName,
    reference: result.reference,
    hubName: result.hubName,
    hubSlug: result.hubSlug,
    planCode: result.planCode,
    billingCycle: result.billingCycle,
    setupFeeCents: result.setupFeeCents,
    recurringFeeCents: result.recurringFeeCents,
    commissionBps: result.commissionBps,
    trialAccessUrl,
    trialExpiresAt: result.trial.expiresAt,
    idempotencySuffix: `admin-${Date.now()}`
  });

  await recordAdminAudit(principal, "hub_prospect.trial_access_sent", "hub_prospect", result.trial.applicationId, reason, {
    reference: result.reference,
    vendorId: result.trial.vendorId,
    emailSent: delivery.sent,
    source: "admin_applications"
  });
  revalidateVendorLifecycle(result.trial.vendorId);
}
