import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminFinanceTabs } from "../../../../components/AdminFinanceTabs";
import { AdminStatusStack, type AdminRecordStateTone } from "../../../../components/AdminRecordStatus";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { VendorBillingClient } from "../../../../components/VendorBillingClient";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { adminVendorBillingWorkspace } from "../../../../lib/admin-vendor-billing";
import { adminVendorFeeTaxSettings } from "../../../../lib/admin-vendor-fee-tax";

export const metadata: Metadata = { title: "Admin · Vendor invoicing", robots: { index: false, follow: false } };
const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
function invoiceTone(status: string, lastError?: string): AdminRecordStateTone { if (lastError) return "critical"; if (status === "issued") return "positive"; if (["prepared", "draft"].includes(status)) return "caution"; return "neutral"; }
function invoiceAttention(invoice: { status: string; emailStatus: string; lastError?: string }) { if (invoice.lastError) return "Fiscal error"; if (invoice.status === "prepared") return "Ready for AADE"; if (invoice.status === "issued" && invoice.emailStatus !== "sent") return "Vendor email pending"; return undefined; }

export default async function VendorBillingPage({ searchParams }: { searchParams: Promise<{ invoice?: string; q?: string; status?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const [data, feeTaxSettings] = await Promise.all([adminVendorBillingWorkspace(principal).catch(() => undefined), adminVendorFeeTaxSettings(principal).catch(() => [])]);
  if (!data) redirect("/admin");
  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const status = params.status?.trim();
  const statuses = [...new Set(data.invoices.map((invoice) => invoice.status))].sort();
  const invoices = data.invoices.filter((invoice) => (!status || invoice.status === status) && (!query || [invoice.id, invoice.documentNumber, invoice.vendorName, invoice.vendorId, invoice.mark, invoice.uid].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query))));
  const selected = invoices.find((invoice) => invoice.id === params.invoice) ?? invoices[0];
  const eligible = data.vendors.reduce((sum, vendor) => sum + vendor.eligibleCommissionMinor, 0);
  const issued = data.invoices.filter((invoice) => invoice.status === "issued").length;
  const ready = data.invoices.filter((invoice) => invoice.status === "prepared").length;
  const outstanding = data.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.grossMinor - invoice.offsetMinor), 0);
  const selectedHref = (invoiceId: string) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.status) next.set("status", params.status);
    next.set("invoice", invoiceId);
    return `/admin/finance/vendor-billing?${next.toString()}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Finance · platform services · commissions</div><h1>Vendor invoicing</h1><p className="lead">Invoice register first: partner, period, fiscal state, settlement offset and AADE evidence are visible before opening any action. Draft creation and transmission remain explicitly governed.</p></div></section>
    <section className="shell admin-local-tabs-shell"><AdminFinanceTabs /></section>
    <WorkspaceMetricStrip items={[
      { label: "Uninvoiced commission", value: euro(eligible), tone: eligible ? "attention" : "positive" },
      { label: "Prepared for AADE", value: ready, tone: ready ? "attention" : "default" },
      { label: "Issued / MARK", value: issued, tone: issued ? "positive" : "default" },
      { label: "Non-offset balance", value: euro(outstanding) },
      { label: "Accounting policy", value: data.policy ? `v${data.policy.version} · ${data.policy.status}` : "missing", tone: data.policy?.status === "approved" ? "positive" : "attention" },
      { label: "Vendor service mapping", value: data.policy?.mappingStatus ?? "missing", tone: data.policy?.mappingStatus === "approved" ? "positive" : "attention" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Outbound invoice register" title="Vendor invoices" note="Dense register + selected fiscal context. Technical tax IDs remain secondary; MARK/UID and document number stay visible where issued." />
      <div className="workspace-callout"><strong>Accounting boundary</strong><span>Draft ≠ fiscal issuance. Preparation/AADE transmission remains blocked until Accounting Policy, platform_vendor_service mapping, payment mapping and vendor fiscal identity satisfy the existing backend gates.</span></div>
      <form method="get" className="admin-directory-filters">
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Invoice, partner, MARK, UID" /></label>
        <label><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{statuses.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{(query || status) && <Link className="text-link" href="/admin/finance/vendor-billing">Clear filters</Link>}</div>
      </form>
      {invoices.length === 0 ? <WorkspaceEmptyState title="Δεν βρέθηκαν vendor invoices." body="Άλλαξε φίλτρα ή άνοιξε τα governed billing controls για δημιουργία draft από πραγματικά eligible sources." /> : <div className="admin-split-workspace">
        <div className="admin-directory-table" role="table" aria-label="Vendor invoices">
          <div className="admin-directory-head" role="row"><span>Invoice</span><span>Partner</span><span>State / attention</span><span>Total</span><span>Offset</span><span aria-label="Open" /></div>
          {invoices.map((invoice) => <Link className={`admin-directory-row${selected?.id === invoice.id ? " is-selected" : ""}`} href={selectedHref(invoice.id)} role="row" key={invoice.id}>
            <span className="admin-directory-identity"><strong>{invoice.documentNumber ?? "Draft invoice"}</strong><small>{invoice.periodStart} → {invoice.periodEnd} · {invoice.id}</small></span>
            <span><strong>{invoice.vendorName}</strong><small>{invoice.vendorId}</small></span>
            <span><AdminStatusStack state={invoice.status} stateTone={invoiceTone(invoice.status, invoice.lastError)} attention={invoiceAttention(invoice)} attentionSeverity={invoice.lastError ? "critical" : "attention"} /></span>
            <span><strong>{euro(invoice.grossMinor)}</strong><small>VAT {euro(invoice.taxMinor)}</small></span>
            <span><strong>{euro(invoice.offsetMinor)}</strong><small>{invoice.paymentStatus}</small></span><span>→</span>
          </Link>)}
        </div>
        <aside className="admin-decision-panel">
          {selected ? <>
            <WorkspaceSectionHeading eyebrow="Selected invoice" title={selected.documentNumber ?? "Billing draft"} note={`${selected.vendorName} · ${selected.periodStart} → ${selected.periodEnd}`} action={<Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(selected.vendorId)}`}>Open Partner record</Link>} />
            <AdminStatusStack state={selected.status} stateTone={invoiceTone(selected.status, selected.lastError)} attention={invoiceAttention(selected)} attentionSeverity={selected.lastError ? "critical" : "attention"} />
            {selected.lastError && <div className="workspace-inline-note"><strong>Fiscal error</strong> {selected.lastError}</div>}
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Net / VAT / gross</strong><span>{euro(selected.netMinor)} / {euro(selected.taxMinor)} / {euro(selected.grossMinor)}</span></div>
              <div className="workspace-compact-row"><strong>Settlement offset</strong><span>{euro(selected.offsetMinor)}</span><small>Remaining {euro(Math.max(0, selected.grossMinor - selected.offsetMinor))}</small></div>
              <div className="workspace-compact-row"><strong>AADE</strong><span>{selected.transmissionStatus ?? "not prepared"}</span><small>MARK {selected.mark ?? "—"} · UID {selected.uid ?? "—"}</small></div>
              <div className="workspace-compact-row"><strong>Email</strong><span>{selected.emailStatus}</span></div>
              <div className="workspace-compact-row"><strong>Billing lines</strong><span>{selected.items.length}</span></div>
            </div>
            <WorkspaceRecordDetails label={`Billing lines · ${selected.items.length}`}><div className="workspace-compact-list">{selected.items.map((item, index) => <div className="workspace-compact-row" key={`${selected.id}-${index}`}><strong>{item.kind}</strong><span>{item.description}</span><small>{euro(item.grossMinor)} · offset {euro(item.offsetMinor)}</small></div>)}</div></WorkspaceRecordDetails>
            <WorkspaceRecordDetails label="Internal fiscal metadata"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Invoice ID</strong><code>{selected.id}</code></div><div className="workspace-compact-row"><strong>Tax document ID</strong><code>{selected.taxDocumentId ?? "—"}</code></div><div className="workspace-compact-row"><strong>Created</strong><span>{new Date(selected.createdAt).toLocaleString("el-GR")}</span></div></div></WorkspaceRecordDetails>
          </> : null}
        </aside>
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <details className="workspace-record-details admin-commercial-controls">
        <summary>Governed billing actions & create billing draft</summary>
        <div className="workspace-inline-note">Τα υπάρχοντα draft, fee VAT, payment mapping, prepare, AADE transmit, PDF και email controls παραμένουν ακριβώς εδώ. Δεν προστέθηκε automatic transmit ή resend.</div>
        <VendorBillingClient initial={data} initialFeeTaxSettings={feeTaxSettings} csrfToken={principal.csrfToken} />
      </details>
    </div></section>
  </main>;
}
