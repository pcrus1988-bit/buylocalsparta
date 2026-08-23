import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SqlRow } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../components/WorkspacePagePrimitives";
import { adminVendorsWorkspace, hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../lib/postgres-runtime";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";
import { advanceApplicationToVerification, setApplicationDemoMode } from "./actions";

export const metadata: Metadata = { title: "Admin · Applications", robots: { index: false, follow: false } };

const PRE_LIVE = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);
const fmtDate = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));

type VendorProjectionRow = SqlRow & {
  public_id: string;
  status: string;
  demo_mode: boolean;
};

type DemoProjection = { status: string; demoMode: boolean };

function DemoControls({ csrfToken, vendorId, applicationId, demo }: { csrfToken: string; vendorId?: string; applicationId?: string; demo?: DemoProjection }) {
  const enabled = Boolean(demo?.demoMode);
  return <div className="workspace-action-buttons">
    <form action={setApplicationDemoMode}>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {vendorId && <input type="hidden" name="vendorId" value={vendorId} />}
      {applicationId && <input type="hidden" name="applicationId" value={applicationId} />}
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <input type="hidden" name="reason" value={enabled ? "Disable application DEMO storefront" : "Prepare application DEMO storefront"} />
      <button className={enabled ? "button button-secondary" : "button"} type="submit">{enabled ? "Disable DEMO" : applicationId && !vendorId ? "Create & enable DEMO" : "Enable DEMO"}</button>
    </form>
    {vendorId && <Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(vendorId)}/catalogue`}>Catalogue / DEMO</Link>}
    {vendorId && enabled && <Link className="button button-secondary" href={`/demo/vendor/${encodeURIComponent(vendorId)}`} target="_blank">Open DEMO ↗</Link>}
  </div>;
}

export default async function ApplicationsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const [applicationWorkspace, researchWorkspace] = await Promise.all([
    adminVendorsWorkspace(principal),
    researchVendorsWorkspace(principal)
  ]);

  const formalApplications = applicationWorkspace.applications.filter((application) => PRE_LIVE.has(application.state));
  const linkedVendorIds = new Set(formalApplications.map((application) => application.vendorId).filter((value): value is string => Boolean(value)));
  const promotedResearch = researchWorkspace.vendors.filter((vendor) => PRE_LIVE.has(vendor.status) && !linkedVendorIds.has(vendor.id));

  const demoByVendor = new Map<string, DemoProjection>();
  if (productionDatabaseConfigured()) {
    const result = await getProductionPostgresRuntime().sqlPool.query<VendorProjectionRow>(`
      SELECT vb.public_id,vb.status::text AS status,vb.demo_mode
      FROM vendor_businesses vb
      JOIN markets m ON m.id=vb.market_id
      WHERE m.code='sparta'
        AND vb.status IN ('application_started','verification_pending','catalog_onboarding','test_ready')
      ORDER BY vb.updated_at DESC
    `);
    for (const row of result.rows) demoByVendor.set(row.public_id, { status: row.status, demoMode: Boolean(row.demo_mode) });
  }

  const unlinked = formalApplications.filter((application) => !application.vendorId).length;
  const verificationPending = formalApplications.filter((application) => application.state === "verification_pending").length;
  const demoEnabled = [...demoByVendor.values()].filter((vendor) => vendor.demoMode).length;
  const totalQueue = formalApplications.length + promotedResearch.length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={applicationWorkspace.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Partners · governed intake</div>
        <h1>Applications</h1>
        <p className="lead">The operational inbox between acquisition and onboarding. Inbound applications and research prospects promoted for follow-up meet here; DEMO preparation remains strictly pre-live.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/partners/pipeline">← Partner pipeline</Link>
          <Link className="button button-secondary" href="/admin/research-vendors">Research vendors</Link>
          <Link className="text-link" href="/admin/vendors">Partner directory →</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Application queue", value: totalQueue, tone: totalQueue ? "attention" : "default" },
      { label: "Inbound not provisioned", value: unlinked, tone: unlinked ? "attention" : "positive", hint: "A pre-live vendor record is created only when needed" },
      { label: "Verification pending", value: verificationPending },
      { label: "DEMO enabled", value: demoEnabled, tone: demoEnabled ? "positive" : "default", hint: "Never commerce eligible" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Inbound applications" title="Merchant-submitted applications" note="A just-submitted merchant application appears here immediately. Enabling DEMO provisions the linked pre-live vendor, owner membership and first location without activating commerce." />
      {formalApplications.length === 0 ? <WorkspaceEmptyState title="No inbound applications require action." body="New merchant applications will appear here at application_started and remain visible through the pre-live onboarding stages." /> : <div className="workspace-queue-list">
        {formalApplications.map((application) => {
          const demo = application.vendorId ? demoByVendor.get(application.vendorId) : undefined;
          return <article className="workspace-queue-card" id={`application-${application.id}`} key={application.id}>
            <div className="workspace-queue-head">
              <div><strong>{application.tradingName}</strong><small>{application.legalName} · {application.contactEmail}</small></div>
              <WorkspaceStatusBadge status={application.state} />
            </div>
            <div className="workspace-queue-primary">
              <span>{application.primaryCategory}</span>
              <span>Plan {application.requestedPlanCode}</span>
              <span>{application.phone ?? "No phone"}</span>
              <span>{application.address} · {application.postcode}</span>
            </div>
            <p className="workspace-queue-summary">{application.shopStory ?? "No shop story supplied yet."}</p>
            <div className="workspace-inline-note">{application.vendorId ? <>Pre-live vendor <strong>{application.vendorId}</strong> · DEMO {demo?.demoMode ? "ON" : "OFF"}.</> : <>No vendor business has been provisioned yet. <strong>Create & enable DEMO</strong> will safely create the pre-live operational shell and link it to this application.</>}</div>
            <div className="workspace-action-bar">
              <span>Received {fmtDate(application.createdAt)} · updated {fmtDate(application.updatedAt)}</span>
              <DemoControls csrfToken={applicationWorkspace.csrfToken} applicationId={application.id} vendorId={application.vendorId} demo={demo} />
            </div>
            {application.state === "application_started" && <form action={advanceApplicationToVerification} className="admin-directory-filters" style={{ marginTop: 12 }}>
              <input type="hidden" name="csrfToken" value={applicationWorkspace.csrfToken} />
              <input type="hidden" name="applicationId" value={application.id} />
              <label><span>Verification hand-off reason</span><input name="reason" defaultValue="Application complete; send to verification" minLength={3} maxLength={500} required /></label>
              <button className="button button-secondary" type="submit">Move to Verification</button>
            </form>}
          </article>;
        })}
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Promoted prospects" title="Research vendors moved into Applications" note="These records keep their research dossier for evidence, but they now sit in the application-stage operating queue so Admin can prepare catalogue and DEMO before a commercial activation decision." />
      {promotedResearch.length === 0 ? <WorkspaceEmptyState title="No research prospects have been moved into Applications." body="Use “Move to Applications” from Research Vendors when a prospect is ready for a demonstration or active follow-up." action={<Link className="button button-secondary" href="/admin/research-vendors">Open Research Vendors</Link>} /> : <div className="workspace-queue-list">
        {promotedResearch.map((vendor) => {
          const demo = demoByVendor.get(vendor.id);
          return <article className="workspace-queue-card" id={`vendor-${vendor.id}`} key={vendor.id}>
            <div className="workspace-queue-head"><div><strong>{vendor.tradingName}</strong><small>{vendor.legalName}{vendor.locality ? ` · ${vendor.locality}` : ""}</small></div><WorkspaceStatusBadge status={vendor.status} /></div>
            <div className="workspace-queue-primary"><span>Research prospect</span><span>{vendor.majorBranch ?? "Unclassified"}</span><span>{vendor.evidenceCount} evidence</span><span>{vendor.verificationCount} verified checks</span></div>
            <p className="workspace-queue-summary">{vendor.shortDescription ?? vendor.storefrontStatus ?? "Promoted acquisition record awaiting merchant claim/application."}</p>
            <div className="workspace-action-bar">
              <span>DEMO {demo?.demoMode ? "ON" : "OFF"} · commerce remains blocked until later activation.</span>
              <div className="workspace-action-buttons">
                <Link className="button button-secondary" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Research dossier</Link>
                <DemoControls csrfToken={applicationWorkspace.csrfToken} vendorId={vendor.id} demo={demo} />
              </div>
            </div>
          </article>;
        })}
      </div>}
    </div></section>
  </main>;
}
