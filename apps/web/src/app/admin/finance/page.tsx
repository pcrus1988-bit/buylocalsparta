import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminFinanceTabs } from "../../../components/AdminFinanceTabs";
import { AdminPayoutDestinationsPanel } from "../../../components/AdminPayoutDestinationsPanel";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminFinanceWorkspace } from "../../../lib/admin-runtime";
import { adminFinanceOverview } from "../../../lib/admin-finance-overview";
import { adminPayoutDestinationsWorkspace } from "../../../lib/admin-payout-destinations";
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
  const payoutWorkspace = overview ? await adminPayoutDestinationsWorkspace(principal).catch(() => undefined) : undefined;
  const orderReferences = await marketplaceReferenceMap("order", data.procurements.map((item) => item.orderId));

  const matched = data.procurements.filter((item) => item.status === "matched").length;
  const payable = data.procurements.filter((item) => item.status === "payable").length;
  const approvalRequired = data.settlements.filter((item) => item.status === "approval_required").length;
  const approved = data.settlements.filter((item) => item.status === "approved").length;
  const blockerCount = overview ? Object.values(overview.controls).reduce((sum, value) => sum + value, 0) : 0;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">KONTA MOY · Finance control</div><h1>Finance</h1><p className="lead">Από το customer GMV μέχρι το πραγματικό έσοδο KONTA MOY, τις υποχρεώσεις προς καταστήματα, delivery/PSP clearing και το τελικό payout. Κάθε ροή παραμένει ξεχωριστή και ελέγξιμη.</p></div>
    </section>
    <section className="shell admin-local-tabs-shell"><AdminFinanceTabs /></section>

    {overview && <>
      <WorkspaceMetricStrip items={[
        { label: "Captured GMV προϊόντων", value: euro(overview.metrics.capturedGmvMinor), hint: "Δεν είναι KONTA MOY revenue" },
        { label: "Αναμενόμενες χρεώσεις KONTA MOY", value: euro(overview.metrics.expectedPlatformFeeMinor), hint: "Commission snapshots από fulfilled sales" },
        { label: "Εκδοθέν fee revenue · net", value: euro(overview.metrics.issuedPlatformFeeNetMinor), tone: overview.metrics.issuedPlatformFeeNetMinor ? "positive" : "default", hint: `Gross ${euro(overview.metrics.issuedPlatformFeeGrossMinor)}` },
        { label: "Ανοιχτή υποχρέωση προς vendors", value: euro(overview.metrics.openVendorLiabilityMinor), tone: overview.metrics.openVendorLiabilityMinor ? "attention" : "default" }
      ]} />

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Revenue bridge" title="Πού βρίσκεται κάθε ευρώ" note="Το merchandise GMV, τα μεταφορικά πελάτη και το vendor payable δεν παρουσιάζονται ως revenue του KONTA MOY. Τα έσοδα της πλατφόρμας παρακολουθούνται από τα δικά της fee invoices." />
        <div className="workspace-queue-list">
          <article className="workspace-queue-card">
            <div className="workspace-queue-head"><div><strong>Customer money</strong><small>Ποσά που χρηματοδοτούν διαφορετικές υποχρεώσεις και έσοδα.</small></div></div>
            <div className="workspace-queue-primary"><span>Προϊόντα {euro(overview.metrics.capturedGmvMinor)}</span><span>Μεταφορικά πελάτη {euro(overview.metrics.customerDeliveryMinor)}</span><span>Refunds {euro(overview.metrics.completedRefundMinor)}</span></div>
          </article>
          <article className="workspace-queue-card">
            <div className="workspace-queue-head"><div><strong>Vendor settlement</strong><small>Supplier liability και πραγματικές πληρωμές.</small></div></div>
            <div className="workspace-queue-primary"><span>Ανοιχτή υποχρέωση {euro(overview.metrics.openVendorLiabilityMinor)}</span><span>Προγραμματισμένα payouts {euro(overview.metrics.scheduledPayoutMinor)}</span><span>Πληρωμένα vendors {euro(overview.metrics.paidVendorMinor)}</span></div>
          </article>
          <article className="workspace-queue-card">
            <div className="workspace-queue-head"><div><strong>Delivery & payment clearing</strong><small>Λειτουργικά κόστη και pass-through ποσά εκτός vendor merchandise.</small></div></div>
            <div className="workspace-queue-primary"><span>Carrier payable {euro(overview.metrics.carrierPayableMinor)}</span><span>Delivery subsidy {euro(overview.metrics.deliverySubsidyMinor)}</span><span>PSP expense {euro(overview.metrics.paymentProviderExpenseMinor)}</span></div>
          </article>
        </div>
      </section>

      <section className="vendor-section section-tint"><div className="shell">
        <WorkspaceSectionHeading eyebrow="Launch controls" title={`Finance blockers · ${blockerCount}`} note="Αυτά είναι operational control findings, όχι απλά dashboard warnings. Missing procurement, agreement, fiscal billing ή payout destination πρέπει να είναι μηδέν πριν χρησιμοποιηθεί η πραγματική settlement ροή." />
        <div className="workspace-queue-list">
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Paid/final fulfilments χωρίς vendor accrual</strong><small>Πρέπει να είναι πάντα 0 μετά το event-driven accrual.</small></div><span className="status-pill">{overview.controls.finalPaidFulfilmentsMissingProcurement}</span></div></article>
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Active vendors χωρίς συμφωνία σε ισχύ</strong><small>Checkout commission terms δεν πρέπει να προκύπτουν από expired ή future agreement.</small></div><span className="status-pill">{overview.controls.vendorsWithoutEffectiveAgreement}</span></div></article>
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Active vendors χωρίς verified payout destination</strong><small>Settlement creation μπλοκάρεται μέχρι να υπάρχει ασφαλής επαληθευμένος προορισμός.</small></div><span className="status-pill">{overview.controls.vendorsWithoutVerifiedPayoutDestination}</span></div></article>
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Payables χωρίς issued commission invoice</strong><small>Το draft δημιουργείται με την payable approval. Πριν το settlement πρέπει να ολοκληρωθεί Prepare → AADE/myDATA → issued στο Vendor Billing.</small></div><span className="status-pill">{overview.controls.payableWithoutIssuedCommissionInvoice}</span></div></article>
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Required accounting checks με ανεπαρκές evidence</strong><small>Ένα “ok” δεν θεωρείται audit evidence. Χρειάζεται ουσιαστική τεκμηρίωση της απόφασης.</small></div><span className="status-pill">{overview.controls.weakRequiredAccountingEvidence}</span></div></article>
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Open reconciliation</strong><small>Delivery {overview.controls.openDeliveryClearing} · Payments {overview.controls.openPaymentClearing}</small></div><span className="status-pill">{overview.controls.openDeliveryClearing + overview.controls.openPaymentClearing}</span></div></article>
          <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Finance adjustments</strong><small>Pending {overview.controls.pendingVendorAdjustments} · Commission reversals awaiting fiscal credit {overview.controls.pendingCommissionCreditDocuments}</small></div><span className="status-pill">{overview.controls.pendingVendorAdjustments}</span></div></article>
        </div>
      </div></section>
    </>}

    <WorkspaceMetricStrip items={[
      { label: "Procurements", value: data.procurements.length },
      { label: "Matched", value: matched, tone: matched ? "attention" : "default", hint: "awaiting payable approval" },
      { label: "Payable", value: payable, tone: payable ? "attention" : "default" },
      { label: "Checker / payout", value: approvalRequired + approved, tone: approvalRequired + approved ? "attention" : "default", hint: `${approvalRequired} approval · ${approved} payout` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Supplier accounting" title="Procurements" note="Το procurement είναι η οφειλή για merchandise προς τον vendor. Η χρέωση KONTA MOY τιμολογείται ξεχωριστά και συμψηφίζεται μόνο μετά από issued platform invoice." />
      {data.procurements.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν supplier procurements." body="Paid + final fulfilments θα δημιουργούν αυτόματα accruals. Αν το launch-control counter δείχνει missing procurements, απαιτείται έλεγχος πριν από settlement." /> : <div className="workspace-queue-list">{data.procurements.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.id}</strong><small>Order {orderReferences.get(item.orderId) ?? item.orderId} · Vendor {item.vendorId}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>Gross {item.grossLabel}</span><span>Supplier payable {item.payableLabel}</span><span>Vendor invoice {item.invoiceNumber ?? "—"}</span></div>
        <WorkspaceRecordDetails label="Accounting references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Procurement</strong><span>{item.id}</span></div><div className="workspace-compact-row"><strong>Order</strong><span>{orderReferences.get(item.orderId) ?? item.orderId}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{item.status}</strong></span><div className="workspace-action-buttons">{item.status === "matched" && <AdminActionButton label="Approve payable + draft KONTA MOY fee" endpoint="/api/admin/finance/procurement" csrfToken={data.csrfToken} body={{ procurementId: item.id }} />}</div></div>
      </article>)}</div>}
    </section>

    {payoutWorkspace && <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Payout master data" title="Vendor payout destinations" note="Maker/checker, tokenized references και immutable verified στοιχεία. Το settlement παγώνει snapshot του verified destination που ίσχυε κατά τη δημιουργία του." />
      <AdminPayoutDestinationsPanel initial={payoutWorkspace} csrfToken={data.csrfToken} />
    </div></section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Settlement" title="Settlement batches" note="Η δημιουργία settlement απαιτεί issued commission invoice και verified payout destination. Ο maker δεν μπορεί να εγκρίνει το ίδιο payout." action={payable > 0 ? <AdminActionButton label={`Create batch · ${payable}`} endpoint="/api/admin/finance/settlement" csrfToken={data.csrfToken} body={{ kind: "create", procurementIds: data.procurements.filter((item) => item.status === "payable").map((item) => item.id) }} /> : undefined} />
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
  </main>;
}
