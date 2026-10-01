import { AadeMyDataClient, CURRENT_MYDATA_SPEC_VERSION, type MyDataEnvironment } from "@buy-local-sparta/aade-mydata";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { isExpansionHubScope, vendorHubDisplayName } from "./vendor-hub-display";
import { vendorOperatingContextForPrincipal } from "./vendor-session";
import { isVendorTrialPrincipal } from "./vendor-trial-runtime";

export type VendorFiscalTaxDisplayMode = "gross_with_breakdown" | "net_plus_vat" | "summary_only";
export type VendorInvoiceTemplate = "clean" | "classic" | "compact";

export type VendorFiscalSettingsSnapshot = Readonly<{
  csrfToken: string;
  vendorId: string;
  marketId: string;
  hubId: string;
  hubName: string;
  trialMode: boolean;
  business: Readonly<{
    tradingName: string;
    legalName: string;
    taxNumber?: string;
    gemiNumber?: string;
    address?: string;
    email?: string;
  }>;
  aade: Readonly<{
    environment: MyDataEnvironment;
    userIdConfigured: boolean;
    subscriptionKeyConfigured: boolean;
    vaultAvailable: boolean;
    credentialsUpdatedAt?: number;
    lastConnectionCheckAt?: number;
    lastConnectionStatus?: "succeeded" | "failed";
    lastConnectionError?: string;
  }>;
  invoice: Readonly<{
    documentSeries: string;
    branchNumber?: number;
    previewVatRatePercent?: number;
    taxDisplayMode: VendorFiscalTaxDisplayMode;
    pdfTemplate: VendorInvoiceTemplate;
    pdfAccentHex: string;
    showLogo: boolean;
    showAadeQr: boolean;
    showPaymentDetails: boolean;
    footerNote: string;
  }>;
  governance: Readonly<{
    taxSource: "approved_product_tax_profiles";
    issuanceState: "trial_locked" | "activation_required";
  }>;
}>;

type FiscalIdentity = Readonly<{
  vendorUuid: string;
  marketUuid: string;
  tradingName: string;
  legalName: string;
  taxNumber?: string;
  gemiNumber?: string;
  address?: string;
  email?: string;
}>;

type FiscalSettingsRow = SqlRow & {
  aade_environment?: unknown;
  credentials_updated_at?: unknown;
  last_connection_check_at?: unknown;
  last_connection_status?: unknown;
  last_connection_error?: unknown;
  document_series?: unknown;
  branch_number?: unknown;
  preview_vat_rate_bps?: unknown;
  tax_display_mode?: unknown;
  pdf_template?: unknown;
  pdf_accent_hex?: unknown;
  show_logo?: unknown;
  show_aade_qr?: unknown;
  show_payment_details?: unknown;
  footer_note?: unknown;
};

type VendorFiscalSettingsInput = Readonly<{
  environment?: unknown;
  aadeUserId?: unknown;
  subscriptionKey?: unknown;
  documentSeries?: unknown;
  branchNumber?: unknown;
  previewVatRatePercent?: unknown;
  taxDisplayMode?: unknown;
  pdfTemplate?: unknown;
  pdfAccentHex?: unknown;
  showLogo?: unknown;
  showAadeQr?: unknown;
  showPaymentDetails?: unknown;
  footerNote?: unknown;
}>;

const DEFAULTS = {
  environment: "production" as MyDataEnvironment,
  documentSeries: "",
  taxDisplayMode: "gross_with_breakdown" as VendorFiscalTaxDisplayMode,
  pdfTemplate: "clean" as VendorInvoiceTemplate,
  pdfAccentHex: "#0F766E",
  showLogo: true,
  showAadeQr: true,
  showPaymentDetails: true,
  footerNote: ""
};

const TAX_DISPLAY_MODES = new Set<VendorFiscalTaxDisplayMode>(["gross_with_breakdown", "net_plus_vat", "summary_only"]);
const PDF_TEMPLATES = new Set<VendorInvoiceTemplate>(["clean", "classic", "compact"]);

function runtime() {
  if (!productionDatabaseConfigured()) throw new Error("Vendor fiscal settings require PostgreSQL");
  return getProductionPostgresRuntime();
}

function vendorScope(principal: SessionPrincipal, marketId: string) {
  if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
  return { actorUserId: principal.userId, vendorId: principal.vendorId, marketId };
}

function requiredVendorOwner(principal: SessionPrincipal) {
  if (!principal.vendorId || !principal.roles.includes("vendor_owner")) throw new Error("VENDOR_OWNER_REQUIRED");
}

function epoch(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rowText(row: FiscalSettingsRow | undefined, key: keyof FiscalSettingsRow): string | undefined {
  return optionalText(row?.[key]);
}

function rowInteger(row: FiscalSettingsRow | undefined, key: keyof FiscalSettingsRow): number | undefined {
  const value = row?.[key];
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function boundedText(value: unknown, max: number, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integerOrNull(value: unknown, min: number, max: number, label: string): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} is invalid`);
  return parsed;
}

function previewVatBps(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error("Preview VAT must be between 0 and 100");
  return Math.round(parsed * 100);
}

function validatedEnvironment(value: unknown): MyDataEnvironment {
  if (value === "test" || value === "production") return value;
  throw new Error("AADE environment must be test or production");
}

function validatedTaxDisplayMode(value: unknown): VendorFiscalTaxDisplayMode {
  if (typeof value === "string" && TAX_DISPLAY_MODES.has(value as VendorFiscalTaxDisplayMode)) return value as VendorFiscalTaxDisplayMode;
  throw new Error("Invoice tax display mode is invalid");
}

function validatedPdfTemplate(value: unknown): VendorInvoiceTemplate {
  if (typeof value === "string" && PDF_TEMPLATES.has(value as VendorInvoiceTemplate)) return value as VendorInvoiceTemplate;
  throw new Error("Invoice PDF template is invalid");
}

function validatedAccent(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^#[0-9A-F]{6}$/.test(normalized)) throw new Error("Invoice accent must be a six-digit HEX colour");
  return normalized;
}

function secretNames(vendorUuid: string) {
  return {
    userId: `kontamou_vendor_${vendorUuid}_aade_user_id`,
    subscriptionKey: `kontamou_vendor_${vendorUuid}_aade_subscription_key`
  };
}

async function resolveIdentity(principal: SessionPrincipal, marketId: string): Promise<FiscalIdentity> {
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  return uow.withTransaction(vendorScope(principal, marketId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT
        vendor.id::text AS vendor_uuid,
        vendor.market_id::text AS market_uuid,
        vendor.trading_name,
        vendor.legal_name,
        vendor.tax_number,
        vendor.gemi_number,
        location.address_line1,
        location.locality,
        location.postcode,
        location.public_email
      FROM vendor_businesses vendor
      LEFT JOIN LATERAL (
        SELECT address_line1,locality,postcode,public_email
        FROM vendor_locations
        WHERE vendor_id=vendor.id AND active=true
        ORDER BY is_primary DESC,created_at,id
        LIMIT 1
      ) location ON true
      WHERE vendor.public_id=$1 OR vendor.id::text=$1
      LIMIT 1
    `, [principal.vendorId]);
    if (result.rowCount !== 1) throw new Error("Vendor fiscal identity was not found");
    const row = result.rows[0];
    const vendorUuid = optionalText(row.vendor_uuid);
    const marketUuid = optionalText(row.market_uuid);
    const tradingName = optionalText(row.trading_name);
    const legalName = optionalText(row.legal_name);
    if (!vendorUuid || !marketUuid || !tradingName || !legalName) throw new Error("Vendor fiscal identity is incomplete");
    const address = [optionalText(row.address_line1), [optionalText(row.postcode), optionalText(row.locality)].filter(Boolean).join(" ") || undefined]
      .filter(Boolean)
      .join(", ");
    return {
      vendorUuid,
      marketUuid,
      tradingName,
      legalName,
      taxNumber: optionalText(row.tax_number),
      gemiNumber: optionalText(row.gemi_number),
      address: address || undefined,
      email: optionalText(row.public_email)
    };
  }, { readOnly: true });
}

async function readSettings(principal: SessionPrincipal, marketId: string): Promise<FiscalSettingsRow | undefined> {
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  return uow.withTransaction(vendorScope(principal, marketId), async (tx) => {
    const result = await tx.query<FiscalSettingsRow>(`
      SELECT settings.*
      FROM vendor_fiscal_settings settings
      JOIN vendor_businesses vendor ON vendor.id=settings.vendor_id
      WHERE vendor.public_id=$1 OR vendor.id::text=$1
      LIMIT 1
    `, [principal.vendorId]);
    return result.rows[0];
  }, { readOnly: true });
}

async function readVaultCredentials(identity: FiscalIdentity): Promise<Readonly<{
  vaultAvailable: boolean;
  userId?: string;
  subscriptionKey?: string;
}>> {
  const names = secretNames(identity.vendorUuid);
  try {
    const result = await runtime().nativePool.query<{ name: string; decrypted_secret: string }>(
      "SELECT name,decrypted_secret FROM vault.decrypted_secrets WHERE name = ANY($1::text[])",
      [[names.userId, names.subscriptionKey]]
    );
    const values = new Map(result.rows.map((row) => [row.name, row.decrypted_secret?.trim()]));
    return {
      vaultAvailable: true,
      userId: values.get(names.userId) || undefined,
      subscriptionKey: values.get(names.subscriptionKey) || undefined
    };
  } catch {
    return { vaultAvailable: false };
  }
}

async function upsertVaultSecret(name: string, value: string, description: string): Promise<void> {
  const db = runtime().nativePool;
  const existing = await db.query<{ id: string }>("SELECT id::text FROM vault.secrets WHERE name=$1 LIMIT 1", [name]);
  if (existing.rowCount) {
    await db.query("SELECT vault.update_secret($1::uuid,$2,$3,$4)", [existing.rows[0]!.id, value, name, description]);
  } else {
    await db.query("SELECT vault.create_secret($1,$2,$3)", [value, name, description]);
  }
}

function mapSnapshot(
  principal: SessionPrincipal,
  context: Awaited<ReturnType<typeof vendorOperatingContextForPrincipal>>,
  identity: FiscalIdentity,
  row: FiscalSettingsRow | undefined,
  credentials: Awaited<ReturnType<typeof readVaultCredentials>>
): VendorFiscalSettingsSnapshot {
  const environment = rowText(row, "aade_environment") === "test" ? "test" : DEFAULTS.environment;
  const taxDisplayMode = rowText(row, "tax_display_mode");
  const pdfTemplate = rowText(row, "pdf_template");
  const vatBps = rowInteger(row, "preview_vat_rate_bps");
  const branchNumber = rowInteger(row, "branch_number");
  const hubId = context.hubId;
  if (!hubId) throw new Error("HUB_VENDOR_REQUIRED");
  return {
    csrfToken: principal.csrfToken,
    vendorId: principal.vendorId!,
    marketId: context.marketId,
    hubId,
    hubName: vendorHubDisplayName(context),
    trialMode: isVendorTrialPrincipal(principal),
    business: {
      tradingName: identity.tradingName,
      legalName: identity.legalName,
      taxNumber: identity.taxNumber,
      gemiNumber: identity.gemiNumber,
      address: identity.address,
      email: identity.email
    },
    aade: {
      environment,
      userIdConfigured: Boolean(credentials.userId),
      subscriptionKeyConfigured: Boolean(credentials.subscriptionKey),
      vaultAvailable: credentials.vaultAvailable,
      credentialsUpdatedAt: epoch(row?.credentials_updated_at),
      lastConnectionCheckAt: epoch(row?.last_connection_check_at),
      lastConnectionStatus: rowText(row, "last_connection_status") as "succeeded" | "failed" | undefined,
      lastConnectionError: rowText(row, "last_connection_error")
    },
    invoice: {
      documentSeries: rowText(row, "document_series") ?? DEFAULTS.documentSeries,
      branchNumber,
      previewVatRatePercent: vatBps === undefined ? undefined : vatBps / 100,
      taxDisplayMode: TAX_DISPLAY_MODES.has(taxDisplayMode as VendorFiscalTaxDisplayMode) ? taxDisplayMode as VendorFiscalTaxDisplayMode : DEFAULTS.taxDisplayMode,
      pdfTemplate: PDF_TEMPLATES.has(pdfTemplate as VendorInvoiceTemplate) ? pdfTemplate as VendorInvoiceTemplate : DEFAULTS.pdfTemplate,
      pdfAccentHex: rowText(row, "pdf_accent_hex") ?? DEFAULTS.pdfAccentHex,
      showLogo: typeof row?.show_logo === "boolean" ? row.show_logo : DEFAULTS.showLogo,
      showAadeQr: typeof row?.show_aade_qr === "boolean" ? row.show_aade_qr : DEFAULTS.showAadeQr,
      showPaymentDetails: typeof row?.show_payment_details === "boolean" ? row.show_payment_details : DEFAULTS.showPaymentDetails,
      footerNote: rowText(row, "footer_note") ?? DEFAULTS.footerNote
    },
    governance: {
      taxSource: "approved_product_tax_profiles",
      issuanceState: isVendorTrialPrincipal(principal) ? "trial_locked" : "activation_required"
    }
  };
}

async function hubFiscalContext(principal: SessionPrincipal) {
  requiredVendorOwner(principal);
  const context = await vendorOperatingContextForPrincipal(principal);
  if (!isExpansionHubScope(context)) throw new Error("HUB_VENDOR_REQUIRED");
  return context;
}

export async function vendorFiscalSettings(principal: SessionPrincipal): Promise<VendorFiscalSettingsSnapshot> {
  const context = await hubFiscalContext(principal);
  const [identity, row] = await Promise.all([
    resolveIdentity(principal, context.marketId),
    readSettings(principal, context.marketId)
  ]);
  const credentials = await readVaultCredentials(identity);
  return mapSnapshot(principal, context, identity, row, credentials);
}

export async function updateVendorFiscalSettings(
  principal: SessionPrincipal,
  input: VendorFiscalSettingsInput
): Promise<VendorFiscalSettingsSnapshot> {
  const context = await hubFiscalContext(principal);
  const identity = await resolveIdentity(principal, context.marketId);

  const environment = validatedEnvironment(input.environment);
  const documentSeries = boundedText(input.documentSeries, 20, "Document series");
  const branchNumber = integerOrNull(input.branchNumber, 0, 9999, "Branch number");
  const previewVatRate = previewVatBps(input.previewVatRatePercent);
  const taxDisplayMode = validatedTaxDisplayMode(input.taxDisplayMode);
  const pdfTemplate = validatedPdfTemplate(input.pdfTemplate);
  const pdfAccentHex = validatedAccent(input.pdfAccentHex);
  const footerNote = boundedText(input.footerNote, 1200, "Invoice footer note");
  const showLogo = booleanValue(input.showLogo, DEFAULTS.showLogo);
  const showAadeQr = booleanValue(input.showAadeQr, DEFAULTS.showAadeQr);
  const showPaymentDetails = booleanValue(input.showPaymentDetails, DEFAULTS.showPaymentDetails);

  const aadeUserId = boundedText(input.aadeUserId, 160, "AADE user ID");
  const subscriptionKey = boundedText(input.subscriptionKey, 300, "AADE subscription key");
  if (aadeUserId && aadeUserId.length < 3) throw new Error("AADE user ID is too short");
  if (subscriptionKey && subscriptionKey.length < 12) throw new Error("AADE subscription key is too short");

  if (aadeUserId || subscriptionKey) {
    const names = secretNames(identity.vendorUuid);
    if (aadeUserId) await upsertVaultSecret(names.userId, aadeUserId, `KONTA MOY vendor AADE user id for ${principal.vendorId}`);
    if (subscriptionKey) await upsertVaultSecret(names.subscriptionKey, subscriptionKey, `KONTA MOY vendor AADE subscription key for ${principal.vendorId}`);
  }

  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(vendorScope(principal, context.marketId), async (tx) => {
    await tx.query(`
      INSERT INTO vendor_fiscal_settings(
        vendor_id,market_id,aade_environment,credentials_updated_at,document_series,branch_number,
        preview_vat_rate_bps,tax_display_mode,pdf_template,pdf_accent_hex,show_logo,show_aade_qr,
        show_payment_details,footer_note,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now()
      )
      ON CONFLICT(vendor_id) DO UPDATE SET
        market_id=EXCLUDED.market_id,
        aade_environment=EXCLUDED.aade_environment,
        credentials_updated_at=COALESCE(EXCLUDED.credentials_updated_at,vendor_fiscal_settings.credentials_updated_at),
        document_series=EXCLUDED.document_series,
        branch_number=EXCLUDED.branch_number,
        preview_vat_rate_bps=EXCLUDED.preview_vat_rate_bps,
        tax_display_mode=EXCLUDED.tax_display_mode,
        pdf_template=EXCLUDED.pdf_template,
        pdf_accent_hex=EXCLUDED.pdf_accent_hex,
        show_logo=EXCLUDED.show_logo,
        show_aade_qr=EXCLUDED.show_aade_qr,
        show_payment_details=EXCLUDED.show_payment_details,
        footer_note=EXCLUDED.footer_note,
        updated_at=now()
    `, [
      identity.vendorUuid,
      identity.marketUuid,
      environment,
      aadeUserId || subscriptionKey ? new Date() : null,
      documentSeries,
      branchNumber,
      previewVatRate,
      taxDisplayMode,
      pdfTemplate,
      pdfAccentHex,
      showLogo,
      showAadeQr,
      showPaymentDetails,
      footerNote || null
    ]);
  }, { isolation: "serializable" });

  return vendorFiscalSettings(principal);
}

function aadeToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function baseUrl(environment: MyDataEnvironment): string {
  return environment === "production" ? "https://mydatapi.aade.gr/myDATA" : "https://mydataapidev.aade.gr";
}

function redactedError(error: unknown, credentials: { userId?: string; subscriptionKey?: string }): string {
  let message = error instanceof Error ? error.message : "AADE myDATA connection failed";
  for (const value of [credentials.userId, credentials.subscriptionKey]) {
    if (value) message = message.replaceAll(value, "[REDACTED]");
  }
  return message.slice(0, 700);
}

async function recordConnectionStatus(
  principal: SessionPrincipal,
  context: Awaited<ReturnType<typeof vendorOperatingContextForPrincipal>>,
  identity: FiscalIdentity,
  status: "succeeded" | "failed",
  error?: string
) {
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(vendorScope(principal, context.marketId), async (tx) => {
    await tx.query(`
      INSERT INTO vendor_fiscal_settings(
        vendor_id,market_id,last_connection_check_at,last_connection_status,last_connection_error,created_at,updated_at
      ) VALUES($1::uuid,$2::uuid,now(),$3,$4,now(),now())
      ON CONFLICT(vendor_id) DO UPDATE SET
        market_id=EXCLUDED.market_id,
        last_connection_check_at=EXCLUDED.last_connection_check_at,
        last_connection_status=EXCLUDED.last_connection_status,
        last_connection_error=EXCLUDED.last_connection_error,
        updated_at=now()
    `, [identity.vendorUuid, identity.marketUuid, status, error ?? null]);
  }, { isolation: "serializable" });
}

export async function testVendorAadeConnection(principal: SessionPrincipal): Promise<Readonly<{
  ok: boolean;
  checkedAt: number;
  snapshot: VendorFiscalSettingsSnapshot;
}>> {
  const context = await hubFiscalContext(principal);
  const identity = await resolveIdentity(principal, context.marketId);
  const row = await readSettings(principal, context.marketId);
  const credentials = await readVaultCredentials(identity);
  if (!credentials.vaultAvailable) throw new Error("Supabase Vault is not available for vendor AADE credentials");
  if (!credentials.userId || !credentials.subscriptionKey) throw new Error("Save both the AADE user ID and subscription key before testing the connection");

  const environment = rowText(row, "aade_environment") === "test" ? "test" : "production";
  const client = new AadeMyDataClient({
    environment,
    baseUrl: baseUrl(environment),
    userId: credentials.userId,
    subscriptionKey: credentials.subscriptionKey,
    requestTimeoutMs: 15_000,
    specVersion: CURRENT_MYDATA_SPEC_VERSION
  });

  const checkedAt = Date.now();
  try {
    const today = aadeToday();
    await client.requestTransmittedDocs({ mark: "0", dateFrom: today, dateTo: today });
    await recordConnectionStatus(principal, context, identity, "succeeded");
    return { ok: true, checkedAt, snapshot: await vendorFiscalSettings(principal) };
  } catch (error) {
    const message = redactedError(error, credentials);
    await recordConnectionStatus(principal, context, identity, "failed", message);
    throw new Error(message);
  }
}
