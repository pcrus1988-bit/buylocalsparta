import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { normalizeGreekAfm, resolveGemiCompanyByAfm } from "./gemi-runtime";
import { resolveExpansionHubForGemiCompany } from "./hub-location-resolution";
import { getHubExpansionPlan, type HubExpansionPlanCode } from "./hub-expansion-plans";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const globals = globalThis as typeof globalThis & {
  __blsHubProspectRateLimiter?: PostgresFixedWindowRateLimiter;
};

export type HubProspectApplicationInput = Readonly<{
  taxNumber: string;
  planCode: HubExpansionPlanCode;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  primaryCategory: string;
  websiteUrl?: string;
  currentSalesChannels?: string;
  notes?: string;
}>;

export type HubProspectApplicationReceipt = Readonly<{
  reference: string;
  status: "pending";
  hubSlug: string;
  hubName: string;
  planCode: HubExpansionPlanCode;
  paymentRequired: false;
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
  now: number;
}): Promise<HubProspectApplicationReceipt> {
  const application = normalizeApplication(input.application);
  const plan = getHubExpansionPlan(application.planCode);
  if (!plan) throw new HubProspectApplicationError(400, "plan_invalid", "Επίλεξε έγκυρο πρόγραμμα συνεργασίας.");

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
    throw new HubProspectApplicationError(409, "sparta_uses_existing_join", "Η επαληθευμένη τοποθεσία ανήκει στο HUB Σπάρτης. Συνέχισε από την ενεργή διαδικασία /join.");
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

      await tx.query(`
        INSERT INTO hub_expansion_prospects (
          id,public_id,hub_id,hub_slug,hub_city,hub_region,plan_code,tax_number,gemi_number,
          business_name,legal_name,contact_name,email,phone,address_line,postal_code,primary_category,
          website_url,current_sales_channels,notes,source,status,setup_fee_cents,annual_fee_cents,
          commission_bps,payment_state,consent_at,registry_checked_at,hub_resolution_method,
          hub_resolution_latitude,hub_resolution_longitude,hub_distance_km,created_at,updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          'hub_expansion_join','pending',$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$31
        )
      `, [
        applicationUuid,
        reference,
        hub.id,
        hub.slug,
        hub.nameEl,
        hub.regionEl,
        plan.code,
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
        plan.annualFeeCents,
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

      return {
        reference,
        status: "pending" as const,
        hubSlug: hub.slug,
        hubName: hub.nameEl,
        planCode: plan.code,
        paymentRequired: false as const
      };
    },
    { isolation: "serializable" }
  );
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
