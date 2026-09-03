import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  id,
  type SessionPrincipal,
  type SqlExecutor,
  type SqlRow
} from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { normalizeGreekAfm, resolveGemiCompanyByAfm, type GemiLookupResult } from "./gemi-runtime";
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
  claimedResearchVendorId?: string;
}>;

export type VendorApplicationReceipt = Readonly<{
  applicationId: string;
  state: "verification_pending";
  ownerIdentity: "authenticated" | "provisional";
  accountClaimRequired: boolean;
  registryLookupStatus: "matched" | "not_found" | "unavailable";
}>;

type NormalizedVendorApplication = VendorApplicationInput & Readonly<{
  registryLookupStatus: "matched" | "not_found" | "unavailable";
  registryCheckedAt: number;
  registryLegalName?: string;
  registryTradingName?: string;
  registryCompanyStatus?: string;
  registryLegalType?: string;
  registryAddressLine1?: string;
  registryCity?: string;
  registryPostcode?: string;
  registryEmail?: string;
  contactEmailSource: "gemi" | "applicant";
  phoneSource: "gemi" | "applicant";
}>;

type ClaimableResearchVendor = Readonly<{
  uuid: string;
  publicId: string;
  tradingName: string;
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
  const taxNumber = normalizeGreekAfm(input.application.taxNumber);
  const registry = await resolveGemiCompanyByAfm(taxNumber, input.now);
  const application = normalizeApplication({ ...input.application, taxNumber }, registry);
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

      const claimedVendor = application.claimedResearchVendorId
        ? await claimableResearchVendor(tx, application.claimedResearchVendorId, marketUuid)
        : undefined;

      // One legal business must not create parallel unrelated applicant/vendor identities.
      // A claim against this exact research vendor is allowed to coexist with another
      // unverified claim for the same profile so spam cannot reserve a public page forever.
      const duplicateBusiness = await tx.query<SqlRow>(`
        SELECT 1 AS present
        FROM vendor_applications
        WHERE tax_number=$1
          AND ($2::uuid IS NULL OR vendor_id IS DISTINCT FROM $2::uuid)
        UNION ALL
        SELECT 1 AS present
        FROM vendor_businesses
        WHERE tax_number=$1
          AND ($2::uuid IS NULL OR id<>$2::uuid)
        LIMIT 1
      `, [application.taxNumber, claimedVendor?.uuid ?? null]);
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
          id,public_id,owner_user_id,market_id,vendor_id,legal_name,trading_name,tax_number,gemi_number,
          contact_email,phone,address_line1,postcode,primary_category,shop_story,requested_plan_code,
          registry_lookup_status,registry_checked_at,registry_legal_name,registry_trading_name,
          registry_company_status,registry_legal_type,registry_address_line1,registry_city,registry_postcode,
          registry_email,contact_email_source,phone_source,status,created_at,updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
          $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,'verification_pending',$29,$29
        )
      `, [
        applicationUuid, applicationId, owner.uuid, marketUuid, claimedVendor?.uuid ?? null,
        application.legalName, application.tradingName, application.taxNumber, application.gemiNumber ?? null,
        application.contactEmail, application.phone, application.address, application.postcode,
        application.primaryCategory, application.shopStory ?? null, application.requestedPlanCode,
        application.registryLookupStatus, new Date(application.registryCheckedAt), application.registryLegalName ?? null,
        application.registryTradingName ?? null, application.registryCompanyStatus ?? null, application.registryLegalType ?? null,
        application.registryAddressLine1 ?? null, application.registryCity ?? null, application.registryPostcode ?? null,
        application.registryEmail ?? null, application.contactEmailSource, application.phoneSource, createdAt
      ]);

      if (claimedVendor) {
        await tx.query(`
          INSERT INTO vendor_application_profile_claims(
            id,public_id,application_id,research_vendor_id,claimed_route,claim_status,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,'pending',$6,$6)
        `, [
          randomUUID(), id("vclaim"), applicationUuid, claimedVendor.uuid,
          `/vendor/${claimedVendor.publicId}`, createdAt
        ]);
      }

      await insertApplicationEvent(tx, {
        applicationUuid,
        from: "invited",
        to: "application_started",
        actorUuid: owner.uuid,
        actorPublicId: owner.publicId,
        reason: claimedVendor
          ? `merchant started public application claiming existing profile ${claimedVendor.publicId}`
          : "merchant started public application",
        at: input.now
      });
      await insertApplicationEvent(tx, {
        applicationUuid,
        from: "application_started",
        to: "verification_pending",
        actorUuid: owner.uuid,
        actorPublicId: owner.publicId,
        reason: registryReason(application.registryLookupStatus),
        at: input.now + 1
      });

      return {
        applicationId,
        state: "verification_pending" as const,
        ownerIdentity: owner.provisional ? "provisional" as const : "authenticated" as const,
        accountClaimRequired: owner.provisional,
        registryLookupStatus: application.registryLookupStatus
      };
    },
    { isolation: "serializable" }
  );
}

async function claimableResearchVendor(tx: SqlExecutor, publicVendorId: string, marketUuid: string): Promise<ClaimableResearchVendor> {
  const result = await tx.query<SqlRow>(`
    SELECT vendor.id::text AS vendor_uuid,vendor.public_id,vendor.trading_name
    FROM vendor_businesses vendor
    JOIN vendor_research_profiles research ON research.vendor_id=vendor.id
    WHERE vendor.market_id=$1::uuid
      AND vendor.public_id=$2
      AND vendor.status='invited'
      AND vendor.public_id LIKE 'vendor_research_%'
    LIMIT 1
    FOR UPDATE OF vendor
  `, [marketUuid, publicVendorId]);
  if (!result.rowCount) throw new Error("RESEARCH_PROFILE_NOT_CLAIMABLE");
  return {
    uuid: requiredText(result.rows[0].vendor_uuid, "research_vendor.id"),
    publicId: requiredText(result.rows[0].public_id, "research_vendor.public_id"),
    tradingName: requiredText(result.rows[0].trading_name, "research_vendor.trading_name")
  };
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

function normalizeApplication(input: VendorApplicationInput, registry: GemiLookupResult): NormalizedVendorApplication {
  const taxNumber = normalizeGreekAfm(input.taxNumber);
  const trustedMatch = registry.lookupStatus === "matched" ? registry : undefined;
  const legalName = trustedMatch
    ? requiredLimited(trustedMatch.legalName, "Νομική επωνυμία", 160)
    : requiredLimited(input.legalName, "Νομική επωνυμία", 160);
  const tradingName = requiredLimited(input.tradingName || trustedMatch?.tradingName || legalName, "Εμπορική ονομασία", 120);
  const gemiNumber = trustedMatch?.gemiNumber ?? (input.gemiNumber?.replace(/\s+/g, "") || undefined);
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
  const claimedResearchVendorId = limitedOptional(input.claimedResearchVendorId, 180);
  if (claimedResearchVendorId && !/^vendor_research_[A-Za-z0-9_-]{3,160}$/.test(claimedResearchVendorId)) {
    throw new Error("RESEARCH_PROFILE_NOT_CLAIMABLE");
  }
  const registryEmail = trustedMatch?.email?.trim().toLowerCase();
  const registryPhone = trustedMatch?.phone?.trim();
  return {
    legalName,
    tradingName,
    taxNumber,
    gemiNumber,
    contactEmail,
    phone,
    address,
    postcode,
    primaryCategory,
    shopStory,
    requestedPlanCode: input.requestedPlanCode,
    claimedResearchVendorId,
    registryLookupStatus: registry.lookupStatus,
    registryCheckedAt: registry.checkedAt,
    registryLegalName: trustedMatch?.legalName,
    registryTradingName: trustedMatch?.tradingName,
    registryCompanyStatus: trustedMatch?.companyStatus,
    registryLegalType: trustedMatch?.legalType,
    registryAddressLine1: trustedMatch?.addressLine1,
    registryCity: trustedMatch?.city,
    registryPostcode: trustedMatch?.postcode,
    registryEmail,
    contactEmailSource: registryEmail && registryEmail === contactEmail ? "gemi" : "applicant",
    phoneSource: registryPhone && comparablePhone(registryPhone) === comparablePhone(phone) ? "gemi" : "applicant"
  };
}

function registryReason(status: NormalizedVendorApplication["registryLookupStatus"]): string {
  if (status === "matched") return "merchant submitted complete public application; GEMI legal identity matched; ownership/contact verification remains pending";
  if (status === "not_found") return "merchant submitted complete public application; GEMI AFM was not found; manual registry verification required";
  return "merchant submitted complete public application; GEMI lookup was unavailable; manual registry verification required";
}

function comparablePhone(value: string): string {
  return value.replace(/\D/g, "");
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
