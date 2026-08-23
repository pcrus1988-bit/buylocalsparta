import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminStatusStack, type AdminRecordStateTone, type AdminAttentionSeverity } from "../../../components/AdminRecordStatus";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { adminVendorShopsWorkspace } from "../../../lib/vendor-admin-controls";

export const metadata: Metadata = { title: "Admin · Partners Directory", robots: { index: false, follow: false } };
const stateLabel = (state: string) => ({ active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed", invited: "Invited" }[state] ?? state.replaceAll("_", " "));
const PARTNER_VIEWS = ["all", "active", "attention", "public", "hidden"] as const;
type PartnerView = (typeof PARTNER_VIEWS)[number];
function partnerView(value?: string): PartnerView { return PARTNER_VIEWS.includes(value as PartnerView) ? value as PartnerView : "all"; }
function partnerStateTone(status: string): AdminRecordStateTone {
  if (status === "active") return "positive";
  if (status === "invited") return "caution";
  if (["restricted", "suspended"].includes(status)) return "critical";
  return "neutral";
}
function partnerAttention(shop: { status: string; cooperationDocumented: boolean }): { label: string; severity: AdminAttentionSeverity } | undefined {
  const reasons: string[] = [];
  if (["restricted", "suspended"].includes(shop.status)) reasons.push("Operational review");
  if (!shop.cooperationDocumented) reasons.push("Agreement gap");
  if (!reasons.length) return undefined;
  return { label: reasons.join(" · "), severity: shop.status === "suspended" ? "critical" : "attention" };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; view?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let managed;
  try { managed = await adminVendorShopsWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const status = params.status?.trim();
  const view = partnerView(params.view);
  const statuses = [...new Set(managed.shops.map((shop) => shop.status))].sort();
  const matchesView = (shop: (typeof managed.shops)[number]) => view === "all"
    || (view === "active" && shop.operationalActive)
    || (view === "attention" && (!shop.cooperationDocumented || ["restricted", "suspended"].includes(shop.status)))
    || (view === "public" && shop.operationalActive && shop.publicDirectoryVisible)
    || (view === "hidden" && !shop.publicDirectoryVisible);
  const shops = managed.shops.filter((shop) => matchesView(shop) && (!status || shop.status === status) && (!query || [shop.id, shop.tradingName, shop.legalName, shop.applicationId, shop.agreement?.code].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query))));
  const active = managed.shops.filter((shop) => shop.operationalActive).length;
  const visible = managed.shops.filter((shop) => shop.operationalActive && shop.publicDirectoryVisible).length;
  const agreementGaps = managed.shops.filter((shop) => !shop.cooperationDocumented).length;
  const hasAdHocFilters = Boolean(query || status);
  const filtered = hasAdHocFilters || view !== "all";
  const clearHref = view === "all" ? "/admin/vendors" : `/admin/vendors?view=${encodeURIComponent(view)}`;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={managed.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Partners · directory</div><h1>Κατάλογος συνεργατών</h1><p className="lead">Scan-first directory με saved operational views. Από κάθε partner record μπορείς να διαχειριστείς catalogue assignments πριν την ενεργοποίηση και ασφαλές DEMO storefront χωρίς live commerce.</p></div></section>
    <WorkspaceMetricStrip items={[
      { label: filtered ? "Matching partners" : "Partners", value: filtered ? shops.length : managed.shops.length },
      { label: "Operationally active", value: active, tone: active ? "positive" : "default" },
      { label: "Publicly visible", value: visible },
      { label: "Agreement gaps", value: agreementGaps, tone: agreementGaps ? "attention" : "positive" }
    ]} />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Directory" title="Partner records" note="Partner state stays factual. Catalogue preparation is independent from activation; DEMO mode remains non-commerce." />
      {!managed.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη· το partner directory είναι unavailable.</div>}
      <nav className="admin-local-tabs" aria-label="Partner saved views">
        <Link href="/admin/vendors" aria-current={view === "all" ? "page" : undefined}>All</Link>
        <Link href="/admin/vendors?view=active" aria-current={view === "active" ? "page" : undefined}>Active</Link>
        <Link href="/admin/vendors?view=attention" aria-current={view === "attention" ? "page" : undefined}>Needs attention</Link>
        <Link href="/admin/vendors?view=public" aria-current={view === "public" ? "page" : undefined}>Public</Link>
        <Link href="/admin/vendors?view=hidden" aria-current={view === "hidden" ? "page" : undefined}>Hidden</Link>
      </nav>
      <form method="get" className="admin-directory-filters">
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Partner, legal name, agreement…" /></label>
        <label><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{stateLabel(item)}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{hasAdHocFilters && <Link className="text-link" href={clearHref}>Clear filters</Link>}</div>
      </form>
      {shops.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν βρέθηκαν partner records σε αυτό το view / φίλτρο." : "Δεν υπάρχουν partner records."} /> : <div className="admin-directory-table admin-partner-directory" role="table" aria-label="Partner records">
        <div className="admin-directory-head" role="row"><span>Partner</span><span>State / attention</span><span>Locations</span><span>Offers</span><span>Agreement</span><span>Public</span><span>Actions</span></div>
        {shops.map((shop) => {
          const attention = partnerAttention(shop);
          return <div className="admin-directory-row" role="row" key={shop.id}>
            <Link className="admin-directory-identity" href={`/admin/partners/${encodeURIComponent(shop.id)}`}><strong>{shop.tradingName}</strong><small>{shop.legalName} · {shop.id}</small></Link>
            <span><AdminStatusStack state={stateLabel(shop.status)} stateTone={partnerStateTone(shop.status)} attention={attention?.label} attentionSeverity={attention?.severity} /></span>
            <span><strong>{shop.activeLocationCount}/{shop.locationCount}</strong><small>active</small></span>
            <span><strong>{shop.approvedOfferCount}</strong><small>approved</small></span>
            <span><strong>{shop.agreement?.code ?? "—"}</strong><small>{shop.cooperationDocumented ? "documented" : "not documented"}</small></span>
            <span><strong>{shop.operationalActive && shop.publicDirectoryVisible ? "Visible" : "Hidden"}</strong></span>
            <span><Link className="text-link" href={`/admin/partners/${encodeURIComponent(shop.id)}/catalogue`}>Catalogue / DEMO</Link> · <Link className="admin-record-open" href={`/admin/partners/${encodeURIComponent(shop.id)}`} aria-label={`Open ${shop.tradingName}`}>→</Link></span>
          </div>;
        })}
      </div>}
    </section>
  </main>;
}
