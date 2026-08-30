import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { commercialAgreementWorkspace } from "../../../lib/admin-commercial-agreements";
import { adminVendorsWorkspace, hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { adminSlaPolicyWorkspace } from "../../../lib/order-sla";
import { verifiedProspectsWorkspace } from "../../../lib/prospect-vendors-runtime";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";
import { adminVendorShopsWorkspace } from "../../../lib/vendor-admin-controls";

export const metadata: Metadata = { title: "Admin · Partners", robots: { index: false, follow: false } };

const PRE_LIVE = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const canReadFinance = hasAdminPermission(principal, "finance.read");
  const [research, applications, prospects, managed, commercial, sla] = await Promise.all([
    researchVendorsWorkspace(principal),
    adminVendorsWorkspace(principal),
    verifiedProspectsWorkspace(principal),
    adminVendorShopsWorkspace(principal),
    canReadFinance ? commercialAgreementWorkspace().catch(() => undefined) : Promise.resolve(undefined),
    canReadFinance ? adminSlaPolicyWorkspace().catch(() => undefined) : Promise.resolve(undefined)
  ]);

  const applicationQueue = applications.applications.filter((item) => PRE_LIVE.has(item.state)).length;
  const active = managed.shops.filter((shop) => shop.operationalActive).length;
  const visible = managed.shops.filter((shop) => shop.operationalActive && shop.publicDirectoryVisible).length;
  const partnerAttention = managed.shops.filter((shop) => ["restricted", "suspended"].includes(shop.status) || (shop.operationalActive && !shop.cooperationDocumented)).length;

  const activeAgreements = commercial?.agreements.filter((agreement) => agreement.status === "active") ?? [];
  const activeAgreementByVendor = new Map(activeAgreements.map((agreement) => [agreement.vendorId, agreement]));
  const activeSlaByVendor = new Map((sla?.agreements ?? []).filter((item) => item.agreementStatus === "active").map((item) => [item.vendorId, item]));
  const activePartners = managed.shops.filter((shop) => shop.operationalActive);
  const activeAgreementGaps = activePartners.filter((shop) => !activeAgreementByVendor.has(shop.id)).length;
  const activeWithoutSla = activePartners.filter((shop) => {
    const agreement = activeAgreementByVendor.get(shop.id);
    return agreement && !activeSlaByVendor.get(shop.id)?.configured;
  }).length;

  return <main className="vendor-app admin-app admin-partners-overview">
    <AdminWorkspaceHeader csrfToken={applications.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Partners</div>
        <h1>Partner operations</h1>
        <p className="lead">Από lead και αίτηση μέχρι onboarding, ενεργό κατάστημα και εμπορική ετοιμότητα. Η σελίδα δείχνει τι χρειάζεται συνέχεια· Finance και Tax παραμένουν τα source workspaces για invoicing και fiscal execution.</p>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Application queue", value: applicationQueue, tone: applicationQueue ? "attention" : "default", hint: "pre-live applications" },
      { label: "Onboarding", value: prospects.summary.total, tone: prospects.summary.total ? "attention" : "default", hint: `${prospects.summary.testReady} test ready` },
      { label: "Active partners", value: active, tone: active ? "positive" : "default", hint: `${visible} publicly visible` },
      { label: "Needs attention", value: partnerAttention, tone: partnerAttention ? "attention" : "positive", hint: "operational / agreement blockers" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Work queues" title="Choose the next partner job" note="The visible workflow now follows the partner lifecycle. Commercial agreements and SLA remain available as governed drill-downs when a readiness gate requires them." />
      <div className="partner-workflow-grid">
        <Link className={`partner-workflow-card${applicationQueue ? " needs-attention" : ""}`} href="/admin/applications">
          <span>01 · Intake</span><strong>Applications</strong><p>Inbound merchants and promoted research prospects awaiting verification or pre-live preparation.</p><b>{applicationQueue}</b><i>Open application inbox →</i>
        </Link>
        <Link className={`partner-workflow-card${prospects.summary.total ? " needs-attention" : ""}`} href="/admin/prospects">
          <span>02 · Onboarding</span><strong>Verified prospects</strong><p>Contract, catalogue, test readiness and the final activation decision after verification.</p><b>{prospects.summary.total}</b><i>Continue onboarding →</i>
        </Link>
        <Link className={`partner-workflow-card${partnerAttention ? " needs-attention" : ""}`} href="/admin/vendors">
          <span>03 · Operate</span><strong>Partner directory</strong><p>Active and inactive partner records, public visibility, locations, offers and record-level controls.</p><b>{managed.shops.length}</b><i>Open directory →</i>
        </Link>
        <Link className="partner-workflow-card" href="/admin/research-vendors">
          <span>Acquisition</span><strong>Research leads</strong><p>Research dossiers and invited local businesses before they enter the governed application workflow.</p><b>{research.summary.total}</b><i>Open research leads →</i>
        </Link>
      </div>
      <div className="partner-pipeline-handoff"><span>Need the full stage map from acquisition to activation?</span><Link className="button button-secondary" href="/admin/partners/pipeline">Open Partner Pipeline</Link></div>
    </section>

    {canReadFinance && commercial && sla && <section id="commercial-readiness" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Activation readiness" title="Agreement & SLA blockers" note="Only readiness signals live here. Agreement/SLA changes stay governed; billing and tax execution remain in Finance and Tax rather than being duplicated inside Partners." />
      <WorkspaceMetricStrip items={[
        { label: "Active agreements", value: activeAgreements.length, tone: activeAgreementGaps ? "attention" : "positive", hint: `${activeAgreementGaps} active partner gaps` },
        { label: "SLA configured", value: activePartners.length - activeWithoutSla - activeAgreementGaps, tone: activeWithoutSla ? "attention" : "positive", hint: `${activeWithoutSla} using fallback` },
        { label: "Agreement gaps", value: activeAgreementGaps, tone: activeAgreementGaps ? "attention" : "positive" },
        { label: "Active partners", value: activePartners.length, tone: activePartners.length ? "positive" : "default" }
      ]} />
      <div className="workspace-action-bar">
        <span>Resolve partner readiness here; perform invoicing and myDATA work in their dedicated workspaces.</span>
        <div className="workspace-action-buttons">
          <Link className="button button-secondary" href="/admin/finance/agreements">Agreements</Link>
          <Link className="button button-secondary" href="/admin/finance/agreements/sla">SLA policies</Link>
          <Link className="text-link" href="/admin/finance/vendor-billing">Vendor billing →</Link>
          <Link className="text-link" href="/admin/tax">Tax & myDATA →</Link>
        </div>
      </div>
      <div className="admin-insight-table partner-readiness-table" role="table" aria-label="Active partner readiness">
        <div className="admin-insight-head" role="row"><span>Partner</span><span>Agreement</span><span>SLA</span></div>
        {activePartners.map((shop) => {
          const agreement = activeAgreementByVendor.get(shop.id);
          const slaPolicy = activeSlaByVendor.get(shop.id);
          const needsAttention = !agreement || !slaPolicy?.configured;
          return <div className={`admin-insight-row${needsAttention ? " needs-attention" : ""}`} role="row" key={shop.id}>
            <span><Link href={`/admin/partners/${encodeURIComponent(shop.id)}`}><strong>{shop.tradingName}</strong></Link><small>{shop.publicDirectoryVisible ? "public" : "hidden"} · {shop.approvedOfferCount} approved offers</small></span>
            <span><strong>{agreement ? `${agreement.agreementCode} · v${agreement.agreementVersion}` : "Missing"}</strong><small>{agreement ? `${(agreement.commissionRateBps / 100).toFixed(2)}% commission` : "Activation/commercial blocker"}</small></span>
            <span><strong>{slaPolicy?.configured ? `${slaPolicy.acceptanceMinutes}m / ${slaPolicy.preparationMinutes}m` : agreement ? "Fallback" : "—"}</strong><small>{slaPolicy?.configured ? `warning ${slaPolicy.warningPercent}%` : agreement ? "Platform defaults in effect" : "Agreement required first"}</small></span>
          </div>;
        })}
      </div>
    </div></section>}
  </main>;
}
