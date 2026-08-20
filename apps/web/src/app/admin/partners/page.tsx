import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { commercialAgreementWorkspace } from "../../../lib/admin-commercial-agreements";
import { adminVendorBillingWorkspace } from "../../../lib/admin-vendor-billing";
import { adminVendorsWorkspace, hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { adminSlaPolicyWorkspace } from "../../../lib/order-sla";
import { verifiedProspectsWorkspace } from "../../../lib/prospect-vendors-runtime";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";
import { adminVendorShopsWorkspace } from "../../../lib/vendor-admin-controls";

export const metadata: Metadata = { title: "Admin · Partners", robots: { index: false, follow: false } };

const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const canReadFinance = hasAdminPermission(principal, "finance.read");
  const [research, applications, prospects, managed, commercial, sla, billing] = await Promise.all([
    researchVendorsWorkspace(principal),
    adminVendorsWorkspace(principal),
    verifiedProspectsWorkspace(principal),
    adminVendorShopsWorkspace(principal),
    canReadFinance ? commercialAgreementWorkspace().catch(() => undefined) : Promise.resolve(undefined),
    canReadFinance ? adminSlaPolicyWorkspace().catch(() => undefined) : Promise.resolve(undefined),
    canReadFinance ? adminVendorBillingWorkspace(principal).catch(() => undefined) : Promise.resolve(undefined)
  ]);

  const pendingApplications = applications.applications.filter((item) => !item.vendorId).length;
  const active = managed.shops.filter((shop) => shop.operationalActive).length;
  const visible = managed.shops.filter((shop) => shop.operationalActive && shop.publicDirectoryVisible).length;
  const missingAgreement = managed.shops.filter((shop) => !shop.cooperationDocumented).length;

  const activeAgreements = commercial?.agreements.filter((agreement) => agreement.status === "active") ?? [];
  const activeAgreementByVendor = new Map(activeAgreements.map((agreement) => [agreement.vendorId, agreement]));
  const activeSlaByVendor = new Map((sla?.agreements ?? []).filter((item) => item.agreementStatus === "active").map((item) => [item.vendorId, item]));
  const billingByVendor = new Map((billing?.vendors ?? []).map((vendor) => [vendor.id, vendor]));
  const latestInvoiceByVendor = new Map<string, NonNullable<typeof billing>["invoices"][number]>();
  for (const invoice of billing?.invoices ?? []) if (!latestInvoiceByVendor.has(invoice.vendorId)) latestInvoiceByVendor.set(invoice.vendorId, invoice);

  const activeAgreementGaps = managed.shops.filter((shop) => shop.operationalActive && !activeAgreementByVendor.has(shop.id)).length;
  const configuredSla = [...activeSlaByVendor.values()].filter((item) => item.configured).length;
  const activeWithoutSla = activeAgreements.filter((agreement) => !activeSlaByVendor.get(agreement.vendorId)?.configured).length;
  const uninvoicedCommission = billing?.vendors.reduce((sum, vendor) => sum + vendor.eligibleCommissionMinor, 0) ?? 0;
  const billingErrors = billing?.invoices.filter((invoice) => Boolean(invoice.lastError)).length ?? 0;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={applications.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Partners</div><h1>Συνεργάτες</h1><p className="lead">Acquisition, onboarding, ενεργά καταστήματα και εμπορική ετοιμότητα ως ένα ενιαίο partner lifecycle.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Research leads", value: research.summary.total },
      { label: "Pending applications", value: pendingApplications, tone: pendingApplications ? "attention" : "default" },
      { label: "Active partners", value: active, tone: active ? "positive" : "default", hint: `${visible} publicly visible` },
      { label: "Agreement gaps", value: missingAgreement, tone: missingAgreement ? "attention" : "positive", hint: `${prospects.summary.total} in onboarding` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Partner lifecycle" title="Ένα domain αντί για διάσπαρτες vendor οθόνες" note="Οι υπάρχουσες governed ενέργειες παραμένουν εκεί που είναι σήμερα· αυτή η επιφάνεια οργανώνει το lifecycle και δίνει ένα σταθερό σημείο εισόδου." />
      <div className="admin-domain-card-grid">
        <Link className="admin-domain-card" href="/admin/vendors"><span>Directory</span><strong>Κατάλογος συνεργατών</strong><p>Operational status, public visibility, locations και partner-level controls.</p><b>{managed.shops.length}</b><i>Άνοιγμα →</i></Link>
        <Link className={`admin-domain-card${pendingApplications || prospects.summary.total ? " needs-attention" : ""}`} href="/admin/partners/pipeline"><span>Pipeline</span><strong>Acquisition & onboarding</strong><p>Lead → application → verification → contract → catalog → test → active.</p><b>{pendingApplications + prospects.summary.total}</b><i>Pipeline →</i></Link>
        {canReadFinance && <Link className={`admin-domain-card${activeAgreementGaps ? " needs-attention" : ""}`} href="#commercial-readiness"><span>Commercial</span><strong>Commercial readiness</strong><p>Agreement, SLA και billing exposure ανά ενεργό συνεργάτη σε μία operational εικόνα.</p><b>{activeAgreementGaps + activeWithoutSla + billingErrors}</b><i>Readiness ↓</i></Link>}
        {canReadFinance && <Link className="admin-domain-card" href="/admin/finance/vendor-billing"><span>Billing</span><strong>Vendor invoicing</strong><p>Commissions, listing/recurring fees και governed AADE invoicing.</p><b>{euro(uninvoicedCommission)}</b><i>Billing →</i></Link>}
      </div>
    </section>

    {canReadFinance && commercial && sla && billing && <section id="commercial-readiness" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Commercial readiness" title="Agreement → SLA → billing" note="Read-only management view. Contract, SLA and invoice changes continue through their governed source workspaces so audit and fiscal controls stay intact." />
      <WorkspaceMetricStrip items={[
        { label: "Active agreements", value: activeAgreements.length, tone: activeAgreementGaps ? "attention" : "positive", hint: `${activeAgreementGaps} active partner gaps` },
        { label: "Configured SLA", value: configuredSla, tone: activeWithoutSla ? "attention" : "positive", hint: `${activeWithoutSla} active agreements using fallback` },
        { label: "Uninvoiced commission", value: euro(uninvoicedCommission), tone: uninvoicedCommission ? "attention" : "positive" },
        { label: "Billing errors", value: billingErrors, tone: billingErrors ? "attention" : "positive" }
      ]} />
      <div className="workspace-action-bar"><span>Use this table to identify commercial blockers before partner activation or recurring operations.</span><div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/finance/agreements">Agreements</Link><Link className="button button-secondary" href="/admin/finance/agreements/sla">SLA policies</Link><Link className="button" href="/admin/finance/vendor-billing">Vendor billing</Link></div></div>
      <div className="admin-insight-table" role="table" aria-label="Partner commercial readiness">
        <div className="admin-insight-head" role="row"><span>Partner</span><span>Agreement</span><span>SLA</span><span>Billing</span></div>
        {managed.shops.map((shop) => {
          const agreement = activeAgreementByVendor.get(shop.id);
          const slaPolicy = activeSlaByVendor.get(shop.id);
          const vendorBilling = billingByVendor.get(shop.id);
          const invoice = latestInvoiceByVendor.get(shop.id);
          const needsAttention = shop.operationalActive && (!agreement || !slaPolicy?.configured || Boolean(invoice?.lastError));
          return <div className={`admin-insight-row${needsAttention ? " needs-attention" : ""}`} role="row" key={shop.id}>
            <span><Link href={`/admin/partners/${encodeURIComponent(shop.id)}`}><strong>{shop.tradingName}</strong></Link><small>{shop.operationalActive ? "active" : shop.status} · {shop.publicDirectoryVisible ? "public" : "hidden"}</small></span>
            <span><strong>{agreement ? `${agreement.agreementCode} · v${agreement.agreementVersion}` : "Missing"}</strong><small>{agreement ? `${(agreement.commissionRateBps / 100).toFixed(2)}% commission` : "No active commercial agreement"}</small></span>
            <span><strong>{slaPolicy?.configured ? `${slaPolicy.acceptanceMinutes}m / ${slaPolicy.preparationMinutes}m` : agreement ? "Fallback" : "—"}</strong><small>{slaPolicy?.configured ? `warning ${slaPolicy.warningPercent}%` : agreement ? "Platform defaults in effect" : "Agreement required"}</small></span>
            <span><strong>{vendorBilling?.eligibleCommissionMinor ? euro(vendorBilling.eligibleCommissionMinor) : invoice?.documentNumber ?? "—"}</strong><small>{invoice?.lastError ? `Error · ${invoice.lastError}` : invoice ? `${invoice.status} · ${invoice.paymentStatus}` : "No invoice yet"}</small></span>
          </div>;
        })}
      </div>
    </div></section>}
  </main>;
}
