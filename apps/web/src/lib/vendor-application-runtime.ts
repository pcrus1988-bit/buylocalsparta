import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  id,
  type SessionPrincipal,
  type SqlExecutor,
  type SqlRow
} from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { provisionalVendorApplicantPasswordHash } from "./provisional-account";

const ALLOWED_CATEGORIES = new Set(["home-living", "fashion", "beauty", "kids", "technology", "gifts"]);
const APPROVED_PAID_PLANS = new Set(["founding_2026", "annual", "monthly"] as const);
const globals = globalThis as typeof globalThis & {
  __blsVendorApplicationRateLimiter?: PostgresFixedWindowRateLimiter;
};

export type VendorApplicationInput = Readonly<{
  legalName: string;
  tradingName: string;
  taxNumber: string;
  gemiNumber?: string;
  contactEmail: string;
  phone: string;
  address: string;
  postcode: string;
  primaryCategory: string;
  shopStory?: string;
  requestedPlanCode: "founding_2026" | "annual" | "monthly";
}>;

export type VendorApplicationReceipt = Readonly<{
  applicationId: string;
  state: "verification_pending";
  ownerIdentity: "authenticated" | "provisional";
  accountClaimRequired: boolean;
}>;

export function vendorApplicationReadiness(): { ready: boolean; message: string } {
  if (!productionDatabaseConfigured()) {
    return { ready: false, message: "Η αίτηση εμπόρου απαιτεί την παραγωγική PostgreSQL/Supabase βάση." };
  }
  return { ready: true, message: "Vendor application persistence is ready" };
}

export async function consumeVendorApplicationRateLimit(input: { visitorKey: string; now: number }) {
  const runtime = getProductionPostgresRuntime();
  const limiter = globals.__blsVendorApplicationRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  return limiter.consume({ route: "vendor-application", key: input.visitorKey, limit: 3, windowMs: 24 * 60 * 60 * 1000, now: input.now });
}

export async function submitVendorApplication(input: {
  application: VendorApplicationInput;
  principal?: SessionPrincipal;
  now: number;
}): Promise<VendorApplicationReceipt> {
  const application = normalizeApplication(input.application);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `public-vendor-application:${randomUUID()}` },
    async (tx) => {
      const market = await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
      if (!market.rowCount) throw new Error("MARKET_UNAVAILABLE");
      const marketUuid = requiredText(market.rows[0].id, "market.id");

      const plan = await tx.query<SqlRow>("SELECT 1 AS present FROM vendor_plans WHERE market_id=$1 AND code=$2 AND status='active' LIMIT 1", [marketUuid, application.requestedPlanCode]);
      if (!plan.rowCount) throw new Error("PLAN_UNAVAILABLE");

      // An AFM may already exist in our research universe. A merchant-owned application must
      // claim that invited research record rather than creating a duplicate or being rejected.
      const duplicateApplication = await tx.query<SqlRow>("SELECT 1 AS present FROM vendor_applications WHERE tax_number=$1 LIMIT 1", [application.taxNumber]);
      if (duplicateApplication.rowCount) throw new Error("BUSINESS_ALREADY_REGISTERED");

      const vendorMatches = await tx.query<SqlRow>(`
        SELECT v.id::text AS id,v.public_id,v.status::text AS status
        FROM vendor_businesses v
        LEFT JOIN vendor_research_profiles vrp ON vrp.vendor_id=v.id
        WHERE v.market_id=$2
          AND (v.tax_number=$1 OR regexp_replace(COALESCE(vrp.candidate_vat,''),'[^0-9]','','g')=$1)
        ORDER BY CASE WHEN v.public_id LIKE 'vendor_research_%' THEN 0 ELSE 1 END,v.created_at
        FOR UPDATE OF v
      `, [application.taxNumber, marketUuid]);
      if (vendorMatches.rowCount > 1) throw new Error("BUSINESS_ALREADY_REGISTERED");

      let researchVendorUuid: string | undefined;
      if (vendorMatches.rowCount === 1) {
        const candidate = vendorMatches.rows[0];
        const candidateId = requiredText(candidate.id,"vendor.id");
        const candidatePublicId = requiredText(candidate.public_id,"vendor.public_id");
        const candidateStatus = requiredText(candidate.status,"vendor.status");
        if (candidateStatus !== "invited" || !candidatePublicId.startsWith("vendor_research_")) throw new Error("BUSINESS_ALREADY_REGISTERED");
        const claimed = await tx.query<SqlRow>(`
          SELECT 1 AS present FROM vendor_applications WHERE vendor_id=$1
          UNION ALL
          SELECT 1 AS present FROM vendor_users WHERE vendor_id=$1 AND active=true
          LIMIT 1
        `, [candidateId]);
        if (claimed.rowCount) throw new Error("BUSINESS_ALREADY_REGISTERED");
        researchVendorUuid = candidateId;
      }

      const owner = input.principal
        ? await authenticatedOwner(tx, input.principal)
        : await provisionalOwner(tx, application.contactEmail, input.now);

      const existingApplication = await tx.query<SqlRow>("SELECT public_id,status::text AS status FROM vendor_applications WHERE owner_user_id=$1 LIMIT 1", [owner.uuid]);
      if (existingApplication.rowCount) throw new Error("APPLICATION_EXISTS");

      const applicationUuid = randomUUID();
      const applicationId = id("vapp");
      const createdAt = new Date(input.now);
      await tx.query(`
        INSERT INTO vendor_applications (
          id,public_id,owner_user_id,market_id,vendor_id,legal_name,trading_name,tax_number,gemi_number,
          contact_email,phone,address_line1,postcode,primary_category,shop_story,requested_plan_code,
          status,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'verification_pending',$17,$17)
      `, [
        applicationUuid, applicationId, owner.uuid, marketUuid, researchVendorUuid ?? null,
        application.legalName, application.tradingName, application.taxNumber, application.gemiNumber ?? null,
        application.contactEmail, application.phone, application.address, application.postcode,
        application.primaryCategory, application.shopStory ?? null, application.requestedPlanCode, createdAt
      ]);

      if (researchVendorUuid) {
        await tx.query(`
          UPDATE vendor_businesses
          SET legal_name=$2,trading_name=$3,tax_number=$4,gemi_number=COALESCE($5,gemi_number),
              status='verification_pending',public_directory_visible=false,
              public_directory_visibility_updated_at=$6,
              public_directory_visibility_reason='Research record claimed by merchant application; verification in progress',
              updated_at=$6
          WHERE id=$1
        `, [researchVendorUuid,application.legalName,application.tradingName,application.taxNumber,application.gemiNumber ?? null,createdAt]);
      }

      await insertApplicationEvent(tx, {
        applicationUuid,
        from: "invited",
        to: "application_started",
        actorUuid: owner.uuid,
        actorPublicId: owner.publicId,
        reason: researchVendorUuid ? "merchant claimed invited research record and started public application" : "merchant started public application",
        at: input.now
      });
      await insertApplicationEvent(tx, {
        applicationUuid,
        from: "application_started",
        to: "verification_pending",
        actorUuid: owner.uuid,
        actorPublicId: owner.publicId,
        reason: "merchant submitted complete public application for verification",
        at: input.now + 1
      });

      return {
        applicationId,
        state: "verification_pending" as const,
        ownerIdentity: owner.provisional ? "provisional" as const : "authenticated" as const,
        accountClaimRequired: owner.provisional
      };
    },
    { isolation: "serializable" }
  );
}

async function authenticatedOwner(tx: SqlExecutor, principal: SessionPrincipal): Promise<{ uuid: string; publicId: string; provisional: false }> {
  if (!principal.roles.includes("customer")) throw new Error("CUSTOMER_ACCOUNT_REQUIRED");
  const result = await tx.query<SqlRow>("SELECT id::text AS id,public_id FROM users WHERE public_id=$1 AND status='active' AND email_verified_at IS NOT NULL LIMIT 1", [principal.userId]);
  if (!result.rowCount) throw new Error("CUSTOMER_ACCOUNT_REQUIRED");
  return { uuid: requiredText(result.rows[0].id, "user.id"), publicId: requiredText(result.rows[0].public_id, "user.public_id"), provisional: false };
}

async function provisionalOwner(tx: SqlExecutor, email: string, now: number): Promise<{ uuid: string; publicId: string; provisional: true }> {
  const existing = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE lower(email::text)=lower($1) LIMIT 1 FOR UPDATE", [email]);
  if (existing.rowCount) throw new Error("EXISTING_ACCOUNT_LOGIN_REQUIRED");
  const uuid = randomUUID();
  const publicId = id("usr");
  const at = new Date(now);
  await tx.query(`
    INSERT INTO users(id,public_id,email,password_hash,status,email_verified_at,preferred_locale,created_at,updated_at)
    VALUES($1,$2,$3,$4,'pending_verification',NULL,'el',$5,$5)
  `, [uuid, publicId, email, provisionalVendorApplicantPasswordHash(), at]);
  await tx.query("INSERT INTO customer_profiles(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [uuid]);
  return { uuid, publicId, provisional: true };
}

async function insertApplicationEvent(tx: SqlExecutor, input: {
  applicationUuid: string;
  from: "invited" | "application_started";
  to: "application_started" | "verification_pending";
  actorUuid: string;
  actorPublicId: string;
  reason: string;
  at: number;
}): Promise<void> {
  await tx.query(`
    INSERT INTO vendor_application_events(
      id,public_id,application_id,from_status,to_status,actor_user_id,actor_public_id,reason,occurred_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [randomUUID(), id("vapp_event"), input.applicationUuid, input.from, input.to, input.actorUuid, input.actorPublicId, input.reason, new Date(input.at)]);
}

function normalizeApplication(input: VendorApplicationInput): VendorApplicationInput {
  const legalName = requiredLimited(input.legalName, "Νομική επωνυμία", 160);
  const tradingName = requiredLimited(input.tradingName, "Εμπορική ονομασία", 120);
  const taxNumber = input.taxNumber.replace(/\s+/g, "");
  if (!/^\d{9}$/.test(taxNumber)) throw new Error("Το ΑΦΜ πρέπει να έχει 9 ψηφία.");
  const gemiNumber = input.gemiNumber?.replace(/\s+/g, "") || undefined;
  if (gemiNumber && !/^\d{8,20}$/.test(gemiNumber)) throw new Error("Ο αριθμός ΓΕΜΗ δεν έχει έγκυρη μορφή.");
  const contactEmail = normalizeEmail(input.contactEmail);
  const phone = requiredLimited(input.phone, "Τηλέφωνο", 32);
  if (!/^[+0-9 ()-]{8,32}$/.test(phone)) throw new Error("Το τηλέφωνο δεν έχει έγκυρη μορφή.");
  const address = requiredLimited(input.address, "Διεύθυνση", 180);
  const postcode = input.postcode.trim();
  if (!/^\d{5}$/.test(postcode)) throw new Error("Ο ταχυδρομικός κώδικας πρέπει να έχει 5 ψηφία.");
  const primaryCategory = requiredLimited(input.primaryCategory, "Κατηγορία", 80).toLowerCase();
  if (!ALLOWED_CATEGORIES.has(primaryCategory)) throw new Error("Επίλεξε έγκυρη κατηγορία καταστήματος.");
  const shopStory = limitedOptional(input.shopStory, 1500);
  if (!APPROVED_PAID_PLANS.has(input.requestedPlanCode)) throw new Error("Μη έγκυρη επιλογή προγράμματος.");
  return { legalName, tradingName, taxNumber, gemiNumber, contactEmail, phone, address, postcode, primaryCategory, shopStory, requestedPlanCode: input.requestedPlanCode };
}

function requiredLimited(value: string, label: string, max: number): string {
  const text = value.trim();
  if (!text) throw new Error(`${label}: υποχρεωτικό πεδίο.`);
  if (text.length > max) throw new Error(`${label}: έως ${max} χαρακτήρες.`);
  return text;
}

function limitedOptional(value: string | undefined, max: number): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > max) throw new Error(`Το κείμενο μπορεί να έχει έως ${max} χαρακτήρες.`);
  return text;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Χρειάζεται έγκυρο email επικοινωνίας.");
  return email;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid database field ${field}`);
  return value;
}
