import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { normalizeGreekAfm, resolveGemiCompanyByAfm } from "./gemi-runtime";
import { resolveExpansionHubForGemiCompany } from "./hub-location-resolution";
import { getHubExpansionPlan, type HubBillingCycle, type HubExpansionPlanCode } from "./hub-expansion-plans";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { provisionalVendorApplicantPasswordHash } from "./provisional-account";

const globals = globalThis as typeof globalThis & {
  __blsHubProspectRateLimiter?: PostgresFixedWindowRateLimiter;
};

const HUB_TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const OPEN_HUB_PROSPECT_STATUSES = ["pending", "contacted", "qualified", "verified", "approved"] as const;

export type HubProspectApplicationInput = Readonly<{
  taxNumber: string;
  planCode: HubExpansionPlanCode;
  billingCycle: HubBillingCycle;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  primaryCategory: string;
  websiteUrl?: string;
  currentSalesChannels?: string;
  notes?: string;
}>;

export type HubProspectTrial = Readonly<{
  applicationId: string;
  vendorId: string;
  ownerUserId: string;
  startedAt: number;
  expiresAt: number;
}>;

export type HubProspectApplicationReceipt = Readonly<{
  reference: string;
  status: "pending";
  hubSlug: string;
  hubName: string;
  planCode: HubExpansionPlanCode;
  billingCycle: HubBillingCycle;
  setupFeeCents: number;
  recurringFeeCents: number;
  commissionBps: number;
  paymentRequired: false;
  trial: HubProspectTrial;
}>;

type HubTrialSource = Readonly<{
  applicationId: string;
  businessName: string;
  legalName: string;
  taxNumber: string;
  gemiNumber?: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  hubSlug: string;
  hubName: string;
  primaryCategory: string;
  currentSalesChannels?: string;
  notes?: string;
}>;

export class HubProspectApplicationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HubProspectApplicationError";
    this.status = status;
    this.code = code;
  }
}

export function hubProspectApplicationReadiness(): { ready: boolean; message: string } {
  if (!productionDatabaseConfigured()) {
    return { ready: false, message: "Η αίτηση HUB απαιτεί την παραγωγική PostgreSQL/Supabase βάση." };
  }
  return { ready: true, message: "Hub prospect persistence is ready" };
}

export async function consumeHubProspectRateLimit(input: { visitorKey: string; now: number }) {
  const runtime = getProductionPostgresRuntime();
  const limiter = globals.__blsHubProspectRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  return limiter.consume({ route: "hub-prospect-application", key: input.visitorKey, limit: 4, windowMs: 24 * 60 * 60 * 1000, now: input.now });
}

export function hubProspectDisplayReference(publicId: string, hubSlug: string, createdAt: number): string {
  const slugCode = hubSlug
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase() || "HUB";
  const date = new Date(createdAt);
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const suffix = publicId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return `KM-${slugCode}-${yy}${mm}${dd}-${suffix}`;
}

export async function hubProspectAdminSummary(): Promise<{ total: number; open: number; pending: number }> {
  if (!productionDatabaseConfigured()) return { total: 0, open: 0, pending: 0 };
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE status = ANY($1::text[]))::integer AS open,
      count(*) FILTER (WHERE status='pending')::integer AS pending
    FROM hub_expansion_prospects
  `, [OPEN_HUB_PROSPECT_STATUSES]);
  const row = result.rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    open: Number(row.open ?? 0),
    pending: Number(row.pending ?? 0)
  };
}

export async function submitHubProspectApplication(input: {
  application: HubProspectApplicationInput;
  now: number;
}): Promise<HubProspectApplicationReceipt> {
  const application = normalizeApplication(input.application);
  const plan = getHubExpansionPlan(application.planCode);
  if (!plan) throw new HubProspectApplicationError(400, "plan_invalid", "Επίλεξε έγκυρο πρόγραμμα συνεργασίας.");
  const recurringFeeCents = application.billingCycle === "monthly" ? plan.monthlyFeeCents : plan.annualFeeCents;

  const registry = await resolveGemiCompanyByAfm(application.taxNumber, input.now);
  if (registry.lookupStatus === "not_found") {
    throw new HubProspectApplicationError(422, "company_not_found", "Δεν βρέθηκε επιχείρηση στο Γ.Ε.ΜΗ. με αυτό το ΑΦΜ.");
  }
  if (registry.lookupStatus === "unavailable") {
    throw new HubProspectApplicationError(503, "gemi_unavailable", registry.message);
  }

  const resolution = await resolveExpansionHubForGemiCompany(registry);
  if (resolution.status === "unresolved") {
    throw new HubProspectApplicationError(422, "hub_unresolved", resolution.message);
  }
  const hub = resolution.hub;
  if (hub.isSpartaLegacy) {
    throw new HubProspectApplicationError(409, "sparta_uses_existing_join", "Η επαληθευμένη τοποθεσία ανήκει στο HUB Σπάρτης. Συνέχισε από την ενεργή διαδικασία συνεργασίας της Σπάρτης.");
  }

  const registryPostcode = registry.postcode?.replace(/\D/g, "") ?? "";
  if (!/^\d{5}$/.test(registryPostcode)) {
    throw new HubProspectApplicationError(422, "registry_postcode_missing", "Το Γ.Ε.ΜΗ. δεν επέστρεψε έγκυρο ταχυδρομικό κώδικα για την επιχείρηση.");
  }
  const registryAddress = registryAddressLine(registry.addressLine1, registry.city, registry.municipality, registryPostcode);

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const createdAt = new Date(input.now);
  const registryCheckedAt = new Date(registry.checkedAt);
  const applicationUuid = randomUUID();
  const applicationId = id("hubprospect");
  const reference = hubProspectDisplayReference(applicationId, hub.slug, input.now);

  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `public-hub-prospect:${applicationId}` },
    async (tx) => {
      const duplicate = await tx.query(`
        SELECT 1 AS present
        FROM hub_expansion_prospects
        WHERE tax_number=$1
          AND status NOT IN ('declined','converted')
        LIMIT 1
      `, [application.taxNumber]);
      if (duplicate.rowCount) {
        throw new HubProspectApplicationError(409, "application_exists", "Υπάρχει ήδη ενεργή αίτηση για αυτή την επιχείρηση.");
      }

      await tx.query(`
        INSERT INTO hub_expansion_prospects (
          id,public_id,hub_id,hub_slug,hub_city,hub_region,plan_code,billing_cycle,tax_number,gemi_number,
          business_name,legal_name,contact_name,email,phone,address_line,postal_code,primary_category,
          website_url,current_sales_channels,notes,source,status,setup_fee_cents,monthly_fee_cents,annual_fee_cents,
          recurring_fee_cents,commission_bps,payment_state,consent_at,registry_checked_at,hub_resolution_method,
          hub_resolution_latitude,hub_resolution_longitude,hub_distance_km,created_at,updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          'hub_expansion_join','pending',$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$34
        )
      `, [
        applicationUuid,
        applicationId,
        hub.id,
        hub.slug,
        hub.nameEl,
        hub.regionEl,
        plan.code,
        application.billingCycle,
        application.taxNumber,
        registry.gemiNumber,
        application.businessName,
        registry.legalName,
        application.contactName,
        application.email,
        application.phone,
        registryAddress,
        registryPostcode,
        application.primaryCategory,
        application.websiteUrl ?? registry.url ?? null,
        application.currentSalesChannels ?? null,
        application.notes ?? null,
        plan.setupFeeCents,
        plan.monthlyFeeCents,
        plan.annualFeeCents,
        recurringFeeCents,
        plan.commissionBps,
        plan.code === "claim" ? "not_required" : "not_requested",
        createdAt,
        registryCheckedAt,
        resolution.method,
        resolution.latitude ?? null,
        resolution.longitude ?? null,
        resolution.distanceKm ?? null,
        createdAt
      ]);

      const trial = await provisionHubProspectTrial(tx, {
        applicationId,
        businessName: application.businessName,
        legalName: registry.legalName,
        taxNumber: application.taxNumber,
        gemiNumber: registry.gemiNumber,
        contactName: application.contactName,
        email: application.email,
        phone: application.phone,
        addressLine: registryAddress,
        postalCode: registryPostcode,
        hubSlug: hub.slug,
        hubName: hub.nameEl,
        primaryCategory: application.primaryCategory,
        currentSalesChannels: application.currentSalesChannels,
        notes: application.notes
      }, input.now, reference);

      return {
        reference,
        status: "pending" as const,
        hubSlug: hub.slug,
        hubName: hub.nameEl,
        planCode: plan.code,
        billingCycle: application.billingCycle,
        setupFeeCents: plan.setupFeeCents,
        recurringFeeCents,
        commissionBps: plan.commissionBps,
        paymentRequired: false as const,
        trial
      };
    },
    { isolation: "serializable" }
  );
}

export async function ensureExistingHubProspectTrial(input: {
  applicationId: string;
  now: number;
}): Promise<Readonly<{
  reference: string;
  businessName: string;
  email: string;
  hubName: string;
  hubSlug: string;
  planCode: HubExpansionPlanCode;
  billingCycle: HubBillingCycle;
  setupFeeCents: number;
  recurringFeeCents: number;
  commissionBps: number;
  trial: HubProspectTrial;
}>> {
  if (!productionDatabaseConfigured()) throw new Error("Production database is required");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `admin-hub-trial:${input.applicationId}` },
    async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT public_id,hub_slug,hub_city,plan_code,billing_cycle,tax_number,gemi_number,business_name,legal_name,
               contact_name,email,phone,address_line,postal_code,primary_category,current_sales_channels,notes,
               setup_fee_cents,recurring_fee_cents,commission_bps,status,created_at
        FROM hub_expansion_prospects
        WHERE public_id=$1 OR id::text=$1
        LIMIT 1
        FOR UPDATE
      `, [input.applicationId]);
      if (!result.rowCount) throw new Error("HUB application not found");
      const row = result.rows[0];
      const status = requiredText(row.status, "hub_prospect.status");
      if (status === "declined" || status === "converted") throw new Error(`Trial is not available while HUB application status is ${status}`);

      const applicationId = requiredText(row.public_id, "hub_prospect.public_id");
      const hubSlug = requiredText(row.hub_slug, "hub_prospect.hub_slug");
      const createdAt = epoch(row.created_at);
      const reference = hubProspectDisplayReference(applicationId, hubSlug, createdAt);

      const existing = await findExistingHubTrial(tx, applicationId);
      const trial = existing ?? await provisionHubProspectTrial(tx, {
        applicationId,
        businessName: requiredText(row.business_name, "hub_prospect.business_name"),
        legalName: requiredText(row.legal_name, "hub_prospect.legal_name"),
        taxNumber: requiredText(row.tax_number, "hub_prospect.tax_number"),
        gemiNumber: optionalText(row.gemi_number),
        contactName: requiredText(row.contact_name, "hub_prospect.contact_name"),
        email: requiredText(row.email, "hub_prospect.email"),
        phone: requiredText(row.phone, "hub_prospect.phone"),
        addressLine: requiredText(row.address_line, "hub_prospect.address_line"),
        postalCode: requiredText(row.postal_code, "hub_prospect.postal_code"),
        hubSlug,
        hubName: requiredText(row.hub_city, "hub_prospect.hub_city"),
        primaryCategory: requiredText(row.primary_category, "hub_prospect.primary_category"),
        currentSalesChannels: optionalText(row.current_sales_channels),
        notes: optionalText(row.notes)
      }, input.now, reference);

      return {
        reference,
        businessName: requiredText(row.business_name, "hub_prospect.business_name"),
        email: requiredText(row.email, "hub_prospect.email"),
        hubName: requiredText(row.hub_city, "hub_prospect.hub_city"),
        hubSlug,
        planCode: requiredText(row.plan_code, "hub_prospect.plan_code") as HubExpansionPlanCode,
        billingCycle: requiredText(row.billing_cycle, "hub_prospect.billing_cycle") as HubBillingCycle,
        setupFeeCents: Number(row.setup_fee_cents ?? 0),
        recurringFeeCents: Number(row.recurring_fee_cents ?? 0),
        commissionBps: Number(row.commission_bps ?? 0),
        trial
      };
    },
    { isolation: "serializable" }
  );
}

async function findExistingHubTrial(tx: SqlExecutor, applicationId: string): Promise<HubProspectTrial | undefined> {
  const result = await tx.query<SqlRow>(`
    SELECT
      vendor.public_id AS vendor_public_id,
      owner.public_id AS owner_public_id,
      (vendor.storefront_settings->>'trialStartedAt')::bigint AS trial_started_at,
      (vendor.storefront_settings->>'trialExpiresAt')::bigint AS trial_expires_at
    FROM vendor_businesses vendor
    JOIN vendor_users membership ON membership.vendor_id=vendor.id AND membership.active
    JOIN users owner ON owner.id=membership.user_id
    WHERE vendor.storefront_settings->>'trialSource'='hub_prospect'
      AND vendor.storefront_settings->>'trialApplicationId'=$1
    ORDER BY membership.created_at
    LIMIT 1
  `, [applicationId]);
  if (!result.rowCount) return undefined;
  const row = result.rows[0];
  const startedAt = Number(row.trial_started_at);
  const expiresAt = Number(row.trial_expires_at);
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= startedAt) return undefined;
  return {
    applicationId,
    vendorId: requiredText(row.vendor_public_id, "vendor.public_id"),
    ownerUserId: requiredText(row.owner_public_id, "owner.public_id"),
    startedAt,
    expiresAt
  };
}

async function provisionHubProspectTrial(tx: SqlExecutor, source: HubTrialSource, now: number, reference: string): Promise<HubProspectTrial> {
  const existing = await findExistingHubTrial(tx, source.applicationId);
  if (existing) return existing;

  const market = await tx.query<SqlRow>("SELECT id::text AS id,name FROM markets WHERE code='sparta' LIMIT 1");
  if (!market.rowCount) throw new Error("TRIAL_SANDBOX_MARKET_UNAVAILABLE");
  const marketUuid = requiredText(market.rows[0].id, "market.id");

  const ownerResult = await tx.query<SqlRow>("SELECT id::text AS id,public_id FROM users WHERE lower(email::text)=lower($1) ORDER BY created_at LIMIT 1 FOR UPDATE", [source.email]);
  let ownerUuid: string;
  let ownerPublicId: string;
  if (ownerResult.rowCount) {
    ownerUuid = requiredText(ownerResult.rows[0].id, "user.id");
    ownerPublicId = requiredText(ownerResult.rows[0].public_id, "user.public_id");
  } else {
    ownerUuid = randomUUID();
    ownerPublicId = id("usr");
    const at = new Date(now);
    await tx.query(`
      INSERT INTO users(id,public_id,email,password_hash,status,email_verified_at,preferred_locale,created_at,updated_at)
      VALUES($1,$2,$3,$4,'pending_verification',NULL,'el',$5,$5)
    `, [ownerUuid, ownerPublicId, source.email, provisionalVendorApplicantPasswordHash(), at]);
    await tx.query("INSERT INTO customer_profiles(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [ownerUuid]);
  }

  const vendorUuid = randomUUID();
  const vendorPublicId = `vendor_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const nameCollision = await tx.query(
    "SELECT 1 FROM vendor_businesses WHERE market_id=$1::uuid AND lower(trading_name)=lower($2) LIMIT 1",
    [marketUuid, source.businessName]
  );
  const trialTradingName = nameCollision.rowCount
    ? `${source.businessName} · Trial ${reference.slice(-8)}`
    : source.businessName;
  const startedAt = now;
  const expiresAt = now + HUB_TRIAL_DURATION_MS;
  const at = new Date(now);
  const initialSettings = {
    accentColor: "#0f766e",
    heroStyle: "split",
    heroTitle: source.businessName,
    showFeatured: true,
    showFlashSale: true,
    showBazaar: true,
    showAbout: true,
    showLocation: true,
    showContact: true,
    trialSource: "hub_prospect",
    trialApplicationId: source.applicationId,
    trialReference: reference,
    trialStartedAt: startedAt,
    trialExpiresAt: expiresAt,
    expansionHubSlug: source.hubSlug,
    expansionHubName: source.hubName
  };

  await tx.query(`
    INSERT INTO vendor_businesses(
      id,public_id,market_id,legal_name,trading_name,tax_number,gemi_number,status,
      public_directory_visible,demo_mode,demo_mode_updated_at,storefront_settings,created_at,updated_at
    ) VALUES(
      $1,$2,$3::uuid,$4,$5,$6,$7,'verification_pending',
      false,true,$8,$9::jsonb,$8,$8
    )
  `, [
    vendorUuid,
    vendorPublicId,
    marketUuid,
    source.legalName,
    trialTradingName,
    source.taxNumber,
    source.gemiNumber ?? null,
    at,
    JSON.stringify(initialSettings)
  ]);

  await tx.query(`
    INSERT INTO vendor_locations(
      id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,
      phone,public_email,active,is_primary,created_at,updated_at
    ) VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,'GR',$9,$10,true,true,$11,$11)
  `, [
    randomUUID(),
    `location_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    vendorUuid,
    marketUuid,
    source.businessName,
    source.addressLine,
    source.hubName,
    source.postalCode,
    source.phone,
    source.email,
    at
  ]);

  const membership = await tx.query<SqlRow>(`
    INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at)
    VALUES($1,$2,$3::uuid,$4::uuid,NULL,true,$5)
    RETURNING id::text AS id
  `, [
    randomUUID(),
    `vuser_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    vendorUuid,
    ownerUuid,
    at
  ]);
  const membershipUuid = requiredText(membership.rows[0]?.id, "vendor_user.id");
  await tx.query(
    "INSERT INTO vendor_user_roles(vendor_user_id,role) VALUES($1::uuid,'vendor_owner') ON CONFLICT DO NOTHING",
    [membershipUuid]
  );

  const story = source.notes ?? source.currentSalesChannels;
  await tx.query(`
    INSERT INTO vendor_profile_translations(vendor_id,locale,short_description,story)
    VALUES($1::uuid,'el',$2,$3)
    ON CONFLICT(vendor_id,locale) DO UPDATE
    SET short_description=EXCLUDED.short_description,
        story=EXCLUDED.story
  `, [
    vendorUuid,
    story?.slice(0, 320) ?? null,
    story ?? null
  ]);

  return {
    applicationId: source.applicationId,
    vendorId: vendorPublicId,
    ownerUserId: ownerPublicId,
    startedAt,
    expiresAt
  };
}

function normalizeApplication(input: HubProspectApplicationInput): HubProspectApplicationInput {
  let taxNumber: string;
  try {
    taxNumber = normalizeGreekAfm(input.taxNumber);
  } catch (error) {
    throw new HubProspectApplicationError(400, "invalid_afm", error instanceof Error ? error.message : "Το ΑΦΜ δεν είναι έγκυρο.");
  }

  const plan = getHubExpansionPlan(input.planCode);
  if (!plan) throw new HubProspectApplicationError(400, "plan_invalid", "Επίλεξε έγκυρο πρόγραμμα συνεργασίας.");
  const billingCycle = plan.code === "claim" ? "annual" : requireBillingCycle(input.billingCycle);
  const email = requiredLimited(input.email, "Email", 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HubProspectApplicationError(400, "email_invalid", "Χρειάζεται έγκυρο email επικοινωνίας.");
  const phone = requiredLimited(input.phone, "Τηλέφωνο", 32);
  if (!/^[+0-9 ()-]{8,32}$/.test(phone)) throw new HubProspectApplicationError(400, "phone_invalid", "Το τηλέφωνο δεν έχει έγκυρη μορφή.");
  const websiteUrl = optionalLimited(input.websiteUrl, 240);
  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    } catch {
      throw new HubProspectApplicationError(400, "website_invalid", "Το website πρέπει να είναι έγκυρο http/https URL.");
    }
  }

  return {
    taxNumber,
    planCode: plan.code,
    billingCycle,
    businessName: requiredLimited(input.businessName, "Εμπορική ονομασία", 120),
    contactName: requiredLimited(input.contactName, "Υπεύθυνος επικοινωνίας", 120),
    email,
    phone,
    primaryCategory: requiredLimited(input.primaryCategory, "Κατηγορία", 100),
    websiteUrl,
    currentSalesChannels: optionalLimited(input.currentSalesChannels, 600),
    notes: optionalLimited(input.notes, 1500)
  };
}

function requireBillingCycle(value: HubBillingCycle): HubBillingCycle {
  if (value === "annual" || value === "monthly") return value;
  throw new HubProspectApplicationError(400, "billing_cycle_invalid", "Επίλεξε έγκυρο τρόπο χρέωσης συνδρομής.");
}

function registryAddressLine(address: string | undefined, city: string | undefined, municipality: string | undefined, postcode: string): string {
  const normalized = [address, city || municipality, postcode]
    .filter(Boolean)
    .join(", ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized.slice(0, 240);
}

function requiredLimited(value: string, label: string, max: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new HubProspectApplicationError(400, "field_required", `${label}: το πεδίο είναι υποχρεωτικό.`);
  if (normalized.length > max) throw new HubProspectApplicationError(400, "field_too_long", `${label}: έως ${max} χαρακτήρες.`);
  return normalized;
}

function optionalLimited(value: string | undefined, max: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new HubProspectApplicationError(400, "field_too_long", `Το κείμενο μπορεί να έχει έως ${max} χαρακτήρες.`);
  return normalized;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid database field ${field}`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function epoch(value: unknown): number {
  const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(result)) throw new Error("Invalid hub prospect timestamp");
  return result;
}
