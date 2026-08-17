import { previewVendorProductCsv, type SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
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
  return postgresVendorRuntimeEnabled() ? db().catalogWorkspace(principal) : memoryCatalogWorkspace(principal);
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
  return postgresVendorRuntimeEnabled() ? db().financeWorkspace(principal) : memoryFinanceWorkspace(principal);
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
  // PostgreSQL commerce writes are already authoritative/durable and are consumed through
  // database projections. Development mode retains the legacy deterministic synchronization.
  if (!postgresVendorRuntimeEnabled()) {
    // Imported lazily through the module binding above; no-op in database mode.
    void import("./vendor-operations-runtime").then((module) => module.synchronizeOperationalEvents());
  }
}
