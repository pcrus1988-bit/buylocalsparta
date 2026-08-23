import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceFilterBar, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";
import { promoteResearchVendorToApplications } from "../applications/actions";

export const metadata: Metadata = { title: "Admin · Research Vendors", robots: { index: false, follow: false } };
type PageSearchParams = Promise<{ q?: string | string[]; status?: string | string[] }>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const PRE_LIVE = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);

function locationLine(vendor: { address?: string; locality?: string; postcode?: string; distanceKm?: number }) {
  const place = [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "Δεν έχει καταχωρηθεί τοποθεσία";
  return vendor.distanceKm === undefined ? place : `${place} · ${vendor.distanceKm.toLocaleString("el-GR")} km`;
}

export default async function ResearchVendorsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await researchVendorsWorkspace(principal);
  const params = await searchParams;
  const query = one(params.q).trim();
  const status = one(params.status) || "all";
  const needle = query.toLocaleLowerCase("el");
  const statusOptions = [...new Set(data.vendors.map((vendor) => vendor.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "el"));
  const filtered = data.vendors
    .filter((vendor) => {
      if (status !== "all" && vendor.status !== status) return false;
      if (!needle) return true;
      return [vendor.tradingName, vendor.legalName, vendor.majorBranch, vendor.subBranch, vendor.address, vendor.locality, vendor.postcode, vendor.phone, vendor.email, vendor.onlineShopUrl, vendor.shortDescription, vendor.storefrontStatus]
        .filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => (b.outreachScore ?? -1) - (a.outreachScore ?? -1) || a.tradingName.localeCompare(b.tradingName, "el"));

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Acquisition intelligence · research ≠ partnership</div>
        <h1>Research vendors</h1>
        <p className="lead">Research dossiers πριν από owner claim, επίσημη αίτηση και activation. Όταν ένας prospect είναι έτοιμος για active follow-up ή παρουσίαση, μεταφέρεται στο Applications inbox.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/applications">Applications</Link>
          <Link className="button button-secondary" href="/admin/partners/pipeline">Partner pipeline</Link>
          <Link className="button button-secondary" href="/admin/categories">Κατηγορίες</Link>
          <Link className="text-link" href="/shops">Public directory →</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Prospects", value: data.summary.total },
      { label: "Invited", value: data.summary.invited, tone: data.summary.invited ? "attention" : "default" },
      { label: "Σε onboarding", value: data.summary.inProgress },
      { label: "Active partners", value: data.summary.active, tone: data.summary.active ? "positive" : "default", hint: `${data.summary.withEvidence} evidence-backed · ${data.summary.restricted} restricted/closed` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Acquisition queue" title="Research vendor dossiers" note="Τα υψηλότερα outreach scores εμφανίζονται πρώτα. Από εδώ μπορείς να προωθήσεις έναν invited prospect στο Applications χωρίς να τον ενεργοποιήσεις εμπορικά." />
      <WorkspaceFilterBar
        action="/admin/research-vendors"
        query={query}
        queryPlaceholder="Κατάστημα, περιοχή, κατηγορία, τηλέφωνο…"
        filters={[{
          name: "status",
          label: "Κατάσταση",
          value: status,
          options: [{ value: "all", label: "Όλες οι καταστάσεις" }, ...statusOptions.map((value) => ({ value, label: value.replaceAll("_", " ") }))]
        }]}
        resultLabel={`${filtered.length} από ${data.vendors.length} dossiers`}
        resetHref="/admin/research-vendors"
      />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη. Δεν δημιουργούνται fallback ή fictional research records.</div>}
      {data.vendors.length === 0 ? <WorkspaceEmptyState
        eyebrow="Δεν υπάρχουν imported records"
        title="Το acquisition queue είναι κενό."
        body="Δεν αντικαθίστανται τα verified research δεδομένα με demo επιχειρήσεις."
        action={<Link className="button button-secondary" href="/admin/applications">Έλεγχος Applications</Link>}
      /> : filtered.length === 0 ? <WorkspaceEmptyState eyebrow="Δεν βρέθηκαν αποτελέσματα" title="Κανένα dossier δεν ταιριάζει στα φίλτρα." action={<Link className="button button-secondary" href="/admin/research-vendors">Καθαρισμός φίλτρων</Link>} /> : <div className="workspace-queue-list">{filtered.map((vendor) => <article className="workspace-queue-card" key={vendor.id}>
        <div className="workspace-queue-head">
          <div><strong>{vendor.tradingName}</strong><small>{vendor.majorBranch ?? "Unclassified"}{vendor.subBranch ? ` · ${vendor.subBranch}` : ""} · {locationLine(vendor)}</small></div>
          <WorkspaceStatusBadge status={vendor.status} />
        </div>
        <div className="workspace-queue-primary">
          <span>{vendor.evidenceCount} evidence</span>
          <span>{vendor.verificationCount} verified</span>
          <span>{vendor.researchSourceCount} source rows</span>
          {vendor.outreachPriority && <span>Outreach {vendor.outreachPriority}{vendor.outreachScore === undefined ? "" : ` · ${vendor.outreachScore}/10`}</span>}
          {vendor.onlineShopActive && <span>Online shop {vendor.onlineShopActive}</span>}
        </div>
        <p className="workspace-queue-summary">{vendor.shortDescription ?? vendor.storefrontStatus ?? "Research record που περιμένει merchant-owned profile content."}</p>
        <WorkspaceRecordDetails label="Contact, commerce fit & research evidence">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Νομική ονομασία</strong><span>{vendor.legalName}</span><small>{vendor.id}{vendor.primaryCensusId === undefined ? "" : ` · Census #${vendor.primaryCensusId}`}</small></div>
            <div className="workspace-compact-row"><strong>Επικοινωνία</strong><span>{vendor.phone ?? "Δεν υπάρχει τηλέφωνο"} · {vendor.email ?? "Δεν υπάρχει δημόσιο email"}</span></div>
            <div className="workspace-compact-row"><strong>Τοποθεσία</strong><span>{locationLine(vendor)}</span></div>
            <div className="workspace-compact-row"><strong>Commerce mode</strong><span>{vendor.recommendedCommerceMode ?? "Awaiting classification"}</span></div>
            {vendor.onlineShopUrl && <div className="workspace-compact-row"><strong>Online shop</strong><span>{vendor.onlineShopUrl}</span></div>}
            {(vendor.latestIssueType || vendor.latestIssueSeverity) && <div className="workspace-compact-row"><strong>Known e-shop lead</strong><span>{vendor.latestIssueSeverity ?? "—"} · {vendor.latestIssueType ?? "—"}</span></div>}
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>{vendor.status === "invited" ? "Research dossier → Applications → DEMO / verification." : PRE_LIVE.has(vendor.status) ? "This prospect is already in the Applications/onboarding lifecycle." : "Research history remains available for this partner."}</span>
          <div className="workspace-action-buttons">
            <Link className="button button-secondary" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open full dossier</Link>
            {vendor.status === "invited" ? <form action={promoteResearchVendorToApplications}>
              <input type="hidden" name="csrfToken" value={data.csrfToken} />
              <input type="hidden" name="vendorId" value={vendor.id} />
              <input type="hidden" name="reason" value="Promote research prospect to Applications" />
              <button className="button" type="submit">Move to Applications</button>
            </form> : PRE_LIVE.has(vendor.status) ? <Link className="button" href={`/admin/applications#vendor-${encodeURIComponent(vendor.id)}`}>Open in Applications</Link> : <Link className="button button-secondary" href="/admin/vendors">Partner record</Link>}
          </div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-dual-grid">
        <details className="workspace-tool-panel"><summary><span><strong>Research is not activation</strong><small>Moving a prospect to Applications does not make it sellable.</small></span></summary><div className="workspace-tool-body"><p className="workspace-inline-note">Το normalized profile βοηθά filtering/outreach. Applications επιτρέπει DEMO/catalogue preparation, ενώ activation και commerce παραμένουν ξεχωριστά governed gates.</p></div></details>
        <details className="workspace-tool-panel"><summary><span><strong>Catalog readiness</strong><small>Activation δεν σημαίνει αυτόματη δημοσίευση προϊόντων.</small></span></summary><div className="workspace-tool-body"><p className="workspace-inline-note">Category assignment, canonical matching, offer approval και inventory freshness παραμένουν ξεχωριστά publication gates.</p><div className="workspace-form-actions"><Link className="text-link" href="/admin/matching">Product Matching Centre →</Link></div></div></details>
      </div>
    </section>
  </main>;
}
