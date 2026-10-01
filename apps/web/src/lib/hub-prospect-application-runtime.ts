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

type HubProspectTrial = Readonly<{ applicationId: string; vendorId: string; ownerUserId: string; startedAt: number; expiresAt: number }>;

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

const OPEN_HUB_PROSPECT_STATUSES = ["pending", "contacted", "qualified", "verified", "approved"] as const;

export function hubProspectDisplayReference(publicId: string, hubSlug: string, createdAt: number): string {
  const slugCode = hubSlug
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase() || "HUB";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(createdAt));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const suffix = publicId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return `KM-${slugCode}-${get("year")}${get("month")}${get("day")}-${suffix}`;
}

export async function hubProspectAdminSummary(): Promise<{ total: number; open: number; pending: number }> {
  if (!productionDatabaseConfigured()) return { total: 0, open: 0, pending: 0 };
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE status::text = ANY($1::text[]))::integer AS open,
      count(*) FILTER (WHERE status::text='pending')::integer AS pending
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
  const applicationId = id("hubprospect");
  const reference = hubProspectDisplayReference(applicationId, hub.slug, input.now);
  const shouldTrial = plan.code !== "claim";

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

      const trial = owner && marketUuid
        ? await provisionHubProspectTrial(tx, {
            prospectUuid: applicationUuid,
            applicationId,
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
        setupFeeCents: plan.setupFeeCents,
        recurringFeeCents,
        commissionBps: plan.commissionBps,
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
  applicationId: string;
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
    applicationId: input.applicationId,
    vendorId: vendorPublicId,
    ownerUserId: input.ownerPublicId,
    startedAt,
    expiresAt
  };
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

  const snapshotResult = await runtime.sqlPool.query<SqlRow>(`
    SELECT h.id::text AS prospect_uuid,h.public_id,h.hub_id,h.hub_slug,h.hub_city,h.plan_code,h.billing_cycle,
           h.tax_number,h.gemi_number,h.business_name,h.legal_name,h.contact_name,h.email,h.phone,h.address_line,
           h.postal_code,h.primary_category,h.website_url,h.current_sales_channels,h.notes,h.status::text AS status,
           h.setup_fee_cents,h.recurring_fee_cents,h.commission_bps,h.created_at,h.owner_user_id::text AS owner_uuid,
           h.vendor_id::text AS vendor_uuid,h.trial_started_at,h.trial_expires_at,
           owner.public_id AS owner_public_id,vendor.public_id AS vendor_public_id,vendor.demo_mode
    FROM hub_expansion_prospects h
    LEFT JOIN users owner ON owner.id=h.owner_user_id
    LEFT JOIN vendor_businesses vendor ON vendor.id=h.vendor_id
    WHERE h.public_id=$1 OR h.id::text=$1
    LIMIT 1
  `, [input.applicationId]);
  if (!snapshotResult.rowCount) throw new Error("HUB application not found");
  const snapshot = snapshotResult.rows[0];
  const status = requiredText(snapshot.status, "hub_prospect.status");
  if (status === "declined" || status === "converted") {
    throw new Error(`Trial is not available while HUB application status is ${status}`);
  }
  const planCode = requiredText(snapshot.plan_code, "hub_prospect.plan_code") as HubExpansionPlanCode;
  if (planCode === "claim") throw new Error("CLAIM applications do not include a Vendor Trial");

  const applicationId = requiredText(snapshot.public_id, "hub_prospect.public_id");
  const hubSlug = requiredText(snapshot.hub_slug, "hub_prospect.hub_slug");
  const createdAt = new Date(String(snapshot.created_at)).getTime();
  const reference = hubProspectDisplayReference(applicationId, hubSlug, createdAt);
  const common = {
    reference,
    businessName: requiredText(snapshot.business_name, "hub_prospect.business_name"),
    email: requiredText(snapshot.email, "hub_prospect.email"),
    hubName: requiredText(snapshot.hub_city, "hub_prospect.hub_city"),
    hubSlug,
    planCode,
    billingCycle: requiredText(snapshot.billing_cycle, "hub_prospect.billing_cycle") as HubBillingCycle,
    setupFeeCents: Number(snapshot.setup_fee_cents ?? 0),
    recurringFeeCents: Number(snapshot.recurring_fee_cents ?? 0),
    commissionBps: Number(snapshot.commission_bps ?? 0)
  };

  const existingStartedAt = snapshot.trial_started_at ? new Date(String(snapshot.trial_started_at)).getTime() : Number.NaN;
  const existingExpiresAt = snapshot.trial_expires_at ? new Date(String(snapshot.trial_expires_at)).getTime() : Number.NaN;
  if (
    snapshot.vendor_public_id &&
    snapshot.owner_public_id &&
    snapshot.demo_mode === true &&
    Number.isFinite(existingStartedAt) &&
    Number.isFinite(existingExpiresAt)
  ) {
    return {
      ...common,
      trial: {
        applicationId,
        vendorId: requiredText(snapshot.vendor_public_id, "vendor.public_id"),
        ownerUserId: requiredText(snapshot.owner_public_id, "owner.public_id"),
        startedAt: existingStartedAt,
        expiresAt: existingExpiresAt
      }
    };
  }

  const ownerResult = await runtime.sqlPool.query<SqlRow>(`
    SELECT id::text AS id,public_id
    FROM users
    WHERE lower(email::text)=lower($1)
      AND status='active'
      AND email_verified_at IS NOT NULL
    ORDER BY created_at
    LIMIT 1
  `, [common.email]);
  if (!ownerResult.rowCount) {
    throw new Error("The applicant must first sign in with a verified KONTA MOU account before Admin can create Trial access");
  }

  const registry = await resolveGemiCompanyByAfm(requiredText(snapshot.tax_number, "hub_prospect.tax_number"), input.now);
  if (registry.lookupStatus !== "matched") throw new Error("ΓΕΜΗ verification is required before Admin can create HUB Trial access");
  const resolution = await resolveExpansionHubForGemiCompany(registry);
  if (resolution.status !== "matched" || resolution.hub.slug !== hubSlug) {
    throw new Error("The verified ΓΕΜΗ location no longer resolves to the stored HUB");
  }

  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `admin-hub-trial:${applicationId}` },
    async (tx) => {
      const locked = await tx.query<SqlRow>(`
        SELECT id::text AS prospect_uuid,vendor_id::text AS vendor_uuid,owner_user_id::text AS owner_uuid,
               trial_started_at,trial_expires_at
        FROM hub_expansion_prospects
        WHERE public_id=$1
        FOR UPDATE
      `, [applicationId]);
      if (!locked.rowCount) throw new Error("HUB application not found");

      const already = locked.rows[0];
      if (already.vendor_uuid && already.owner_uuid && already.trial_started_at && already.trial_expires_at) {
        const linked = await tx.query<SqlRow>(`
          SELECT vendor.public_id AS vendor_public_id,owner.public_id AS owner_public_id,vendor.demo_mode
          FROM vendor_businesses vendor
          JOIN users owner ON owner.id=$2::uuid
          WHERE vendor.id=$1::uuid
          LIMIT 1
        `, [already.vendor_uuid, already.owner_uuid]);
        if (linked.rowCount && linked.rows[0].demo_mode === true) {
          return {
            ...common,
            trial: {
              applicationId,
              vendorId: requiredText(linked.rows[0].vendor_public_id, "vendor.public_id"),
              ownerUserId: requiredText(linked.rows[0].owner_public_id, "owner.public_id"),
              startedAt: new Date(String(already.trial_started_at)).getTime(),
              expiresAt: new Date(String(already.trial_expires_at)).getTime()
            }
          };
        }
      }

      const marketUuid = await ensureHubTrialMarket(tx, resolution.hub, input.now);
      const application: HubProspectApplicationInput = {
        taxNumber: requiredText(snapshot.tax_number, "hub_prospect.tax_number"),
        planCode,
        billingCycle: common.billingCycle,
        businessName: common.businessName,
        contactName: requiredText(snapshot.contact_name, "hub_prospect.contact_name"),
        email: common.email,
        phone: requiredText(snapshot.phone, "hub_prospect.phone"),
        primaryCategory: requiredText(snapshot.primary_category, "hub_prospect.primary_category"),
        websiteUrl: optionalText(snapshot.website_url),
        currentSalesChannels: optionalText(snapshot.current_sales_channels),
        notes: optionalText(snapshot.notes)
      };
      const trial = await provisionHubProspectTrial(tx, {
        prospectUuid: requiredText(locked.rows[0].prospect_uuid, "hub_prospect.id"),
        applicationId,
        marketUuid,
        ownerUuid: requiredText(ownerResult.rows[0].id, "user.id"),
        ownerPublicId: requiredText(ownerResult.rows[0].public_id, "user.public_id"),
        application,
        hub: resolution.hub,
        legalName: requiredText(snapshot.legal_name, "hub_prospect.legal_name"),
        gemiNumber: requiredText(snapshot.gemi_number, "hub_prospect.gemi_number"),
        registryAddress: requiredText(snapshot.address_line, "hub_prospect.address_line"),
        postcode: requiredText(snapshot.postal_code, "hub_prospect.postal_code"),
        now: input.now
      });
      return { ...common, trial };
    },
    { isolation: "serializable" }
  );
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
