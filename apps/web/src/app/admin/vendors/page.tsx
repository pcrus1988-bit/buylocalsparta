import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { adminVendorShopsWorkspace } from "../../../lib/vendor-admin-controls";

export const metadata: Metadata = { title: "Admin · Partners Directory", robots: { index: false, follow: false } };
const stateLabel = (state: string) => ({ active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed", invited: "Invited" }[state] ?? state.replaceAll("_", " "));

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let managed;
  try { managed = await adminVendorShopsWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const status = params.status?.trim();
  const statuses = [...new Set(managed.shops.map((shop) => shop.status))].sort();
  const shops = managed.shops.filter((shop) => (!status || shop.status === status) && (!query || [shop.id, shop.tradingName, shop.legalName, shop.applicationId, shop.agreement?.code].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query))));
  const active = managed.shops.filter((shop) => shop.operationalActive).length;
  const visible = managed.shops.filter((shop) => shop.operationalActive && shop.publicDirectoryVisible).length;
  const agreementGaps = managed.shops.filter((shop) => !shop.cooperationDocumented).length;
  const filtered = Boolean(query || status);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={managed.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Partners · directory</div><h1>Κατάλογος συνεργατών</h1><p className="lead">Scan-first directory για τα partner records. Οι λεπτομέρειες, toggles, agreement, SLA, orders και fiscal documents ανήκουν πλέον στο Partner record.</p></div></section>
    <WorkspaceMetricStrip items={[
      { label: "Partners", value: managed.shops.length },
      { label: "Operationally active", value: active, tone: active ? "positive" : "default" },
      { label: "Publicly visible", value: visible },
      { label: "Agreement gaps", value: agreementGaps, tone: agreementGaps ? "attention" : "positive" }
    ]} />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Directory" title="Partner records" note="Search με επωνυμία, legal name, partner ID, application ή agreement code. Το onboarding lifecycle βρίσκεται στο Pipeline." />
      {!managed.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη· το partner directory είναι unavailable.</div>}
      <form method="get" className="admin-directory-filters"><label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Partner, legal name, agreement…" /></label><label><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{stateLabel(item)}</option>)}</select></label><div><button className="button button-secondary" type="submit">Filter</button>{filtered && <Link className="text-link" href="/admin/vendors">Clear</Link>}</div></form>
      {shops.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν βρέθηκαν partner records με αυτά τα φίλτρα." : "Δεν υπάρχουν partner records."} /> : <div className="admin-directory-table admin-partner-directory" role="table" aria-label="Partner records">
        <div className="admin-directory-head" role="row"><span>Partner</span><span>Status</span><span>Locations</span><span>Offers</span><span>Agreement</span><span>Public</span><span aria-label="Actions" /></div>
        {shops.map((shop) => <div className="admin-directory-row" role="row" key={shop.id}>
          <Link className="admin-directory-identity" href={`/admin/partners/${encodeURIComponent(shop.id)}`}><strong>{shop.tradingName}</strong><small>{shop.legalName} · {shop.id}</small></Link>
          <span><span className="status-pill">{stateLabel(shop.status)}</span></span>
          <span><strong>{shop.activeLocationCount}/{shop.locationCount}</strong><small>active</small></span>
          <span><strong>{shop.approvedOfferCount}</strong><small>approved</small></span>
          <span><strong>{shop.agreement?.code ?? "—"}</strong><small>{shop.cooperationDocumented ? "documented" : "needs attention"}</small></span>
          <span><strong>{shop.operationalActive && shop.publicDirectoryVisible ? "Visible" : "Hidden"}</strong></span>
          <Link className="admin-record-open" href={`/admin/partners/${encodeURIComponent(shop.id)}`} aria-label={`Open ${shop.tradingName}`}>→</Link>
        </div>)}
      </div>}
    </section>
  </main>;
}
