import { randomUUID } from "node:crypto";
import {
  VendorOnboardingWorkflow,
  can,
  type SessionPrincipal,
  type VendorOnboardingState
} from "@buy-local-sparta/core";
import * as memory from "./admin-memory-runtime";
import { recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorAgreementSummary = Readonly<{
  id: string;
  code: string;
  status: string;
  signedAt?: string;
  startsAt?: string;
  endsAt?: string;
  sourceDocumentReference?: string;
  activationReady: boolean;
}>;

export type VendorOnboardingApplication = Readonly<{
  id: string;
  ownerUserId: string;
  marketId: string;
  vendorId?: string;
  vendorStatus?: VendorOnboardingState;
  legalName: string;
  tradingName: string;
  taxNumber?: string;
  gemiNumber?: string;
  contactEmail: string;
  phone?: string;
  address: string;
  postcode: string;
  primaryCategory: string;
  shopStory?: string;
  requestedPlanCode: string;
  state: VendorOnboardingState;
  verificationNotes?: string;
  createdAt: number;
  updatedAt: number;
  agreement?: VendorAgreementSummary;
  activationReady: boolean;
  researchLinked: boolean;
}>;

export type VendorOperationalShop = Readonly<{
  id: string;
  name: string;
  legalName: string;
  status: VendorOnboardingState;
  publicDirectoryVisible: boolean;
  visibilityUpdatedAt?: string;
  visibilityReason?: string;
  applicationId?: string;
  agreement?: VendorAgreementSummary;
  activationReady: boolean;
  researchLinked: boolean;
}>;

export type VendorOnboardingWorkspace = Readonly<{
  csrfToken: string;
  applications: readonly VendorOnboardingApplication[];
  shops: readonly VendorOperationalShop[];
}>;

function assertVendorManage(principal: SessionPrincipal): void {
  if (!principal.roles.some((role) => can(role, "vendor.manage"))) throw new Error("Admin permission required: vendor.manage");
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function text(value: unknown, field: string): string {
  const result = optionalText(value);
  if (!result) throw new Error(`Invalid database field ${field}`);
  return result;
}

function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function agreementFromRow(row: Record<string, unknown>): VendorAgreementSummary | undefined {
  const id = optionalText(row.agreement_public_id);
  if (!id) return undefined;
  return {
    id,
    code: optionalText(row.agreement_code) ?? id,
    status: optionalText(row.agreement_status) ?? "draft",
    signedAt: iso(row.agreement_signed_at),
    startsAt: iso(row.agreement_starts_at),
    endsAt: iso(row.agreement_ends_at),
    sourceDocumentReference: optionalText(row.agreement_source_document_reference),
    activationReady: row.agreement_activation_ready === true
  };
}

const AGREEMENT_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT ca.public_id AS agreement_public_id,
           ca.agreement_code,
           ca.status AS agreement_status,
           ca.signed_at AS agreement_signed_at,
           ca.starts_at AS agreement_starts_at,
           ca.ends_at AS agreement_ends_at,
           ca.source_document_reference AS agreement_source_document_reference,
           (ca.status='active'
             AND ca.signed_at IS NOT NULL
             AND NULLIF(btrim(ca.source_document_reference),'') IS NOT NULL
             AND ca.starts_at <= now()
             AND (ca.ends_at IS NULL OR ca.ends_at > now())) AS agreement_activation_ready
    FROM vendor_commercial_agreements ca
    WHERE ca.vendor_id=v.id
    ORDER BY CASE WHEN ca.status='active'
                       AND ca.signed_at IS NOT NULL
                       AND NULLIF(btrim(ca.source_document_reference),'') IS NOT NULL
                       AND ca.starts_at <= now()
                       AND (ca.ends_at IS NULL OR ca.ends_at > now())
                  THEN 0 ELSE 1 END,
             ca.updated_at DESC,ca.created_at DESC
    LIMIT 1
  ) agreement ON true`;

export async function vendorOnboardingWorkspace(principal: SessionPrincipal): Promise<VendorOnboardingWorkspace> {
  assertVendorManage(principal);
  if (!productionDatabaseConfigured()) {
    const fallback = memory.adminVendorsWorkspace(principal);
    return {
      csrfToken: fallback.csrfToken,
      applications: fallback.applications.map((item) => ({
        ...item,
        vendorStatus: undefined,
        activationReady: false,
        researchLinked: false
      })),
      shops: []
    };
  }

  const db = getProductionPostgresRuntime().nativePool;
  const [applicationRows, shopRows] = await Promise.all([
    db.query(`
      SELECT a.public_id,a.legal_name,a.trading_name,a.tax_number,a.gemi_number,a.contact_email,a.phone,
             a.address_line1,a.postcode,a.primary_category,a.shop_story,a.requested_plan_code,a.status,
             a.verification_notes,a.created_at,a.updated_at,u.public_id AS owner_public_id,m.code AS market_code,
             v.public_id AS vendor_public_id,v.status::text AS vendor_status,
             agreement.*
      FROM vendor_applications a
      JOIN users u ON u.id=a.owner_user_id
      JOIN markets m ON m.id=a.market_id
      LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
      ${AGREEMENT_LATERAL}
      WHERE m.code='sparta'
      ORDER BY a.updated_at DESC,a.public_id
    `),
    db.query(`
      SELECT v.public_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,v.legal_name,
             v.status::text AS vendor_status,v.public_directory_visible,
             v.public_directory_visibility_updated_at,v.public_directory_visibility_reason,
             linked_application.public_id AS application_public_id,
             agreement.*
      FROM vendor_businesses v
      JOIN markets m ON m.id=v.market_id
      LEFT JOIN LATERAL (
        SELECT a.public_id
        FROM vendor_applications a
        WHERE a.vendor_id=v.id
        ORDER BY a.updated_at DESC,a.created_at DESC
        LIMIT 1
      ) linked_application ON true
      ${AGREEMENT_LATERAL}
      WHERE m.code='sparta' AND v.status <> 'invited'
      ORDER BY CASE WHEN v.status='active' THEN 0 WHEN v.status IN ('restricted','suspended') THEN 1 ELSE 2 END,
               lower(COALESCE(NULLIF(v.trading_name,''),v.legal_name)),v.public_id
    `)
  ]);

  return {
    csrfToken: principal.csrfToken,
    applications: applicationRows.rows.map((row) => {
      const agreement = agreementFromRow(row);
      const vendorId = optionalText(row.vendor_public_id);
      return {
        id: text(row.public_id, "application.public_id"),
        ownerUserId: text(row.owner_public_id, "owner_public_id"),
        marketId: text(row.market_code, "market_code"),
        vendorId,
        vendorStatus: optionalText(row.vendor_status) as VendorOnboardingState | undefined,
        legalName: text(row.legal_name, "legal_name"),
        tradingName: text(row.trading_name, "trading_name"),
        taxNumber: optionalText(row.tax_number),
        gemiNumber: optionalText(row.gemi_number),
        contactEmail: text(row.contact_email, "contact_email"),
        phone: optionalText(row.phone),
        address: text(row.address_line1, "address_line1"),
        postcode: text(row.postcode, "postcode"),
        primaryCategory: text(row.primary_category, "primary_category"),
        shopStory: optionalText(row.shop_story),
        requestedPlanCode: text(row.requested_plan_code, "requested_plan_code"),
        state: text(row.status, "status") as VendorOnboardingState,
        verificationNotes: optionalText(row.verification_notes),
        createdAt: epoch(row.created_at),
        updatedAt: epoch(row.updated_at),
        agreement,
        activationReady: agreement?.activationReady === true,
        researchLinked: Boolean(vendorId?.startsWith("vendor_research_"))
      };
    }),
    shops: shopRows.rows.map((row) => {
      const agreement = agreementFromRow(row);
      const id = text(row.public_id, "vendor.public_id");
      return {
        id,
        name: text(row.vendor_name, "vendor_name"),
        legalName: text(row.legal_name, "legal_name"),
        status: text(row.vendor_status, "vendor_status") as VendorOnboardingState,
        publicDirectoryVisible: row.public_directory_visible === true,
        visibilityUpdatedAt: iso(row.public_directory_visibility_updated_at),
        visibilityReason: optionalText(row.public_directory_visibility_reason),
        applicationId: optionalText(row.application_public_id),
        agreement,
        activationReady: agreement?.activationReady === true,
        researchLinked: id.startsWith("vendor_research_")
      };
    })
  };
}

async function actorUuid(client: any, principal: SessionPrincipal): Promise<string | null> {
  const actor = await client.query("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [principal.userId]);
  return actor.rowCount ? String(actor.rows[0].id) : null;
}

async function documentedAgreement(client: any, vendorUuid: string): Promise<Record<string, unknown>> {
  const result = await client.query(`
    SELECT public_id,agreement_code,signed_at,source_document_reference,starts_at,ends_at
    FROM vendor_commercial_agreements
    WHERE vendor_id=$1
      AND status='active'
      AND signed_at IS NOT NULL
      AND NULLIF(btrim(source_document_reference),'') IS NOT NULL
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at > now())
    ORDER BY updated_at DESC,created_at DESC
    LIMIT 1
  `, [vendorUuid]);
  if (!result.rowCount) {
    throw new Error("Activation blocked: create and activate a signed vendor cooperation agreement with a source document reference first.");
  }
  return result.rows[0];
}

async function createVendorFromApplication(client: any, row: Record<string, unknown>, state: VendorOnboardingState, now: number) {
  const vendorUuid = randomUUID();
  const vendorPublicId = `vendor_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  await client.query(`
    INSERT INTO vendor_businesses(
      id,public_id,market_id,legal_name,trading_name,tax_number,gemi_number,status,
      verification_completed_at,public_directory_visible,public_directory_visibility_updated_at,
      public_directory_visibility_reason,created_at,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$9,$10,$9,$9)
  `, [
    vendorUuid,vendorPublicId,text(row.market_uuid,"market_uuid"),text(row.legal_name,"legal_name"),
    text(row.trading_name,"trading_name"),optionalText(row.tax_number) ?? null,optionalText(row.gemi_number) ?? null,
    state,new Date(now),"Onboarding in progress; publication requires explicit admin approval."
  ]);
  return { vendorUuid, vendorPublicId };
}

async function ensureActivationRelations(client: any, row: Record<string, unknown>, vendorUuid: string, now: number): Promise<void> {
  const at = new Date(now);
  const location = await client.query("SELECT id::text AS id FROM vendor_locations WHERE vendor_id=$1 AND active=true ORDER BY is_primary DESC,created_at LIMIT 1", [vendorUuid]);
  if (!location.rowCount) {
    await client.query(`
      INSERT INTO vendor_locations(
        id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,phone,public_email,
        active,is_primary,verified_at,created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,'Sparta',$7,'GR',$8,$9,true,true,$10,$10,$10)
    `, [
      randomUUID(),`location_${randomUUID().replaceAll("-", "").slice(0, 20)}`,vendorUuid,text(row.market_uuid,"market_uuid"),
      text(row.trading_name,"trading_name"),text(row.address_line1,"address_line1"),text(row.postcode,"postcode"),
      optionalText(row.phone) ?? null,text(row.contact_email,"contact_email"),at
    ]);
  }

  const membership = await client.query("SELECT id::text AS id FROM vendor_users WHERE vendor_id=$1 AND user_id=$2 LIMIT 1 FOR UPDATE", [vendorUuid,text(row.owner_uuid,"owner_uuid")]);
  let membershipUuid: string;
  if (membership.rowCount) {
    membershipUuid = String(membership.rows[0].id);
    await client.query("UPDATE vendor_users SET active=true WHERE id=$1", [membershipUuid]);
  } else {
    membershipUuid = randomUUID();
    await client.query("INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at) VALUES($1,$2,$3,$4,NULL,true,$5)", [membershipUuid,`vuser_${randomUUID().replaceAll("-", "").slice(0, 20)}`,vendorUuid,text(row.owner_uuid,"owner_uuid"),at]);
  }
  await client.query("INSERT INTO vendor_user_roles(vendor_user_id,role) VALUES($1,'vendor_owner') ON CONFLICT DO NOTHING", [membershipUuid]);
  const story = optionalText(row.shop_story);
  if (story) await client.query("INSERT INTO vendor_profile_translations(vendor_id,locale,story) VALUES($1,'el',$2) ON CONFLICT(vendor_id,locale) DO UPDATE SET story=EXCLUDED.story", [vendorUuid,story]);
}

export async function governedVendorTransition(principal: SessionPrincipal, input: { applicationId: string; to: VendorOnboardingState; reason: string }) {
  assertVendorManage(principal);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Transition reason is required");
  if (!productionDatabaseConfigured()) return memory.transitionVendorApplication(principal, input);

  const now = Date.now();
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  let result: { id: string; state: VendorOnboardingState; vendorId?: string; updatedAt: number };
  try {
    await client.query("BEGIN");
    const current = await client.query(`
      SELECT a.id::text AS application_uuid,a.public_id,a.status::text AS status,a.owner_user_id::text AS owner_uuid,
             u.public_id AS owner_public_id,a.market_id::text AS market_uuid,a.legal_name,a.trading_name,a.tax_number,
             a.gemi_number,a.contact_email,a.phone,a.address_line1,a.postcode,a.shop_story,
             a.vendor_id::text AS vendor_uuid,v.public_id AS vendor_public_id,v.status::text AS vendor_status
      FROM vendor_applications a
      JOIN users u ON u.id=a.owner_user_id
      LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
      WHERE a.public_id=$1 OR a.id::text=$1
      FOR UPDATE OF a
    `, [input.applicationId]);
    if (!current.rowCount) throw new Error("Vendor application not found");
    const row = current.rows[0] as Record<string, unknown>;
    const from = text(row.status,"status") as VendorOnboardingState;
    new VendorOnboardingWorkflow(from).transition(input.to, principal.userId, reason, now);

    let vendorUuid = optionalText(row.vendor_uuid);
    let vendorPublicId = optionalText(row.vendor_public_id);

    if (!vendorUuid && ["catalog_onboarding","test_ready"].includes(input.to)) {
      const created = await createVendorFromApplication(client,row,input.to,now);
      vendorUuid = created.vendorUuid;
      vendorPublicId = created.vendorPublicId;
    }

    if (input.to === "active") {
      if (!vendorUuid) throw new Error("Activation blocked: pass verification first so the vendor record can be created and cooperation documentation attached.");
      await documentedAgreement(client,vendorUuid);
      await ensureActivationRelations(client,row,vendorUuid,now);
      await client.query(`
        UPDATE vendor_businesses
        SET status='active',verification_completed_at=COALESCE(verification_completed_at,$2),
            contract_started_at=COALESCE(contract_started_at,$2),public_directory_visible=false,
            public_directory_visibility_updated_at=$2,public_directory_visibility_updated_by=$3,
            public_directory_visibility_reason='Activated; awaiting explicit public visibility approval',updated_at=$2
        WHERE id=$1
      `, [vendorUuid,new Date(now),await actorUuid(client,principal)]);
    } else if (vendorUuid) {
      const hidesPublic = ["verification_pending","catalog_onboarding","test_ready","restricted","suspended","closed"].includes(input.to);
      await client.query(`
        UPDATE vendor_businesses
        SET status=$2,
            verification_completed_at=CASE WHEN $2 IN ('catalog_onboarding','test_ready') THEN COALESCE(verification_completed_at,$3) ELSE verification_completed_at END,
            public_directory_visible=CASE WHEN $4 THEN false ELSE public_directory_visible END,
            public_directory_visibility_updated_at=CASE WHEN $4 THEN $3 ELSE public_directory_visibility_updated_at END,
            public_directory_visibility_updated_by=CASE WHEN $4 THEN $5 ELSE public_directory_visibility_updated_by END,
            public_directory_visibility_reason=CASE WHEN $4 THEN $6 ELSE public_directory_visibility_reason END,
            updated_at=$3
        WHERE id=$1
      `, [vendorUuid,input.to,new Date(now),hidesPublic,await actorUuid(client,principal),`Lifecycle changed to ${input.to}: ${reason}`]);
    }

    await client.query(`
      UPDATE vendor_applications
      SET vendor_id=$2,status=$3,
          verification_notes=CASE WHEN $3='catalog_onboarding' THEN $4 ELSE verification_notes END,
          updated_at=$5
      WHERE id=$1
    `, [text(row.application_uuid,"application_uuid"),vendorUuid ?? null,input.to,reason,new Date(now)]);

    await client.query(`
      INSERT INTO vendor_application_events(
        id,public_id,application_id,from_status,to_status,actor_user_id,actor_public_id,reason,occurred_at
      ) VALUES($1,$2,$3,$4,$5,(SELECT id FROM users WHERE public_id=$6 OR id::text=$6 LIMIT 1),$6,$7,$8)
    `, [randomUUID(),`vapp_event_${randomUUID().replaceAll("-", "").slice(0, 20)}`,text(row.application_uuid,"application_uuid"),from,input.to,principal.userId,reason,new Date(now)]);

    await client.query("COMMIT");
    result = { id: input.applicationId, state: input.to, vendorId: vendorPublicId, updatedAt: now };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await recordAdminAudit(principal,`vendor.application_${input.to}`,"vendor_application",input.applicationId,reason,result);
  return result;
}

export async function setVendorOperationalStatus(principal: SessionPrincipal, input: { vendorId: string; to: "active" | "restricted" | "suspended" | "closed"; reason: string }) {
  assertVendorManage(principal);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Status-change reason is required");
  if (!productionDatabaseConfigured()) throw new Error("Shop lifecycle controls require PostgreSQL runtime");

  const db = getProductionPostgresRuntime().nativePool;
  const linked = await db.query("SELECT a.public_id FROM vendor_applications a JOIN vendor_businesses v ON v.id=a.vendor_id WHERE v.public_id=$1 OR v.id::text=$1 ORDER BY a.updated_at DESC LIMIT 1", [input.vendorId]);
  if (linked.rowCount) return governedVendorTransition(principal,{ applicationId:String(linked.rows[0].public_id),to:input.to,reason });

  const now = Date.now();
  const client = await db.connect();
  let result: { id: string; status: string; updatedAt: number };
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id::text AS vendor_uuid,public_id,status::text AS status FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 FOR UPDATE", [input.vendorId]);
    if (!current.rowCount) throw new Error("Vendor shop not found");
    const row = current.rows[0];
    const from = String(row.status) as VendorOnboardingState;
    new VendorOnboardingWorkflow(from).transition(input.to,principal.userId,reason,now);
    if (input.to === "active") await documentedAgreement(client,String(row.vendor_uuid));
    const actor = await actorUuid(client,principal);
    await client.query(`
      UPDATE vendor_businesses
      SET status=$2,
          public_directory_visible=false,
          public_directory_visibility_updated_at=$3,
          public_directory_visibility_updated_by=$4,
          public_directory_visibility_reason=$5,
          contract_started_at=CASE WHEN $2='active' THEN COALESCE(contract_started_at,$3) ELSE contract_started_at END,
          contract_ended_at=CASE WHEN $2='closed' THEN COALESCE(contract_ended_at,$3) ELSE contract_ended_at END,
          updated_at=$3
      WHERE id=$1
    `, [String(row.vendor_uuid),input.to,new Date(now),actor,`${input.to === "active" ? "Reactivated; awaiting explicit public visibility approval" : `Lifecycle changed to ${input.to}`}: ${reason}`]);
    await client.query("COMMIT");
    result={id:String(row.public_id),status:input.to,updatedAt:now};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await recordAdminAudit(principal,`vendor.shop_${input.to}`,"vendor_business",result.id,reason,result);
  return result;
}

export async function setVendorDirectoryVisibility(principal: SessionPrincipal, input: { vendorId: string; visible: boolean; reason: string }) {
  assertVendorManage(principal);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Visibility-change reason is required");
  if (!productionDatabaseConfigured()) throw new Error("Shop visibility controls require PostgreSQL runtime");

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  const now = Date.now();
  let result: { id: string; visible: boolean; updatedAt: number };
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT id::text AS vendor_uuid,public_id,status::text AS status,public_directory_visible FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 FOR UPDATE", [input.vendorId]);
    if (!current.rowCount) throw new Error("Vendor shop not found");
    const row = current.rows[0];
    if (input.visible && String(row.status) !== "active") throw new Error("Only active vendor shops can be made publicly visible.");
    const actor = await actorUuid(client,principal);
    await client.query(`
      UPDATE vendor_businesses
      SET public_directory_visible=$2,public_directory_visibility_updated_at=$3,
          public_directory_visibility_updated_by=$4,public_directory_visibility_reason=$5,updated_at=$3
      WHERE id=$1
    `, [String(row.vendor_uuid),input.visible,new Date(now),actor,reason]);
    await client.query("COMMIT");
    result={id:String(row.public_id),visible:input.visible,updatedAt:now};
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await recordAdminAudit(principal,input.visible?"vendor.directory_visible":"vendor.directory_hidden","vendor_business",result.id,reason,result);
  return result;
}
