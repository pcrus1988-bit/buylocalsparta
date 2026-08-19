import { PostgresUnitOfWork, previewVendorProductCsv, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import { vendorCatalogControlWorkspace } from "./vendor-catalog-control-service";
import { mediaUploadMode } from "./media-upload-service";
import {
  createVendorProductDraft as memoryCreateDraft,
  submitVendorProduct as memorySubmitProduct,
  previewOrCommitVendorCsv as memoryCsv,
  vendorCatalogWorkspace as memoryCatalogWorkspace,
  vendorTrustWorkspace as memoryTrustWorkspace,
  uploadVendorMedia as memoryUploadMedia,
  submitVendorCompliance as memorySubmitCompliance,
  vendorAdviceWorkspace as memoryAdviceWorkspace,
  vendorSendAdviceMessage as memorySendAdviceMessage,
  vendorAppointmentAction as memoryAppointmentAction,
  vendorFinanceWorkspace as memoryFinanceWorkspace,
  submitVendorInvoice as memorySubmitInvoice,
  vendorAnalyticsWorkspace as memoryAnalyticsWorkspace,
  vendorReturnsWorkspace as memoryReturnsWorkspace,
  vendorReturnOperationalAction as memoryReturnAction
} from "./vendor-operations-runtime";

const db = () => getProductionPostgresRuntime().vendorOperations;

export async function vendorCatalogWorkspace(principal: SessionPrincipal) {
  const [catalog, controls] = await Promise.all([
    postgresVendorRuntimeEnabled() ? db().catalogWorkspace(principal) : Promise.resolve(memoryCatalogWorkspace(principal)),
    vendorCatalogControlWorkspace(principal)
  ]);
  return { ...catalog, ...controls };
}

export async function createVendorProductDraft(principal: SessionPrincipal, input: {
  title: string; categoryCode: string; vendorSku?: string; brand?: string; model?: string; gtin?: string;
  supplierUnitPriceMinor: number; stockOnHand: number; safetyStock?: number; adviceAvailable?: boolean;
}) {
  return postgresVendorRuntimeEnabled() ? db().createProductDraft(principal, input) : memoryCreateDraft(principal, input);
}

export async function submitVendorProduct(principal: SessionPrincipal, submissionId: string) {
  return postgresVendorRuntimeEnabled() ? db().submitProduct(principal, submissionId) : memorySubmitProduct(principal, submissionId);
}

export async function previewOrCommitVendorCsv(principal: SessionPrincipal, csv: string, confirm: boolean) {
  if (!postgresVendorRuntimeEnabled()) return memoryCsv(principal, csv, confirm);
  const preview = previewVendorProductCsv(csv);
  if (!confirm || preview.errors.length) return { preview, created: 0 };
  let created = 0;
  for (const row of preview.rows) {
    await db().createProductDraft(principal, {
      title: row.title, categoryCode: row.categoryCode, vendorSku: row.vendorSku, brand: row.brand, model: row.model, gtin: row.gtin,
      supplierUnitPriceMinor: row.supplierUnitPriceMinor, stockOnHand: row.stockOnHand, safetyStock: row.safetyStock, adviceAvailable: row.adviceAvailable, source: "csv"
    });
    created += 1;
  }
  return { preview, created };
}

export async function vendorTrustWorkspace(principal: SessionPrincipal) {
  if (!postgresVendorRuntimeEnabled()) return { ...memoryTrustWorkspace(principal), mediaUploadMode: mediaUploadMode() };
  const result = await db().trustWorkspace(principal);
  return { csrfToken: result.csrfToken, products: result.canonicalProducts, assets: result.assets, documents: result.documents, mediaUploadMode: mediaUploadMode() };
}

export async function uploadVendorMedia(principal: SessionPrincipal, input: {
  canonicalVariantId: string; kind: "image" | "video" | "document"; filename: string; contentType: string; bytes: Uint8Array; altText?: string; rightsOwner: string;
}) {
  if (!postgresVendorRuntimeEnabled()) return memoryUploadMedia(principal, input);
  throw new Error("Production media upload is gated until S3-compatible object storage and malware scanning are configured; no binary was accepted");
}

export async function submitVendorCompliance(principal: SessionPrincipal, input: { canonicalVariantId: string; type: string; issuer?: string; identifier?: string; mediaAssetId?: string; validTo?: number }) {
  return postgresVendorRuntimeEnabled() ? db().submitCompliance(principal, input) : memorySubmitCompliance(principal, input);
}

export async function vendorAdviceWorkspace(principal: SessionPrincipal) {
  return postgresVendorRuntimeEnabled() ? db().adviceWorkspace(principal) : memoryAdviceWorkspace(principal);
}
export async function vendorSendAdviceMessage(principal: SessionPrincipal, conversationId: string, body: string) {
  return postgresVendorRuntimeEnabled() ? db().sendAdviceMessage(principal, conversationId, body) : memorySendAdviceMessage(principal, conversationId, body);
}
export async function vendorAppointmentAction(principal: SessionPrincipal, appointmentId: string, action: "complete" | "cancel") {
  return postgresVendorRuntimeEnabled() ? db().appointmentAction(principal, appointmentId, action) : memoryAppointmentAction(principal, appointmentId, action);
}
export async function vendorFinanceWorkspace(principal: SessionPrincipal) {
  if (!postgresVendorRuntimeEnabled()) return memoryFinanceWorkspace(principal);
  const [workspace, commercialTerms] = await Promise.all([
    db().financeWorkspace(principal),
    vendorCommercialTerms(principal)
  ]);
  return { ...workspace, commercialTerms };
}
export async function submitVendorInvoice(principal: SessionPrincipal, input: { procurementId: string; invoiceNumber: string; invoiceGrossMinor: number }) {
  return postgresVendorRuntimeEnabled() ? db().submitInvoice(principal, input) : memorySubmitInvoice(principal, input);
}
export async function vendorAnalyticsWorkspace(principal: SessionPrincipal) {
  return postgresVendorRuntimeEnabled() ? db().analyticsWorkspace(principal) : memoryAnalyticsWorkspace(principal);
}
export async function vendorReturnsWorkspace(principal: SessionPrincipal) {
  return postgresVendorRuntimeEnabled() ? db().returnsWorkspace(principal) : memoryReturnsWorkspace(principal);
}
export async function vendorReturnOperationalAction(principal: SessionPrincipal, input: { returnId: string; kind: "replacement" | "repair"; action: string; reference?: string }) {
  return postgresVendorRuntimeEnabled() ? db().returnAction(principal, input) : memoryReturnAction(principal, input);
}

export function synchronizeOperationalEvents(): void {
  if (!postgresVendorRuntimeEnabled()) {
    void import("./vendor-operations-runtime").then((module) => module.synchronizeOperationalEvents());
  }
}

async function vendorCommercialTerms(principal: SessionPrincipal) {
  if (!principal.vendorId) return undefined;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.nativePool);
  return uow.withTransaction({ actorUserId: principal.userId, vendorId: principal.vendorId, marketId: "sparta" }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT agreement_code,status,commission_rate_bps,commission_basis,commission_tax_mode,commission_tax_rate_bps,
             commission_applies_to_shipping,listing_fee_minor,recurring_fee_minor,recurring_fee_period,
             starts_at,ends_at,signed_at,activated_at,updated_at
      FROM vendor_commercial_agreements
      WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      ORDER BY (status='active') DESC, updated_at DESC
      LIMIT 1`, [principal.vendorId]);
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    return {
      agreementCode: String(row.agreement_code),
      status: String(row.status),
      commissionRateBps: safeInteger(row.commission_rate_bps),
      commissionBasis: String(row.commission_basis ?? ""),
      commissionTaxMode: String(row.commission_tax_mode ?? ""),
      commissionTaxRateBps: safeInteger(row.commission_tax_rate_bps),
      commissionAppliesToShipping: Boolean(row.commission_applies_to_shipping),
      listingFeeMinor: safeInteger(row.listing_fee_minor),
      recurringFeeMinor: safeInteger(row.recurring_fee_minor),
      recurringFeePeriod: row.recurring_fee_period ? String(row.recurring_fee_period) : undefined,
      startsAt: optionalEpoch(row.starts_at),
      endsAt: optionalEpoch(row.ends_at),
      signedAt: optionalEpoch(row.signed_at),
      activatedAt: optionalEpoch(row.activated_at)
    };
  }, { readOnly: true });
}

function safeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function optionalEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}
