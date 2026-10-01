import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { normalizeGreekAfm, resolveGemiCompanyByAfm } from "./gemi-runtime";
import { resolveExpansionHubForGemiCompany } from "./hub-location-resolution";
import type { ExpansionHub } from "./expansion-hubs";
import { getHubExpansionPlan, type HubBillingCycle, type HubExpansionPlanCode } from "./hub-expansion-plans";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const HUB_PROSPECT_TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

const globals = globalThis as typeof globalThis & {
  __blsHubProspectRateLimiter?: PostgresFixedWindowRateLimiter;
};

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

type HubProspectTrial = Readonly<{ vendorId: string; ownerUserId: string; startedAt: number; expiresAt: number }>;

export type HubProspectApplicationReceipt = Readonly<{
  reference: string;
  status: "pending";
  hubSlug: string;
  hubName: string;
  planCode: HubExpansionPlanCode;
  billingCycle: HubBillingCycle;
  recurringFeeCents: number;
  paymentRequired: false;
  accountClaimRequired?: boolean;
  trial?: HubProspectTrial;
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

export async function submitHubProspectApplication(input: {
  application: HubProspectApplicationInput;
  principal?: SessionPrincipal;
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
  const reference = id("hubprospect");
  const shouldTrial = plan.code !== "claim";

  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `public-hub-prospect:${reference}` },
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

      const owner = shouldTrial
        ? input.principal
          ? await authenticatedOwner(tx, input.principal)
          : (() => { throw new HubProspectApplicationError(409, "login_required", "Συνδέσου πρώτα ώστε το 3ήμερο Trial να συνδεθεί με ασφαλή, επαληθευμένη ταυτότητα."); })()
        : undefined;
      const marketUuid = shouldTrial ? await ensureHubTrialMarket(tx, hub, input.now) : undefined;

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
        reference,
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

      const trial = owner && marketUuid
        ? await provisionHubProspectTrial(tx, {
            prospectUuid: applicationUuid,
            marketUuid,
            ownerUuid: owner.uuid,
            ownerPublicId: owner.publicId,
            application,
            hub,
            legalName: registry.legalName,
            gemiNumber: registry.gemiNumber,
            registryAddress,
            postcode: registryPostcode,
            now: input.now
          })
        : undefined;

      return {
        reference,
        status: "pending" as const,
        hubSlug: hub.slug,
        hubName: hub.nameEl,
        planCode: plan.code,
        billingCycle: application.billingCycle,
        recurringFeeCents,
        paymentRequired: false as const,
        ...(owner ? { accountClaimRequired: owner.provisional } : {}),
        ...(trial ? { trial } : {})
      };
    },
    { isolation: "serializable" }
  );
}

async function ensureHubTrialMarket(tx: SqlExecutor, hub: ExpansionHub, now: number): Promise<string> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [hub.id]);

  const configured = await tx.query<SqlRow>(`
    SELECT market.id::text AS market_id
    FROM market_hub_config config
    JOIN markets market ON market.id=config.market_id
    WHERE config.hub_code=$1
    LIMIT 1
  `, [hub.id]);
  if (configured.rowCount) return requiredText(configured.rows[0]?.market_id, "market.id");

  const marketCode = `hub-${hub.slug}`;
  const existingMarket = await tx.query<SqlRow>("SELECT id::text AS market_id FROM markets WHERE code=$1 LIMIT 1", [marketCode]);
  const marketUuid = existingMarket.rowCount
    ? requiredText(existingMarket.rows[0]?.market_id, "market.id")
    : randomUUID();
  const at = new Date(now);

  if (!existingMarket.rowCount) {
    await tx.query(`
      INSERT INTO markets(id,code,name,country_code,currency,timezone,default_locale,settings,created_at,updated_at)
      VALUES($1,$2,$3,'GR','EUR','Europe/Athens','el',$4::jsonb,$5,$5)
    `, [
      marketUuid,
      marketCode,
      hub.nameEl,
      JSON.stringify({ prelaunch: true, trialOnly: true, hubCode: hub.id, hubSlug: hub.slug }),
      at
    ]);
  }

  await tx.query(`
    INSERT INTO market_hub_config(
      market_id,hub_code,gateway_slug,expansion_radius_meters,is_operational,prospecting_enabled,
      gateway_visible,shopping_enabled,search_indexable,is_default_fallback,metadata,created_at,updated_at
    ) VALUES($1,$2,$3,$4,false,true,false,false,false,false,$5::jsonb,$6,$6)
  `, [
    marketUuid,
    hub.id,
    hub.slug,
    hub.radiusKm * 1000,
    JSON.stringify({ source: "hub_trial", prelaunch: true, trialOnly: true }),
    at
  ]);

  return marketUuid;
}

async function provisionHubProspectTrial(tx: SqlExecutor, input: {
  prospectUuid: string;
  marketUuid: string;
  ownerUuid: string;
  ownerPublicId: string;
  application: HubProspectApplicationInput;
  hub: ExpansionHub;
  legalName: string;
  gemiNumber: string;
  registryAddress: string;
  postcode: string;
  now: number;
}): Promise<HubProspectTrial> {
  const vendorUuid = randomUUID();
  const vendorPublicId = `vendor_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const startedAt = input.now;
  const expiresAt = input.now + HUB_PROSPECT_TRIAL_DURATION_MS;
  const at = new Date(input.now);
  const initialSettings = {
    accentColor: "#0f766e",
    heroStyle: "split",
    heroTitle: input.application.businessName,
    showFeatured: true,
    showFlashSale: true,
    showBazaar: true,
    showAbout: true,
    showLocation: true,
    showContact: true
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
    input.marketUuid,
    input.legalName,
    input.application.businessName,
    input.application.taxNumber,
    input.gemiNumber,
    at,
    JSON.stringify(initialSettings)
  ]);

  const location = await tx.query<SqlRow>(`
    INSERT INTO vendor_locations(
      id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,
      phone,public_email,active,is_primary,timezone,created_at,updated_at
    ) VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,'GR',$9,$10,true,true,'Europe/Athens',$11,$11)
    RETURNING id::text AS id
  `, [
    randomUUID(),
    `location_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    vendorUuid,
    input.marketUuid,
    input.application.businessName,
    input.registryAddress,
    input.hub.nameEl,
    input.postcode,
    input.application.phone,
    input.application.email,
    at
  ]);
  const locationUuid = requiredText(location.rows[0]?.id, "vendor_location.id");

  const membership = await tx.query<SqlRow>(`
    INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at)
    VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,true,$6)
    RETURNING id::text AS id
  `, [
    randomUUID(),
    `vuser_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    vendorUuid,
    input.ownerUuid,
    locationUuid,
    at
  ]);
  const membershipUuid = requiredText(membership.rows[0]?.id, "vendor_user.id");
  await tx.query(
    "INSERT INTO vendor_user_roles(vendor_user_id,role) VALUES($1::uuid,'vendor_owner') ON CONFLICT DO NOTHING",
    [membershipUuid]
  );

  await tx.query(`
    INSERT INTO vendor_profile_translations(vendor_id,locale,short_description,story)
    VALUES($1::uuid,'el',NULL,NULL)
    ON CONFLICT(vendor_id,locale) DO NOTHING
  `, [vendorUuid]);

  await tx.query(`
    UPDATE hub_expansion_prospects
    SET owner_user_id=$2::uuid,
        vendor_id=$3::uuid,
        trial_started_at=$4,
        trial_expires_at=$5,
        updated_at=$4
    WHERE id=$1::uuid
  `, [input.prospectUuid, input.ownerUuid, vendorUuid, at, new Date(expiresAt)]);

  return {
    vendorId: vendorPublicId,
    ownerUserId: input.ownerPublicId,
    startedAt,
    expiresAt
  };
}

async function authenticatedOwner(tx: SqlExecutor, principal: SessionPrincipal): Promise<{ uuid: string; publicId: string; provisional: false }> {
  if (!principal.roles.includes("customer")) {
    throw new HubProspectApplicationError(403, "account_required", "Χρειάζεται ενεργός λογαριασμός για να συνδεθεί η αίτηση με υπάρχουσα ταυτότητα.");
  }
  const result = await tx.query<SqlRow>(
    "SELECT id::text AS id,public_id FROM users WHERE public_id=$1 AND status='active' AND email_verified_at IS NOT NULL LIMIT 1",
    [principal.userId]
  );
  if (!result.rowCount) {
    throw new HubProspectApplicationError(403, "account_required", "Χρειάζεται ενεργός και επαληθευμένος λογαριασμός.");
  }
  return {
    uuid: requiredText(result.rows[0]?.id, "user.id"),
    publicId: requiredText(result.rows[0]?.public_id, "user.public_id"),
    provisional: false
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

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${label}`);
  return value.trim();
}
