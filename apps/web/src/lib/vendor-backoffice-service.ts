import { previewVendorProductCsv, type SessionPrincipal } from "@buy-local-sparta/core";
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

function optionalEpoch(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function euroMinor(value: unknown): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(integer(value) / 100);
}

function isAdviceNotification(item: { title: string }) {
  return !item.title.startsWith("vendor.order_") && !item.title.startsWith("vendor.sla_");
}

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
  return { csrfToken: result.csrfToken, products: result.canonicalProducts, assets: result.assets.filter((asset) => Boolean(asset.canonicalVariantId)), documents: result.documents, mediaUploadMode: mediaUploadMode() };
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
  const result = postgresVendorRuntimeEnabled() ? await db().adviceWorkspace(principal) : memoryAdviceWorkspace(principal);
  return { ...result, notifications: result.notifications.filter(isAdviceNotification) };
}
export async function vendorSendAdviceMessage(principal: SessionPrincipal, conversationId: string, body: string) {
  return postgresVendorRuntimeEnabled() ? db().sendAdviceMessage(principal, conversationId, body) : memorySendAdviceMessage(principal, conversationId, body);
}
export async function vendorAppointmentAction(principal: SessionPrincipal, appointmentId: string, action: "complete" | "cancel") {
  return postgresVendorRuntimeEnabled() ? db().appointmentAction(principal, appointmentId, action) : memoryAppointmentAction(principal, appointmentId, action);
}

export async function vendorFinanceWorkspace(principal: SessionPrincipal) {
  if (!postgresVendorRuntimeEnabled()) return memoryFinanceWorkspace(principal);
  if (!principal.vendorId) return db().financeWorkspace(principal);

  const pool = getProductionPostgresRuntime().nativePool;
  const [procurement, settlements, summary, payoutDestination, adjustments, agreement] = await Promise.all([
    pool.query(`SELECT p.public_id,p.status::text,co.public_id AS order_id,
        p.merchandise_gross_minor,p.vendor_delivery_compensation_minor,p.adjustment_minor,
        p.service_fee_minor,p.payable_minor,p.updated_at,
        (SELECT vi.invoice_number FROM procurement_invoice_matches pim JOIN vendor_invoices vi ON vi.id=pim.vendor_invoice_id WHERE pim.procurement_id=p.id ORDER BY pim.created_at DESC LIMIT 1) AS invoice_number,
        (SELECT COALESCE(sl.payout_reference,sb.payout_reference) FROM settlement_lines sl JOIN settlement_batches sb ON sb.id=sl.batch_id WHERE sl.procurement_id=p.id ORDER BY sb.created_at DESC LIMIT 1) AS payout_reference
      FROM procurements p
      JOIN customer_orders co ON co.id=p.order_id
      WHERE p.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      ORDER BY p.updated_at DESC`, [principal.vendorId]),
    pool.query(`SELECT sb.public_id,sb.batch_number,sb.status,
        COALESCE(sum(sl.payable_minor),0) AS supplier_payable_minor,
        COALESCE(sum(sl.platform_invoice_offset_minor),0) AS platform_invoice_offset_minor,
        COALESCE(sum(sl.vendor_receivable_offset_minor),0) AS vendor_receivable_offset_minor,
        COALESCE(sum(sl.final_minor),0) AS total_payable,
        count(*)::int AS line_count,sb.period_start,sb.period_end,sb.paid_at,sb.payout_reference,
        max(sl.payout_destination_snapshot->>'maskedAccount') AS masked_account,
        max(sl.payout_destination_snapshot->>'displayLabel') AS payout_label
      FROM settlement_lines sl
      JOIN settlement_batches sb ON sb.id=sl.batch_id
      WHERE sl.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      GROUP BY sb.id ORDER BY sb.created_at DESC`, [principal.vendorId]),
    pool.query(`SELECT merchandise_gross_minor,expected_platform_fee_minor,
        vendor_delivery_compensation_minor,procurement_adjustment_minor,
        supplier_payable_minor,scheduled_payout_minor,paid_minor
      FROM vendor_finance_summary_v1 WHERE vendor_public_id=$1`, [principal.vendorId]),
    pool.query(`SELECT public_id,provider,display_label,masked_account,account_holder,status,
        verified_at,effective_at,superseded_at
      FROM vendor_payout_destinations
      WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      ORDER BY CASE status WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        effective_at DESC,created_at DESC LIMIT 1`, [principal.vendorId]),
    pool.query(`SELECT a.public_id,a.source_kind,a.direction,a.amount_minor,a.reason_code,a.reason,
        a.status,a.requires_platform_credit_document,a.created_at,
        COALESCE((SELECT sum(ap.amount_minor) FROM vendor_finance_adjustment_applications ap WHERE ap.adjustment_id=a.id AND ap.status IN ('reserved','applied')),0) AS allocated_minor
      FROM vendor_finance_adjustments a
      WHERE a.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      ORDER BY a.created_at DESC LIMIT 100`, [principal.vendorId]),
    pool.query(`SELECT agreement_code,status,
        bls_private.vendor_agreement_effective_state(status::text,starts_at,ends_at,now()) AS effective_status,
        commission_rate_bps,commission_basis,commission_tax_mode,commission_tax_rate_bps,
        commission_applies_to_shipping,listing_fee_minor,recurring_fee_minor,recurring_fee_period,
        starts_at,ends_at,signed_at,activated_at
      FROM vendor_commercial_agreements
      WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
      ORDER BY
        CASE bls_private.vendor_agreement_effective_state(status::text,starts_at,ends_at,now())
          WHEN 'effective' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
        created_at DESC LIMIT 1`, [principal.vendorId])
  ]);

  const summaryRow = summary.rows[0] ?? {};
  const destinationRow = payoutDestination.rows[0];
  const agreementRow = agreement.rows[0];

  return {
    csrfToken: principal.csrfToken,
    summary: {
      merchandiseGrossMinor: integer(summaryRow.merchandise_gross_minor),
      expectedPlatformFeeMinor: integer(summaryRow.expected_platform_fee_minor),
      vendorDeliveryCompensationMinor: integer(summaryRow.vendor_delivery_compensation_minor),
      procurementAdjustmentMinor: integer(summaryRow.procurement_adjustment_minor),
      supplierPayableMinor: integer(summaryRow.supplier_payable_minor),
      scheduledPayoutMinor: integer(summaryRow.scheduled_payout_minor),
      paidMinor: integer(summaryRow.paid_minor)
    },
    procurements: procurement.rows.map((row) => ({
      id: String(row.public_id),
      orderId: String(row.order_id),
      status: String(row.status),
      invoiceNumber: row.invoice_number ? String(row.invoice_number) : undefined,
      gross: euroMinor(row.merchandise_gross_minor),
      grossMinor: integer(row.merchandise_gross_minor),
      serviceFeeGross: euroMinor(row.service_fee_minor),
      serviceFeeGrossMinor: integer(row.service_fee_minor),
      vendorDeliveryCompensation: euroMinor(row.vendor_delivery_compensation_minor),
      vendorDeliveryCompensationMinor: integer(row.vendor_delivery_compensation_minor),
      adjustment: euroMinor(row.adjustment_minor),
      adjustmentMinor: integer(row.adjustment_minor),
      payable: euroMinor(row.payable_minor),
      payableMinor: integer(row.payable_minor),
      payoutReference: row.payout_reference ? String(row.payout_reference) : undefined,
      updatedAt: optionalEpoch(row.updated_at) ?? Date.now()
    })),
    settlements: settlements.rows.map((row) => ({
      id: String(row.public_id),
      batchNumber: String(row.batch_number),
      status: String(row.status),
      totalPayable: euroMinor(row.total_payable),
      totalPayableMinor: integer(row.total_payable),
      supplierPayableMinor: integer(row.supplier_payable_minor),
      platformInvoiceOffsetMinor: integer(row.platform_invoice_offset_minor),
      vendorReceivableOffsetMinor: integer(row.vendor_receivable_offset_minor),
      lineCount: integer(row.line_count),
      periodStart: optionalEpoch(row.period_start) ?? Date.now(),
      periodEnd: optionalEpoch(row.period_end) ?? Date.now(),
      paidAt: optionalEpoch(row.paid_at),
      payoutReference: row.payout_reference ? String(row.payout_reference) : undefined,
      payoutDestination: row.masked_account ? {
        maskedAccount: String(row.masked_account),
        label: row.payout_label ? String(row.payout_label) : "Τραπεζικός λογαριασμός"
      } : undefined
    })),
    payoutDestination: destinationRow ? {
      id: String(destinationRow.public_id),
      provider: String(destinationRow.provider),
      displayLabel: String(destinationRow.display_label),
      maskedAccount: String(destinationRow.masked_account),
      accountHolder: String(destinationRow.account_holder),
      status: String(destinationRow.status),
      verifiedAt: optionalEpoch(destinationRow.verified_at),
      effectiveAt: optionalEpoch(destinationRow.effective_at),
      supersededAt: optionalEpoch(destinationRow.superseded_at)
    } : undefined,
    adjustments: adjustments.rows.map((row) => ({
      id: String(row.public_id),
      sourceKind: String(row.source_kind),
      direction: String(row.direction),
      amountMinor: integer(row.amount_minor),
      allocatedMinor: integer(row.allocated_minor),
      reasonCode: String(row.reason_code),
      reason: String(row.reason),
      status: String(row.status),
      requiresPlatformCreditDocument: Boolean(row.requires_platform_credit_document),
      createdAt: optionalEpoch(row.created_at) ?? Date.now()
    })),
    commercialTerms: agreementRow ? {
      agreementCode: String(agreementRow.agreement_code),
      status: String(agreementRow.status),
      effectiveStatus: String(agreementRow.effective_status),
      commissionRateBps: Number(agreementRow.commission_rate_bps ?? 0),
      commissionBasis: String(agreementRow.commission_basis ?? ""),
      commissionTaxMode: String(agreementRow.commission_tax_mode ?? ""),
      commissionTaxRateBps: Number(agreementRow.commission_tax_rate_bps ?? 0),
      commissionAppliesToShipping: Boolean(agreementRow.commission_applies_to_shipping),
      listingFeeMinor: Number(agreementRow.listing_fee_minor ?? 0),
      recurringFeeMinor: Number(agreementRow.recurring_fee_minor ?? 0),
      recurringFeePeriod: agreementRow.recurring_fee_period ? String(agreementRow.recurring_fee_period) : undefined,
      startsAt: optionalEpoch(agreementRow.starts_at),
      endsAt: optionalEpoch(agreementRow.ends_at),
      signedAt: optionalEpoch(agreementRow.signed_at),
      activatedAt: optionalEpoch(agreementRow.activated_at)
    } : undefined
  };
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
