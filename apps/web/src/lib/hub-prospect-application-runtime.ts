import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getExpansionHubBySlug } from "./expansion-hubs";
import { getHubExpansionPlan, type HubExpansionPlanCode } from "./hub-expansion-plans";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const globals = globalThis as typeof globalThis & {
  __blsHubProspectRateLimiter?: PostgresFixedWindowRateLimiter;
};

export type HubProspectApplicationInput = Readonly<{
  hubSlug: string;
  planCode: HubExpansionPlanCode;
  businessName: string;
  legalName?: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
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
  const hub = getExpansionHubBySlug(application.hubSlug);
  if (!hub) throw new HubProspectApplicationError(400, "hub_invalid", "Επίλεξε έγκυρο HUB επέκτασης.");
  if (hub.isSpartaLegacy) {
    throw new HubProspectApplicationError(409, "sparta_uses_existing_join", "Η Σπάρτη χρησιμοποιεί την ενεργή διαδικασία συνεργασίας στο /join.");
  }
  const plan = getHubExpansionPlan(application.planCode);
  if (!plan) throw new HubProspectApplicationError(400, "plan_invalid", "Επίλεξε έγκυρο πρόγραμμα συνεργασίας.");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const createdAt = new Date(input.now);
  const applicationUuid = randomUUID();
  const reference = id("hubprospect");

  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `public-hub-prospect:${reference}` },
    async (tx) => {
      const duplicate = await tx.query(`
        SELECT 1 AS present
        FROM hub_expansion_prospects
        WHERE hub_slug=$1
          AND lower(email)=lower($2)
          AND lower(business_name)=lower($3)
          AND status NOT IN ('declined','converted')
        LIMIT 1
      `, [hub.slug, application.email, application.businessName]);
      if (duplicate.rowCount) {
        throw new HubProspectApplicationError(409, "application_exists", "Υπάρχει ήδη ενεργή αίτηση για αυτή την επιχείρηση στο συγκεκριμένο HUB.");
      }

      await tx.query(`
        INSERT INTO hub_expansion_prospects (
          id,public_id,hub_id,hub_slug,hub_city,hub_region,plan_code,business_name,legal_name,
          contact_name,email,phone,address_line,postal_code,primary_category,website_url,
          current_sales_channels,notes,source,status,setup_fee_cents,annual_fee_cents,commission_bps,
          payment_state,consent_at,created_at,updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          'hub_expansion_join','pending',$19,$20,$21,$22,$23,$23,$23
        )
      `, [
        applicationUuid,
        reference,
        hub.id,
        hub.slug,
        hub.nameEl,
        hub.regionEl,
        plan.code,
        application.businessName,
        application.legalName ?? null,
        application.contactName,
        application.email,
        application.phone,
        application.addressLine,
        application.postalCode,
        application.primaryCategory,
        application.websiteUrl ?? null,
        application.currentSalesChannels ?? null,
        application.notes ?? null,
        plan.setupFeeCents,
        plan.annualFeeCents,
        plan.commissionBps,
        plan.code === "claim" ? "not_required" : "not_requested",
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
  const hubSlug = requiredSlug(input.hubSlug, "HUB");
  const plan = getHubExpansionPlan(input.planCode);
  if (!plan) throw new HubProspectApplicationError(400, "plan_invalid", "Επίλεξε έγκυρο πρόγραμμα συνεργασίας.");
  const email = requiredLimited(input.email, "Email", 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HubProspectApplicationError(400, "email_invalid", "Χρειάζεται έγκυρο email επικοινωνίας.");
  const phone = requiredLimited(input.phone, "Τηλέφωνο", 32);
  if (!/^[+0-9 ()-]{8,32}$/.test(phone)) throw new HubProspectApplicationError(400, "phone_invalid", "Το τηλέφωνο δεν έχει έγκυρη μορφή.");
  const postalCode = requiredLimited(input.postalCode, "Ταχυδρομικός κώδικας", 5);
  if (!/^\d{5}$/.test(postalCode)) throw new HubProspectApplicationError(400, "postcode_invalid", "Ο ταχυδρομικός κώδικας πρέπει να έχει 5 ψηφία.");
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
    hubSlug,
    planCode: plan.code,
    businessName: requiredLimited(input.businessName, "Εμπορική ονομασία", 120),
    legalName: optionalLimited(input.legalName, 160),
    contactName: requiredLimited(input.contactName, "Υπεύθυνος επικοινωνίας", 120),
    email,
    phone,
    addressLine: requiredLimited(input.addressLine, "Διεύθυνση", 180),
    postalCode,
    primaryCategory: requiredLimited(input.primaryCategory, "Κατηγορία", 100),
    websiteUrl,
    currentSalesChannels: optionalLimited(input.currentSalesChannels, 600),
    notes: optionalLimited(input.notes, 1500)
  };
}

function requiredSlug(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(normalized)) throw new HubProspectApplicationError(400, "hub_invalid", `${label}: επίλεξε έγκυρη τιμή.`);
  return normalized;
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
