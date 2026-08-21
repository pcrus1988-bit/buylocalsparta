import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresAdminRuntimeEnabled } from "./admin-runtime";

function int(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function evidenceIsSubstantive(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 20) return false;
  return !/^(ok|okay|approved|done|yes|okok)[.!\s-]*$/i.test(normalized);
}

export type AdminFinanceOverview = Readonly<{
  metrics: Readonly<{
    capturedGmvMinor: number;
    customerDeliveryMinor: number;
    expectedPlatformFeeMinor: number;
    issuedPlatformFeeNetMinor: number;
    issuedPlatformFeeGrossMinor: number;
    openVendorLiabilityMinor: number;
    scheduledPayoutMinor: number;
    paidVendorMinor: number;
    completedRefundMinor: number;
    paymentProviderExpenseMinor: number;
    carrierPayableMinor: number;
    deliverySubsidyMinor: number;
  }>;
  controls: Readonly<{
    finalPaidFulfilmentsMissingProcurement: number;
    vendorsWithoutEffectiveAgreement: number;
    vendorsWithoutVerifiedPayoutDestination: number;
    weakRequiredAccountingEvidence: number;
    openDeliveryClearing: number;
    openPaymentClearing: number;
    pendingVendorAdjustments: number;
    pendingCommissionCreditDocuments: number;
  }>;
}>;

export async function adminFinanceOverview(_principal: SessionPrincipal): Promise<AdminFinanceOverview | undefined> {
  if (!postgresAdminRuntimeEnabled()) return undefined;
  const pool = getProductionPostgresRuntime().nativePool;
  const [money, controls, policyEvidence] = await Promise.all([
    pool.query(`SELECT
      COALESCE((SELECT sum(co.subtotal_minor) FROM customer_orders co WHERE EXISTS(
        SELECT 1 FROM payments p WHERE p.order_id=co.id AND p.status::text IN ('captured','partially_refunded','refunded','chargeback') AND p.captured_minor>0
      )),0) AS captured_gmv_minor,
      COALESCE((SELECT sum(co.shipping_minor) FROM customer_orders co WHERE EXISTS(
        SELECT 1 FROM payments p WHERE p.order_id=co.id AND p.status::text IN ('captured','partially_refunded','refunded','chargeback') AND p.captured_minor>0
      )),0) AS customer_delivery_minor,
      COALESCE((SELECT sum(service_fee_minor) FROM procurements WHERE status::text <> 'reversed'),0) AS expected_platform_fee_minor,
      COALESCE((SELECT sum(net_minor) FROM platform_vendor_invoices WHERE status='issued'),0) AS issued_platform_fee_net_minor,
      COALESCE((SELECT sum(gross_minor) FROM platform_vendor_invoices WHERE status='issued'),0) AS issued_platform_fee_gross_minor,
      COALESCE((SELECT sum(payable_minor) FROM procurements WHERE status::text IN ('vendor_invoice_required','accrued','matched','approved','payable')),0) AS open_vendor_liability_minor,
      COALESCE((SELECT sum(sl.final_minor) FROM settlement_lines sl JOIN settlement_batches sb ON sb.id=sl.batch_id WHERE sb.status IN ('draft','approval_required','approved')),0) AS scheduled_payout_minor,
      COALESCE((SELECT sum(sl.final_minor) FROM settlement_lines sl JOIN settlement_batches sb ON sb.id=sl.batch_id WHERE sb.status='paid'),0) AS paid_vendor_minor,
      COALESCE((SELECT sum(amount_minor) FROM refunds WHERE status='completed'),0) AS completed_refund_minor,
      COALESCE((SELECT sum(platform_expense_minor) FROM payment_clearing_entries WHERE event_kind='provider_fee'),0) AS payment_provider_expense_minor,
      COALESCE((SELECT sum(provider_payable_minor) FROM delivery_clearing_entries),0) AS carrier_payable_minor,
      COALESCE((SELECT sum(platform_subsidy_minor) FROM delivery_clearing_entries),0) AS delivery_subsidy_minor`),
    pool.query(`SELECT
      (SELECT count(*) FROM fulfilment_orders fo
        WHERE fo.status::text IN ('handed_over','delivered')
          AND EXISTS(SELECT 1 FROM payments p WHERE p.order_id=fo.order_id AND p.status::text IN ('captured','partially_refunded','refunded','chargeback') AND p.captured_minor>0)
          AND NOT EXISTS(SELECT 1 FROM procurements pr WHERE pr.fulfilment_order_id=fo.id)
      )::int AS missing_procurements,
      (SELECT count(*) FROM vendor_businesses v WHERE v.status='active' AND NOT EXISTS(
        SELECT 1 FROM vendor_commercial_agreements a
        WHERE a.vendor_id=v.id AND bls_private.vendor_agreement_effective_state(a.status::text,a.starts_at,a.ends_at,now())='effective'
      ))::int AS vendors_without_agreement,
      (SELECT count(*) FROM vendor_businesses v WHERE v.status='active' AND NOT EXISTS(
        SELECT 1 FROM vendor_payout_destinations d WHERE d.vendor_id=v.id AND d.status='verified' AND d.superseded_at IS NULL AND d.effective_at<=now()
      ))::int AS vendors_without_payout,
      (SELECT count(*) FROM delivery_clearing_entries WHERE reconciliation_status IN ('open','disputed'))::int AS open_delivery_clearing,
      (SELECT count(*) FROM payment_clearing_entries WHERE reconciliation_status IN ('open','disputed'))::int AS open_payment_clearing,
      (SELECT count(*) FROM vendor_finance_adjustments WHERE status='pending')::int AS pending_adjustments,
      (SELECT count(*) FROM vendor_finance_adjustments WHERE status='pending' AND requires_platform_credit_document=true)::int AS pending_credit_documents`),
    pool.query(`SELECT c.check_code,c.evidence
      FROM accounting_tax_policy_checks c
      JOIN accounting_tax_policies p ON p.id=c.policy_id
      WHERE p.status='approved' AND c.required=true AND c.status='approved'
      ORDER BY p.effective_from DESC,p.created_at DESC,c.check_code`)
  ]);

  const m = money.rows[0] ?? {};
  const c = controls.rows[0] ?? {};
  const weakEvidence = policyEvidence.rows.filter((row) => !evidenceIsSubstantive(row.evidence)).length;

  return {
    metrics: {
      capturedGmvMinor: int(m.captured_gmv_minor),
      customerDeliveryMinor: int(m.customer_delivery_minor),
      expectedPlatformFeeMinor: int(m.expected_platform_fee_minor),
      issuedPlatformFeeNetMinor: int(m.issued_platform_fee_net_minor),
      issuedPlatformFeeGrossMinor: int(m.issued_platform_fee_gross_minor),
      openVendorLiabilityMinor: int(m.open_vendor_liability_minor),
      scheduledPayoutMinor: int(m.scheduled_payout_minor),
      paidVendorMinor: int(m.paid_vendor_minor),
      completedRefundMinor: int(m.completed_refund_minor),
      paymentProviderExpenseMinor: int(m.payment_provider_expense_minor),
      carrierPayableMinor: int(m.carrier_payable_minor),
      deliverySubsidyMinor: int(m.delivery_subsidy_minor)
    },
    controls: {
      finalPaidFulfilmentsMissingProcurement: int(c.missing_procurements),
      vendorsWithoutEffectiveAgreement: int(c.vendors_without_agreement),
      vendorsWithoutVerifiedPayoutDestination: int(c.vendors_without_payout),
      weakRequiredAccountingEvidence: weakEvidence,
      openDeliveryClearing: int(c.open_delivery_clearing),
      openPaymentClearing: int(c.open_payment_clearing),
      pendingVendorAdjustments: int(c.pending_adjustments),
      pendingCommissionCreditDocuments: int(c.pending_credit_documents)
    }
  };
}
