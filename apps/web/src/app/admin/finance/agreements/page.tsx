import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminCommercialAgreementsClient } from "../../../../components/AdminCommercialAgreementsClient";
import { AdminFinanceTabs } from "../../../../components/AdminFinanceTabs";
import { AdminStatusStack, type AdminRecordStateTone } from "../../../../components/AdminRecordStatus";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { commercialAgreementWorkspace, type CommercialAgreementStatus } from "../../../../lib/admin-commercial-agreements";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendor Agreements", robots: { index: false, follow: false } };

const attentionStatuses = new Set<CommercialAgreementStatus>(["draft", "data_complete", "pdf_generated", "sent", "pending_signature", "signed_received", "govgr_verified", "eligible_for_activation", "suspended"]);
const terminalStatuses = new Set<CommercialAgreementStatus>(["expired", "terminated", "superseded", "rejected"]);
function stateTone(status: CommercialAgreementStatus): AdminRecordStateTone { return status === "active" ? "positive" : status === "suspended" || status === "rejected" ? "critical" : terminalStatuses.has(status) ? "neutral" : "caution"; }
function attentionLabel(status: CommercialAgreementStatus) { if (status === "suspended") return "Suspended partner"; if (status === "signed_received") return "Verify gov.gr"; if (["govgr_verified", "eligible_for_activation"].includes(status)) return "Activation ready"; return attentionStatuses.has(status) ? "Next lifecycle step" : undefined; }
function pct(bps: number) { return `${(bps / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })}%`; }
function date(value?: string) { return value ? new Date(value).toLocaleDateString("el-GR") : "—"; }

export default async function Page({ searchParams }: { searchParams: Promise<{ agreement?: string; q?: string; status?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let workspace;
  try { workspace = await commercialAgreementWorkspace(); } catch { redirect("/admin/finance"); }
  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const status = params.status?.trim();
  const statuses = [...new Set(workspace.agreements.map((agreement) => agreement.status))].sort();
  const visible = workspace.agreements.filter((agreement) => (!status || agreement.status === status) && (!query || [agreement.agreementCode, agreement.vendorName, agreement.vendorId, agreement.govgrReference].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query))));
  const selected = visible.find((agreement) => agreement.id === params.agreement) ?? visible[0];
  const active = workspace.agreements.filter((agreement) => agreement.status === "active").length;
  const attention = workspace.agreements.filter((agreement) => attentionStatuses.has(agreement.status)).length;
  const selectedHref = (agreementId: string) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.status) next.set("status", params.status);
    next.set("agreement", agreementId);
    return `/admin/finance/agreements?${next.toString()}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Commercial governance</div><h1>Vendor agreements & commissions</h1><p className="lead">Directory-first εικόνα της συμβατικής κατάστασης κάθε partner. Το PDF → gov.gr → verification → activation workflow παραμένει ακριβώς το ίδιο και ανοίγει μόνο όταν χρειάζεται ενέργεια.</p></div></section>
    <section className="shell admin-local-tabs-shell"><AdminFinanceTabs /></section>
    <WorkspaceMetricStrip items={[
      { label: "Vendors", value: workspace.vendors.length },
      { label: "Agreements", value: workspace.agreements.length },
      { label: "Active", value: active, tone: active ? "positive" : "default" },
      { label: "Needs lifecycle action", value: attention, tone: attention ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Commercial directory" title="Agreement records" note="Αναζήτηση και lifecycle state αριστερά· selected agreement context δεξιά. Τα governed controls παραμένουν κάτω από progressive disclosure." />
      <form method="get" className="admin-directory-filters">
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Agreement, partner, gov.gr reference" /></label>
        <label><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{statuses.map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{(query || status) && <Link className="text-link" href="/admin/finance/agreements">Clear filters</Link>}</div>
      </form>
      {visible.length === 0 ? <WorkspaceEmptyState title="Δεν βρέθηκαν agreements." body="Άλλαξε search/status ή άνοιξε τα governed controls για δημιουργία νέας συμφωνίας." /> : <div className="admin-split-workspace">
        <div className="admin-directory-table" role="table" aria-label="Commercial agreements">
          <div className="admin-directory-head" role="row"><span>Agreement</span><span>Partner</span><span>State / attention</span><span>Commission</span><span>Start</span><span aria-label="Open" /></div>
          {visible.map((agreement) => <Link className={`admin-directory-row${selected?.id === agreement.id ? " is-selected" : ""}`} href={selectedHref(agreement.id)} role="row" key={agreement.id}>
            <span className="admin-directory-identity"><strong>{agreement.agreementCode}</strong><small>v{agreement.agreementVersion} · {agreement.id}</small></span>
            <span><strong>{agreement.vendorName}</strong><small>{agreement.vendorId}</small></span>
            <span><AdminStatusStack state={agreement.status.replaceAll("_", " ")} stateTone={stateTone(agreement.status)} attention={attentionLabel(agreement.status)} attentionSeverity={agreement.status === "suspended" ? "critical" : "attention"} /></span>
            <span><strong>{pct(agreement.commissionRateBps)}</strong><small>{agreement.commissionTaxMode}</small></span>
            <span>{date(agreement.startsAt)}</span><span>→</span>
          </Link>)}
        </div>
        <aside className="admin-decision-panel">
          {selected ? <>
            <WorkspaceSectionHeading eyebrow="Selected agreement" title={selected.agreementCode} note={`${selected.vendorName} · v${selected.agreementVersion}`} action={<Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(selected.vendorId)}#partner-agreement`}>Open Partner record</Link>} />
            <AdminStatusStack state={selected.status.replaceAll("_", " ")} stateTone={stateTone(selected.status)} attention={attentionLabel(selected.status)} attentionSeverity={selected.status === "suspended" ? "critical" : "attention"} />
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Commission</strong><span>{pct(selected.commissionRateBps)}</span><small>{selected.commissionTaxMode} · VAT {pct(selected.commissionTaxRateBps)}</small></div>
              <div className="workspace-compact-row"><strong>Term</strong><span>{date(selected.startsAt)} → {date(selected.endsAt)}</span></div>
              <div className="workspace-compact-row"><strong>Unsigned PDF</strong><span>{selected.unsignedPdfAvailable ? "Available" : "Pending"}</span></div>
              <div className="workspace-compact-row"><strong>Signed gov.gr PDF</strong><span>{selected.signedPdfAvailable ? "Available" : "Pending"}</span></div>
              <div className="workspace-compact-row"><strong>gov.gr reference</strong><span>{selected.govgrReference ?? "—"}</span></div>
              <div className="workspace-compact-row"><strong>Verified</strong><span>{selected.govgrVerifiedAt ? new Date(selected.govgrVerifiedAt).toLocaleString("el-GR") : "—"}</span></div>
            </div>
            <WorkspaceRecordDetails label="Commercial metadata"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Partner ID</strong><span>{selected.vendorId}</span></div><div className="workspace-compact-row"><strong>Agreement ID</strong><code>{selected.id}</code></div><div className="workspace-compact-row"><strong>Updated</strong><span>{new Date(selected.updatedAt).toLocaleString("el-GR")}</span></div></div></WorkspaceRecordDetails>
          </> : null}
        </aside>
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <details className="workspace-record-details admin-commercial-controls">
        <summary>Governed agreement lifecycle & create new agreement</summary>
        <div className="workspace-inline-note">Εδώ παραμένουν τα υπάρχοντα immutable snapshot, PDF, email, signed gov.gr upload, verification, activation, suspension και termination controls. Δεν έχει προστεθεί κανένα νέο transition.</div>
        <AdminCommercialAgreementsClient initial={workspace} csrfToken={principal.csrfToken} />
      </details>
    </div></section>
  </main>;
}
