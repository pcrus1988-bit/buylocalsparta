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
  requestedPlanCode: "free_listing" | "founding_2026";
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
      // markets has no status/active column. Market availability is represented by the
      // presence of the configured market row; plan availability is governed separately.
      const market = await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
      if (!market.rowCount) throw new Error("MARKET_UNAVAILABLE");
      const marketUuid = requiredText(market.rows[0].id, "market.id");

      const plan = await tx.query<SqlRow>("SELECT 1 AS present FROM vendor_plans WHERE market_id=$1 AND code=$2 AND status='active' LIMIT 1", [marketUuid, application.requestedPlanCode]);
      if (!plan.rowCount) throw new Error("PLAN_UNAVAILABLE");

      // One legal business must not be able to create parallel applicant/vendor identities.
      // Keep the public error generic so the endpoint does not disclose who owns an AFM.
      const duplicateBusiness = await tx.query<SqlRow>(`
        SELECT 1 AS present FROM vendor_applications WHERE tax_number=$1
        UNION ALL
        SELECT 1 AS present FROM vendor_businesses WHERE tax_number=$1
        LIMIT 1
      `, [application.taxNumber]);
      if (duplicateBusiness.rowCount) throw new Error("BUSINESS_ALREADY_REGISTERED");

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
          id,public_id,owner_user_id,market_id,legal_name,trading_name,tax_number,gemi_number,
          contact_email,phone,address_line1,postcode,primary_category,shop_story,requested_plan_code,
          status,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'verification_pending',$16,$16)
      `, [
        applicationUuid, applicationId, owner.uuid, marketUuid, application.legalName, application.tradingName,
        application.taxNumber, application.gemiNumber ?? null, application.contactEmail, application.phone,
        application.address, application.postcode, application.primaryCategory, application.shopStory ?? null,
        application.requestedPlanCode, createdAt
      ]);

      await insertApplicationEvent(tx, {
        applicationUuid,
        from: "invited",
        to: "application_started",
        actorUuid: owner.uuid,
        actorPublicId: owner.publicId,
        reason: "merchant started public application",
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
  if (existing.rowCount) {
    // Never let an anonymous request attach an application to an already registered identity.
    throw new Error("EXISTING_ACCOUNT_LOGIN_REQUIRED");
  }

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
  if (!(["free_listing", "founding_2026"] as const).includes(input.requestedPlanCode)) throw new Error("Μη έγκυρη επιλογή προγράμματος.");
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
