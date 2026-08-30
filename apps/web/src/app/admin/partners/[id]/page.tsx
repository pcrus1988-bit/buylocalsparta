import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { VendorAgreementForm } from "../../../../components/VendorAgreementForm";
import { VendorAgreementRenewalForm } from "../../../../components/VendorAgreementRenewalForm";
import { VendorToggleControl } from "../../../../components/VendorToggleControl";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminOrdersReturnsWorkspace } from "../../../../lib/admin-governance-runtime";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { marketplaceReferenceMap } from "../../../../lib/public-reference-service";
import { adminSlaPolicyWorkspace } from "../../../../lib/order-sla";
import { adminVendorShopsWorkspace } from "../../../../lib/vendor-admin-controls";

export const metadata: Metadata = { title: "Admin · Partner Record", robots: { index: false, follow: false } };
const stateLabel = (state: string) => ({ active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed", invited: "Invited", catalog_onboarding: "Catalog onboarding", test_ready: "Test ready", verification_pending: "Verification pending" }[state] ?? state.replaceAll("_", " "));
function euro(minor?: number) { return minor === undefined ? "—" : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  let managed;
  try { managed = await adminVendorShopsWorkspace(principal); } catch { redirect("/admin/partners"); }
  const shop = managed.shops.find((item) => item.id === id);
  if (!shop) redirect("/admin/vendors");

  const canOrders = hasAdminPermission(principal, "fulfilment.read");
  const canFinance = hasAdminPermission(principal, "finance.read");
  const canFinanceWrite = hasAdminPermission(principal, "finance.write");
  const [orderData, sla] = await Promise.all([
    canOrders ? adminOrdersReturnsWorkspace(principal).catch(() => undefined) : undefined,
    canFinance ? adminSlaPolicyWorkspace().catch(() => undefined) : undefined
  ]);
  const orders = orderData?.orders.filter((order) => order.lines.some((line) => line.vendorId === shop.id)) ?? [];
  const orderReferences = await marketplaceReferenceMap("order", orders.map((order) => order.id));
  const activeOrders = orders.filter((order) => !["cancelled", "completed", "fulfilled", "refunded"].includes(order.status)).length;
  const slaPolicy = sla?.agreements.find((item) => item.vendorId === shop.id && item.agreementId === shop.agreement?.id) ?? sla?.agreements.find((item) => item.vendorId === shop.id);
  const applicationRequiresGovernedActivation = Boolean(shop.applicationState && shop.applicationState !== "active");
  const activationBlocked = !shop.operationalActive && (!shop.cooperationDocumented || applicationRequiresGovernedActivation);
  const agreementRenewalEligible = Boolean(
    shop.agreement?.endsAt &&
    ["active", "expired", "suspended"].includes(shop.agreement.status)
  );
  const renewableAgreement = canFinanceWrite && agreementRenewalEligible;
  const agreementExpired = Boolean(
    shop.agreement?.endsAt &&
    (shop.agreement.status === "expired" || new Date(shop.agreement.endsAt).getTime() <= Date.now())
  );

  return <main className="vendor-app admin-app admin-partner-record">
    <AdminWorkspaceHeader csrfToken={managed.csrfToken} entityLabel={shop.tradingName} />
    <section id="partner-overview" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Partner record</div>
        <h1>{shop.tradingName}</h1>
        <p className="lead">{shop.legalName} · {shop.id}. Operational state, onboarding context, catalogue readiness, assigned orders and commercial gates in one partner record.</p>
        <div className="hero-actions">
          <Link className="text-link" href="/admin/vendors">← Partner directory</Link>
          <Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(shop.id)}/catalogue`}>Catalogue / DEMO</Link>
          {shop.applicationId && <Link className="text-link" href="/admin/prospects">Onboarding →</Link>}
          {agreementExpired && <Link className="button button-secondary" href="#partner-renewal">Renew agreement</Link>}
        </div>
      </div>
    </section>

    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Partner record sections"><a href="#partner-overview">Overview</a>{canOrders && <a href="#partner-orders">Orders</a>}<a href="#partner-agreement">Agreement & SLA{agreementExpired ? " · renewal required" : ""}</a><a href="#partner-activity">Activity</a></nav></section>

    <WorkspaceMetricStrip items={[
      { label: "Status", value: stateLabel(shop.status), tone: shop.operationalActive ? "positive" : "attention" },
      { label: "Locations", value: `${shop.activeLocationCount}/${shop.locationCount}`, hint: "active / total" },
      { label: "Approved offers", value: shop.approvedOfferCount },
      { label: "Agreement", value: shop.cooperationDocumented ? "documented" : agreementExpired ? "expired" : "attention", tone: shop.cooperationDocumented ? "positive" : "attention" },
      ...(canOrders ? [{ label: "Active orders", value: activeOrders, tone: activeOrders ? "attention" as const : "default" as const }] : [])
    ]} />

    <section className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Overview" title="Operational state & next partner actions" note="Partner controls stay here. Catalogue preparation and commercial readiness are linked directly; invoicing and fiscal execution remain in Finance and Tax." />
      {agreementExpired && <div className="workspace-action-bar" role="status"><span><strong>Commercial agreement expired.</strong> This partner remains commercially restricted until a successor agreement completes the governed signature and activation workflow.</span><div className="workspace-action-buttons">{renewableAgreement ? <Link className="button button-secondary" href="#partner-renewal">Create renewal / extension</Link> : <span className="muted">Renewal requires Finance write permission.</span>}</div></div>}
      <div className="workspace-action-bar"><span>Shop: <strong>{shop.operationalActive ? "ACTIVE" : "INACTIVE"}</strong> · Public directory: <strong>{shop.operationalActive && shop.publicDirectoryVisible ? "VISIBLE" : "HIDDEN"}</strong></span><div className="workspace-action-buttons"><VendorToggleControl label="Shop active" checked={shop.operationalActive} endpoint={`/api/admin/vendors/${encodeURIComponent(shop.id)}/operational`} csrfToken={managed.csrfToken} field="active" disabled={shop.status === "closed" || shop.researchVendor || activationBlocked} reasonPrompt={shop.operationalActive ? "Reason for deactivating/suspending this shop" : "Reason for reactivating this shop"} /><VendorToggleControl label="Public visibility" checked={shop.publicDirectoryVisible} endpoint={`/api/admin/vendors/${encodeURIComponent(shop.id)}/visibility`} csrfToken={managed.csrfToken} field="visible" disabled={!shop.operationalActive && !shop.publicDirectoryVisible} /></div></div>
      {applicationRequiresGovernedActivation && <div className="workspace-inline-note">Linked onboarding stage: <strong>{stateLabel(shop.applicationState ?? "")}</strong>. Activation / reactivation remains governed through Onboarding. <Link className="text-link" href="/admin/prospects">Open Onboarding →</Link></div>}
      {!shop.operationalActive && !shop.cooperationDocumented && <div className="workspace-inline-note">Operational activation is blocked until the cooperation agreement is fully documented and currently effective.</div>}

      <div className="partner-record-command-grid">
        <Link href={`/admin/partners/${encodeURIComponent(shop.id)}/catalogue`} className="partner-record-command"><span>Catalogue</span><strong>{shop.approvedOfferCount} approved offers</strong><small>Assign products, prepare catalogue and manage safe DEMO mode.</small><i>Open →</i></Link>
        <a href="#partner-agreement" className={`partner-record-command${!shop.cooperationDocumented || agreementExpired ? " needs-attention" : ""}`}><span>Commercial gate</span><strong>{shop.cooperationDocumented && !agreementExpired ? "Ready" : agreementExpired ? "Renewal required" : "Agreement required"}</strong><small>Agreement and SLA readiness before activation or continued operation.</small><i>Review ↓</i></a>
        {canOrders && <a href="#partner-orders" className={`partner-record-command${activeOrders ? " needs-attention" : ""}`}><span>Operations</span><strong>{activeOrders} active orders</strong><small>Orders currently assigned to this partner.</small><i>Review ↓</i></a>}
      </div>

      <div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Partner ID</strong><span>{shop.id}</span></div><div className="workspace-compact-row"><strong>Application</strong><span>{shop.applicationId ?? "—"}</span><small>{shop.applicationState ? stateLabel(shop.applicationState) : "No linked application"}</small></div><div className="workspace-compact-row"><strong>Visibility update</strong><span>{shop.publicDirectoryVisibilityUpdatedAt ? new Date(shop.publicDirectoryVisibilityUpdatedAt).toLocaleString("el-GR") : "—"}</span><small>{shop.publicDirectoryVisibilityReason ?? "No recorded reason"}</small></div></div>
    </section>

    {canOrders && <section id="partner-orders" className="vendor-section section-tint admin-anchor-section"><div className="shell"><WorkspaceSectionHeading eyebrow="Orders" title="Orders assigned to this partner" note="This is relationship context, not a second Orders workspace. Use the filtered Orders view for fulfilment actions." /><div className="workspace-action-bar"><span>{orders.length} orders · {activeOrders} active</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/orders?q=${encodeURIComponent(shop.id)}`}>Open filtered Orders</Link></div></div>{orders.length === 0 ? <WorkspaceEmptyState title="No orders are assigned to this partner." /> : <div className="admin-compact-table" role="table" aria-label="Partner orders"><div className="admin-compact-table-head" role="row"><span>Order</span><span>Status</span><span>Partner lines</span><span>Open</span></div>{orders.slice(0, 8).map((order) => <Link className="admin-compact-table-row" href={`/admin/orders?order=${encodeURIComponent(orderReferences.get(order.id) ?? order.id)}`} role="row" key={order.id}><span><strong>{orderReferences.get(order.id) ?? order.id}</strong><small>{order.customerId ?? "guest"}</small></span><span>{order.status}</span><span>{order.lines.filter((line) => line.vendorId === shop.id).length}</span><span>→</span></Link>)}</div>}</div></section>}

    <section id="partner-agreement" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Commercial gate" title="Agreement & service levels" note="Agreement/SLA readiness belongs to the partner relationship. Billing, settlement and myDATA execution remain in their dedicated Finance/Tax workspaces." />
      {shop.agreement ? <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Agreement</strong><span>{shop.agreement.code} · v{shop.agreement.version} · {shop.agreement.status}</span><small>{shop.agreement.id}</small></div>
        <div className="workspace-compact-row"><strong>Term</strong><span>{shop.agreement.startsAt ? new Date(shop.agreement.startsAt).toLocaleString("el-GR") : "—"} → {shop.agreement.endsAt ? new Date(shop.agreement.endsAt).toLocaleString("el-GR") : "open-ended"}</span></div>
        <div className="workspace-compact-row"><strong>Signed / document</strong><span>{shop.agreement.signedAt ? new Date(shop.agreement.signedAt).toLocaleDateString("el-GR") : "Not signed"} · {shop.agreement.sourceDocumentReference ?? "No document reference"}</span></div>
        <div className="workspace-compact-row"><strong>Commercial terms</strong><span>{(shop.agreement.commissionRateBps / 100).toLocaleString("el-GR")} % commission · listing {euro(shop.agreement.listingFeeMinor)} · recurring {euro(shop.agreement.recurringFeeMinor)} {shop.agreement.recurringFeePeriod ?? ""}</span></div>
        {slaPolicy && <div className="workspace-compact-row"><strong>Order SLA</strong><span>{slaPolicy.acceptanceMinutes} min acceptance · {slaPolicy.preparationMinutes} min preparation</span><small>{slaPolicy.configured ? `Configured · warning ${slaPolicy.warningPercent}% · email ${slaPolicy.emailReminderPercent}%` : "Fallback policy"}</small></div>}
      </div> : <div className="workspace-inline-note">Δεν υπάρχει cooperation agreement record για αυτό το partner.</div>}
      {agreementRenewalEligible && <div id="partner-renewal">
        {renewableAgreement && shop.agreement?.endsAt ? <WorkspaceRecordDetails label={agreementExpired ? "Renewal / extension required" : "Renewal / extension"} open={agreementExpired}><VendorAgreementRenewalForm vendorId={shop.id} agreementId={shop.agreement.id} agreementCode={shop.agreement.code} currentEndsAt={shop.agreement.endsAt} csrfToken={managed.csrfToken} /></WorkspaceRecordDetails> : <div className="workspace-inline-note"><strong>Renewal / extension is available.</strong> A Finance write permission is required to create the successor agreement.</div>}
      </div>}
      <WorkspaceRecordDetails label="Contract workflow"><VendorAgreementForm vendorId={shop.id} csrfToken={managed.csrfToken} defaults={shop.agreement ? { code: shop.agreement.code, commissionRateBps: shop.agreement.commissionRateBps, listingFeeMinor: shop.agreement.listingFeeMinor, recurringFeeMinor: shop.agreement.recurringFeeMinor, recurringFeePeriod: shop.agreement.recurringFeePeriod, sourceDocumentReference: shop.agreement.sourceDocumentReference } : undefined} /></WorkspaceRecordDetails>
      {shop.agreement && !shop.agreement.endsAt && <div className="workspace-inline-note">This agreement is open-ended, so no extension is required. Use the governed replacement/termination workflow if the commercial terms need to change.</div>}
      {canFinance && <div className="workspace-action-bar"><span>Finance and Tax are hand-off workspaces, not duplicated sections of this record.</span><div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/finance/agreements">Agreements</Link><Link className="button button-secondary" href="/admin/finance/agreements/sla">SLA policies</Link><Link className="text-link" href="/admin/finance/vendor-billing">Vendor billing →</Link><Link className="text-link" href="/admin/tax">Tax & myDATA →</Link></div></div>}
    </section>

    <section id="partner-activity" className="shell vendor-section admin-anchor-section"><WorkspaceSectionHeading eyebrow="Activity" title="Record context" note="High-signal lifecycle context stays visible here; the full cross-platform audit trail remains in Platform → System Health & Audit." /><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Current lifecycle state</strong><span>{stateLabel(shop.status)}</span></div><div className="workspace-compact-row"><strong>Linked application state</strong><span>{shop.applicationState ? stateLabel(shop.applicationState) : "—"}</span></div><div className="workspace-compact-row"><strong>Agreement records</strong><span>{shop.agreementCount}</span></div><div className="workspace-compact-row"><strong>Visibility evidence</strong><span>{shop.publicDirectoryVisibilityUpdatedAt ? new Date(shop.publicDirectoryVisibilityUpdatedAt).toLocaleString("el-GR") : "—"}</span></div></div>{hasAdminPermission(principal, "admin.audit.read") && <div className="workspace-action-bar"><span>Need the full audited system history?</span><div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/operations">System Health & Audit</Link></div></div>}</section>
  </main>;
}
