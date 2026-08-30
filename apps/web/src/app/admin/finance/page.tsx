import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminPayoutDestinationsPanel } from "../../../components/AdminPayoutDestinationsPanel";
import { AdminFinanceAdjustmentsPanel } from "../../../components/AdminFinanceAdjustmentsPanel";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminFinanceWorkspace } from "../../../lib/admin-runtime";
import { adminFinanceOverview } from "../../../lib/admin-finance-overview";
import { adminPayoutDestinationsWorkspace } from "../../../lib/admin-payout-destinations";
import { adminFinanceAdjustmentWorkspace } from "../../../lib/admin-finance-adjustments";
import { getAdminSession } from "../../../lib/admin-session";
import { marketplaceReferenceMap } from "../../../lib/public-reference-service";

export const metadata: Metadata = { title: "Admin · Finance", robots: { index: false, follow: false } };

function euro(value: number) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value / 100);
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  let overview;
  try {
    [data, overview] = await Promise.all([adminFinanceWorkspace(principal), adminFinanceOverview(principal)]);
  } catch {
    redirect("/admin");
  }
  const [payoutWorkspace, adjustmentWorkspace] = overview
    ? await Promise.all([
        adminPayoutDestinationsWorkspace(principal).catch(() => undefined),
        adminFinanceAdjustmentWorkspace(principal).catch(() => undefined)
      ])
    : [undefined, undefined];
  const orderReferences = await marketplaceReferenceMap("order", data.procurements.map((item) => item.orderId));

  const matched = data.procurements.filter((item) => item.status === "matched").length;
  const payable = data.procurements.filter((item) => item.status === "payable").length;
  const approvalRequired = data.settlements.filter((item) => item.status === "approval_required").length;
  const approved = data.settlements.filter((item) => item.status === "approved").length;
  const settlementAttention = matched + payable + approvalRequired + approved;
  const blockerCount = overview ? Object.values(overview.controls).reduce((sum, value) => sum + value, 0) : 0;
  const reconciliationCount = overview ? overview.controls.openDeliveryClearing + overview.controls.openPaymentClearing : 0;
  const taxAttention = overview ? overview.controls.weakRequiredAccountingEvidence + overview.controls.pendingCommissionCreditDocuments : 0;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Finance operations</div><h1>Payables & settlements</h1><p className="lead">Η καθημερινή οικονομική ροή ξεκινά από supplier payables και καταλήγει σε ελεγχόμενο vendor payout. Vendor Billing, Tax/myDATA και Partner Agreements παραμένουν ξεχωριστά workspaces και ανοίγουν μόνο όταν το finance flow τα χρειάζεται.</p></div>
    </section>

    {overview && <>
      <WorkspaceMetricStrip items={[
        { label: "Captured product GMV", value: euro(overview.metrics.capturedGmvMinor), hint: "Δεν είναι KONTA MOY revenue" },
        { label: "Expected platform fees", value: euro(overview.metrics.expectedPlatformFeeMinor), hint: "Commission snapshots from fulfilled sales" },
        { label: "Issued fee revenue · net", value: euro(overview.metrics.issuedPlatformFeeNetMinor), tone: overview.metrics.issuedPlatformFeeNetMinor ? "positive" : "default", hint: `Gross ${euro(overview.metrics.issuedPlatformFeeGrossMinor)}` },
        { label: "Open vendor liability", value: euro(overview.metrics.openVendorLiabilityMinor), tone: overview.metrics.openVendorLiabilityMinor ? "attention" : "default" }
      ]} />

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Finance attention" title={blockerCount ? `${blockerCount} control findings require attention` : "Finance controls are clear"} note="Κάθε κάρτα δείχνει τον πραγματικό owner της επόμενης ενέργειας. Agreements και SLA ανήκουν στο Partner workflow· fiscal issuance στο Vendor Billing / Tax workflow." />
        {blockerCount === 0 && settlementAttention === 0 ? <div className="admin-finance-attention-zero"><strong>Δεν υπάρχει ανοικτή οικονομική εργασία.</strong><span>Payables, settlements και finance control findings είναι καθαρά αυτή τη στιγμή.</span></div> : null}
        <div className="admin-finance-workflow-grid">
          <Link className="admin-finance-workflow-card" href="#payables"><div><strong>Payables & settlements</strong><span>Procurement approval, checker approval και payout recording.</span></div><small><span>Open workflow items</span><b>{settlementAttention}</b></small></Link>
          <Link className="admin-finance-workflow-card" href="/admin/finance/vendor-billing"><div><strong>Vendor Billing</strong><span>Platform commission invoices, AADE preparation, issuance and vendor delivery.</span></div><small><span>Payables missing issued fee invoice</span><b>{overview.controls.payableWithoutIssuedCommissionInvoice}</b></small></Link>
          <Link className="admin-finance-workflow-card" href="/admin/tax"><div><strong>Tax & myDATA</strong><span>Accounting policy, fiscal mappings, VAT and AADE reconciliation.</span></div><small><span>Tax / fiscal attention</span><b>{taxAttention}</b></small></Link>
          <Link className="admin-finance-workflow-card" href="/admin/finance/agreements"><div><strong>Partner agreements</strong><span>Commercial terms are partner governance, not settlement execution.</span></div><small><span>Active vendors missing agreement</span><b>{overview.controls.vendorsWithoutEffectiveAgreement}</b></small></Link>
          <a className="admin-finance-workflow-card" href="#payout-destinations"><div><strong>Payout setup</strong><span>Verified payout destination required before settlement creation.</span></div><small><span>Vendors missing verified destination</span><b>{overview.controls.vendorsWithoutVerifiedPayoutDestination}</b></small></a>
          <a className="admin-finance-workflow-card" href="#finance-diagnostics"><div><strong>Reconciliation & exceptions</strong><span>Delivery/payment clearing, adjustments and fiscal reversal dependencies.</span></div><small><span>Open reconciliation</span><b>{reconciliationCount}</b></small></a>
        </div>
      </section>
    </>}

    <WorkspaceMetricStrip items={[
      { label: "Procurements", value: data.procurements.length },
      { label: "Matched", value: matched, tone: matched ? "attention" : "default", hint: "awaiting payable approval" },
      { label: "Payable", value: payable, tone: payable ? "attention" : "default" },
      { label: "Checker / payout", value: approvalRequired + approved, tone: approvalRequired + approved ? "attention" : "default", hint: `${approvalRequired} approval · ${approved} payout` }
    ]} />

    <section id="payables" className="shell vendor-section admin-finance-workflow-anchor">
      <WorkspaceSectionHeading eyebrow="Supplier accounting" title="Payables" note="Το procurement είναι η οφειλή merchandise προς τον vendor. Η χρέωση KONTA MOY τιμολογείται ξεχωριστά και συμψηφίζεται μόνο μετά από issued platform invoice." />
      {data.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν supplier procurements." body="Paid + final fulfilments δημιουργούν αυτόματα accruals. Αν το finance attention δείξει missing procurement, απαιτείται έλεγχος πριν από settlement." /> : <div className="workspace-queue-list">{data.procurements.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.id}</strong><small>Order {orderReferences.get(item.orderId) ?? item.orderId} · Vendor {item.vendorId}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>Gross {item.grossLabel}</span><span>Supplier payable {item.payableLabel}</span><span>Vendor invoice {item.invoiceNumber ?? "—"}</span></div>
        <WorkspaceRecordDetails label="Accounting references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Procurement</strong><span>{item.id}</span></div><div className="workspace-compact-row"><strong>Order</strong><span>{orderReferences.get(item.orderId) ?? item.orderId}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{item.status}</strong></span><div className="workspace-action-buttons">{item.status === "matched" && <AdminActionButton label="Approve payable + draft KONTA MOY fee" endpoint="/api/admin/finance/procurement" csrfToken={data.csrfToken} body={{ procurementId: item.id }} />}</div></div>
      </article>)}</div>}
    </section>

    <section id="settlements" className="shell vendor-section admin-finance-workflow-anchor">
      <WorkspaceSectionHeading eyebrow="Settlement workflow" title="Settlement batches" note="Maker / checker separation παραμένει υποχρεωτική: settlement creation απαιτεί issued commission invoice και verified payout destination, και ο maker δεν μπορεί να εγκρίνει το ίδιο payout." action={payable > 0 ? <AdminActionButton label={`Create batch · ${payable}`} endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "create", procurementIds: data.procurements.filter((item) => item.status === "payable").map((item) => item.id) }} /> : undefined} />
      {data.settlements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν settlement batches." body={payable ? "Υπάρχουν payable procurements. Το settlement θα δημιουργηθεί μόνο αν έχουν ολοκληρωθεί fiscal billing, payout destination και finance prerequisites." : "Όταν εγκριθούν payables, μπορεί να δημιουργηθεί settlement batch."} /> : <div className="workspace-queue-list">{data.settlements.map((batch) => <article className="workspace-queue-card" key={batch.id}>
        <div className="workspace-queue-head"><div><strong>{batch.batchNumber}</strong><small>{batch.lines.length} lines · Maker {batch.createdBy}</small></div><span className="status-pill">{batch.status}</span></div>
        <div className="workspace-queue-primary"><span>Final payout {batch.totalPayableLabel}</span><span>{batch.lines.length} procurements</span></div>
        <WorkspaceRecordDetails label="Batch details"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Batch ID</strong><span>{batch.id}</span></div><div className="workspace-compact-row"><strong>Maker</strong><span>{batch.createdBy}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Settlement state: <strong>{batch.status}</strong></span><div className="workspace-action-buttons">
          {batch.status === "draft" && <AdminActionButton label="Submit for approval" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "submit", batchId: batch.id }} />}
          {batch.status === "approval_required" && <AdminActionButton label="Checker approve" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "approve", batchId: batch.id }} />}
          {batch.status === "approved" && <AdminActionButton label="Record payout" endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "pay", batchId: batch.id }} extraPrompt={{ field: "payoutReference", message: "External bank / PSP payout reference" }} />}
        </div></div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Secondary controls" title="Master data, exceptions & accounting context" note="Αυτές οι λειτουργίες παραμένουν διαθέσιμες, αλλά δεν χρειάζεται να είναι μόνιμα ανοιχτές στην καθημερινή settlement ροή." />
      <div className="admin-finance-secondary-stack">
        {payoutWorkspace && <details id="payout-destinations" className="admin-finance-disclosure admin-finance-workflow-anchor"><summary>Payout master data · vendor payout destinations</summary><div className="admin-finance-disclosure-body"><div className="workspace-inline-note">Maker / checker: ο maker καταχωρίζει pending destination και διαφορετικός checker το επαληθεύει. Verified οικονομικά στοιχεία παραμένουν immutable και το settlement παγώνει snapshot του destination.</div><AdminPayoutDestinationsPanel initial={payoutWorkspace} csrfToken={data.csrfToken} /></div></details>}
        {adjustmentWorkspace && <details id="finance-adjustments" className="admin-finance-disclosure admin-finance-workflow-anchor"><summary>Exceptions & reversals · finance adjustments</summary><div className="admin-finance-disclosure-body"><div className="workspace-inline-note">Επιστροφές, chargebacks και corrections δεν τροποποιούν σιωπηρά payout. Κάθε debit/credit διατηρεί evidence, approval trail και settlement allocation.</div><AdminFinanceAdjustmentsPanel initial={adjustmentWorkspace} csrfToken={data.csrfToken} /></div></details>}
        {overview && <details id="finance-diagnostics" className="admin-finance-disclosure admin-finance-workflow-anchor"><summary>Finance diagnostics & money bridge · {blockerCount} findings</summary><div className="admin-finance-disclosure-body">
          <WorkspaceSectionHeading eyebrow="Money bridge" title="Where each euro sits" note="Merchandise GMV, customer delivery charges and vendor payable are not KONTA MOY revenue. Platform revenue is evidenced by issued fee invoices." />
          <div className="workspace-queue-list">
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Customer money</strong><small>Amounts funding different liabilities and revenue streams.</small></div></div><div className="workspace-queue-primary"><span>Products {euro(overview.metrics.capturedGmvMinor)}</span><span>Customer delivery {euro(overview.metrics.customerDeliveryMinor)}</span><span>Refunds {euro(overview.metrics.completedRefundMinor)}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Vendor settlement</strong><small>Supplier liability and actual vendor payments.</small></div></div><div className="workspace-queue-primary"><span>Open liability {euro(overview.metrics.openVendorLiabilityMinor)}</span><span>Scheduled payouts {euro(overview.metrics.scheduledPayoutMinor)}</span><span>Paid vendors {euro(overview.metrics.paidVendorMinor)}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Delivery & payment clearing</strong><small>Operating costs and pass-through amounts outside vendor merchandise.</small></div></div><div className="workspace-queue-primary"><span>Carrier payable {euro(overview.metrics.carrierPayableMinor)}</span><span>Delivery subsidy {euro(overview.metrics.deliverySubsidyMinor)}</span><span>PSP expense {euro(overview.metrics.paymentProviderExpenseMinor)}</span></div></article>
          </div>
          <WorkspaceSectionHeading eyebrow="Control evidence" title="Finance control findings" note="Operational findings stay visible for audit and investigation, but each belongs to its owning workflow rather than becoming another Finance execution surface." />
          <div className="workspace-queue-list">
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Paid/final fulfilments without vendor accrual</strong><small>Should remain 0 after event-driven accrual.</small></div><span className="status-pill">{overview.controls.finalPaidFulfilmentsMissingProcurement}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Active vendors without effective agreement</strong><small>Owned by Partner Agreements.</small></div><span className="status-pill">{overview.controls.vendorsWithoutEffectiveAgreement}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Active vendors without verified payout destination</strong><small>Settlement prerequisite.</small></div><span className="status-pill">{overview.controls.vendorsWithoutVerifiedPayoutDestination}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Payables without issued commission invoice</strong><small>Owned by Vendor Billing → AADE/myDATA issuance.</small></div><span className="status-pill">{overview.controls.payableWithoutIssuedCommissionInvoice}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Required accounting checks with weak evidence</strong><small>Owned by Tax & myDATA accounting policy.</small></div><span className="status-pill">{overview.controls.weakRequiredAccountingEvidence}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Open clearing reconciliation</strong><small>Delivery {overview.controls.openDeliveryClearing} · Payments {overview.controls.openPaymentClearing}</small></div><span className="status-pill">{reconciliationCount}</span></div></article>
            <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Finance adjustments</strong><small>Pending {overview.controls.pendingVendorAdjustments} · Commission reversals awaiting fiscal credit {overview.controls.pendingCommissionCreditDocuments}</small></div><span className="status-pill">{overview.controls.pendingVendorAdjustments}</span></div></article>
          </div>
        </div></details>}
      </div>
    </section>
  </main>;
}
