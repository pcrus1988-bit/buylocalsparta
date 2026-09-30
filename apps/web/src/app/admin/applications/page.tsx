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
import { hubProspectDisplayReference } from "../../../lib/hub-prospect-application-runtime";
import { advanceApplicationToVerification, provisionHubProspectTrialAction, setApplicationDemoMode, setHubProspectStatus } from "./actions";

export const metadata: Metadata = { title: "Admin · Applications", robots: { index: false, follow: false } };

const PRE_LIVE = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);
const fmtDate = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
const fmtMoney = (value: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(value / 100);
const OPEN_HUB_STATUSES = new Set(["pending", "contacted", "qualified", "verified", "approved"]);

function hubNextStatus(status: string): { status: string; label: string } | undefined {
  switch (status) {
    case "pending": return { status: "contacted", label: "Mark contacted" };
    case "contacted": return { status: "qualified", label: "Qualify" };
    case "qualified": return { status: "verified", label: "Verify" };
    case "verified": return { status: "approved", label: "Approve" };
    case "approved": return { status: "converted", label: "Move to onboarding" };
    case "declined": return { status: "contacted", label: "Re-open" };
    default: return undefined;
  }
}

type VendorProjectionRow = SqlRow & {
  public_id: string;
  status: string;
  demo_mode: boolean;
};

type RegistryProjectionRow = SqlRow & {
  public_id: string;
  tax_number: string;
  gemi_number: string | null;
  registry_lookup_status: string;
  registry_company_status: string | null;
  contact_email_source: string;
  phone_source: string;
  registry_checked_at: Date | string | null;
};

type HubProspectRow = SqlRow & {
  public_id: string;
  hub_slug: string;
  hub_city: string;
  hub_region: string;
  plan_code: string;
  billing_cycle: string;
  tax_number: string;
  gemi_number: string | null;
  business_name: string;
  legal_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line: string;
  postal_code: string;
  primary_category: string;
  website_url: string | null;
  current_sales_channels: string | null;
  notes: string | null;
  status: string;
  payment_state: string;
  setup_fee_cents: number;
  recurring_fee_cents: number;
  commission_bps: number;
  created_at: Date | string;
  updated_at: Date | string;
  trial_vendor_public_id: string | null;
  trial_demo_mode: boolean | null;
  trial_started_at: string | null;
  trial_expires_at: string | null;
};

type DemoProjection = { status: string; demoMode: boolean };
type RegistryProjection = {
  taxNumber: string;
  gemiNumber?: string;
  lookupStatus: string;
  companyStatus?: string;
  emailSource: string;
  phoneSource: string;
  checkedAt?: number;
};
type HubProspectProjection = {
  internalId: string;
  reference: string;
  hubSlug: string;
  hubCity: string;
  hubRegion: string;
  planCode: string;
  billingCycle: string;
  taxNumber: string;
  gemiNumber?: string;
  businessName: string;
  legalName: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  primaryCategory: string;
  websiteUrl?: string;
  currentSalesChannels?: string;
  notes?: string;
  status: string;
  paymentState: string;
  setupFeeCents: number;
  recurringFeeCents: number;
  commissionBps: number;
  createdAt: number;
  updatedAt: number;
  trialVendorId?: string;
  trialDemoMode: boolean;
  trialStartedAt?: number;
  trialExpiresAt?: number;
};

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
  const registryByApplication = new Map<string, RegistryProjection>();
  const hubProspects: HubProspectProjection[] = [];
  if (productionDatabaseConfigured()) {
    const runtime = getProductionPostgresRuntime();
    const [demoResult, registryResult, hubProspectResult] = await Promise.all([
      runtime.sqlPool.query<VendorProjectionRow>(`
        SELECT vb.public_id,vb.status::text AS status,vb.demo_mode
        FROM vendor_businesses vb
        JOIN markets m ON m.id=vb.market_id
        WHERE m.code='sparta'
          AND vb.status IN ('application_started','verification_pending','catalog_onboarding','test_ready')
        ORDER BY vb.updated_at DESC
      `),
      runtime.sqlPool.query<RegistryProjectionRow>(`
        SELECT va.public_id,va.tax_number,va.gemi_number,va.registry_lookup_status,va.registry_company_status,
               va.contact_email_source,va.phone_source,va.registry_checked_at
        FROM vendor_applications va
        JOIN markets m ON m.id=va.market_id
        WHERE m.code='sparta'
          AND va.status IN ('application_started','verification_pending','catalog_onboarding','test_ready')
        ORDER BY va.updated_at DESC
      `),
      runtime.sqlPool.query<HubProspectRow>(`
        SELECT h.public_id,h.hub_slug,h.hub_city,h.hub_region,h.plan_code,h.billing_cycle,h.tax_number,h.gemi_number,
               h.business_name,h.legal_name,h.contact_name,h.email,h.phone,h.address_line,h.postal_code,h.primary_category,
               h.website_url,h.current_sales_channels,h.notes,h.status,h.payment_state,h.setup_fee_cents,h.recurring_fee_cents,
               h.commission_bps,h.created_at,h.updated_at,
               trial.public_id AS trial_vendor_public_id,
               trial.demo_mode AS trial_demo_mode,
               trial.storefront_settings->>'trialStartedAt' AS trial_started_at,
               trial.storefront_settings->>'trialExpiresAt' AS trial_expires_at
        FROM hub_expansion_prospects h
        LEFT JOIN LATERAL (
          SELECT v.public_id,v.demo_mode,v.storefront_settings
          FROM vendor_businesses v
          WHERE v.storefront_settings->>'trialSource'='hub_prospect'
            AND v.storefront_settings->>'trialApplicationId'=h.public_id
          ORDER BY v.created_at DESC
          LIMIT 1
        ) trial ON true
        ORDER BY h.created_at DESC
        LIMIT 250
      `)
    ]);
    for (const row of demoResult.rows) demoByVendor.set(row.public_id, { status: row.status, demoMode: Boolean(row.demo_mode) });
    for (const row of registryResult.rows) {
      const checkedAt = row.registry_checked_at ? Date.parse(String(row.registry_checked_at)) : Number.NaN;
      registryByApplication.set(row.public_id, {
        taxNumber: row.tax_number,
        gemiNumber: row.gemi_number || undefined,
        lookupStatus: row.registry_lookup_status,
        companyStatus: row.registry_company_status || undefined,
        emailSource: row.contact_email_source,
        phoneSource: row.phone_source,
        checkedAt: Number.isFinite(checkedAt) ? checkedAt : undefined
      });
    }
    for (const row of hubProspectResult.rows) {
      const createdAt = Date.parse(String(row.created_at));
      const trialStartedAt = row.trial_started_at ? Number(row.trial_started_at) : Number.NaN;
      const trialExpiresAt = row.trial_expires_at ? Number(row.trial_expires_at) : Number.NaN;
      hubProspects.push({
        internalId: row.public_id,
        reference: hubProspectDisplayReference(row.public_id, row.hub_slug, createdAt),
        hubSlug: row.hub_slug,
        hubCity: row.hub_city,
        hubRegion: row.hub_region,
        planCode: row.plan_code,
        billingCycle: row.billing_cycle,
        taxNumber: row.tax_number,
        gemiNumber: row.gemi_number || undefined,
        businessName: row.business_name,
        legalName: row.legal_name,
        contactName: row.contact_name,
        email: row.email,
        phone: row.phone,
        addressLine: row.address_line,
        postalCode: row.postal_code,
        primaryCategory: row.primary_category,
        websiteUrl: row.website_url || undefined,
        currentSalesChannels: row.current_sales_channels || undefined,
        notes: row.notes || undefined,
        status: row.status,
        paymentState: row.payment_state,
        setupFeeCents: Number(row.setup_fee_cents),
        recurringFeeCents: Number(row.recurring_fee_cents),
        commissionBps: Number(row.commission_bps),
        createdAt,
        updatedAt: Date.parse(String(row.updated_at)),
        trialVendorId: row.trial_vendor_public_id || undefined,
        trialDemoMode: row.trial_demo_mode === true,
        trialStartedAt: Number.isFinite(trialStartedAt) ? trialStartedAt : undefined,
        trialExpiresAt: Number.isFinite(trialExpiresAt) ? trialExpiresAt : undefined
      });
    }
  }

  const unlinked = formalApplications.filter((application) => !application.vendorId).length;
  const verificationPending = formalApplications.filter((application) => application.state === "verification_pending").length;
  const demoEnabled = [...demoByVendor.values()].filter((vendor) => vendor.demoMode).length;
  const registryMatched = [...registryByApplication.values()].filter((registry) => registry.lookupStatus === "matched").length;
  const pendingHubApplications = hubProspects.filter((prospect) => prospect.status === "pending").length;
  const openHubApplications = hubProspects.filter((prospect) => OPEN_HUB_STATUSES.has(prospect.status)).length;
  const totalQueue = formalApplications.length + openHubApplications + promotedResearch.length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={applicationWorkspace.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Partners · governed intake</div>
        <h1>Applications</h1>
        <p className="lead">The operational inbox between acquisition and onboarding. ΓΕΜΗ enrichment now separates legal-business identity evidence from applicant ownership/contact verification; DEMO preparation remains strictly pre-live.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/partners/pipeline">← Partner pipeline</Link>
          <Link className="button button-secondary" href="/admin/research-vendors">Research vendors</Link>
          <Link className="text-link" href="/admin/vendors">Partner directory →</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Application queue", value: totalQueue, tone: totalQueue ? "attention" : "default" },
      { label: "HUB applications", value: hubProspects.length, tone: pendingHubApplications ? "attention" : "default", hint: `${pendingHubApplications} pending` },
      { label: "Inbound not provisioned", value: unlinked, tone: unlinked ? "attention" : "positive", hint: "A pre-live vendor record is created only when needed" },
      { label: "Verification pending", value: verificationPending },
      { label: "ΓΕΜΗ matched", value: registryMatched, tone: registryMatched ? "positive" : "default", hint: "Legal identity matched; representation still requires verification" },
      { label: "DEMO enabled", value: demoEnabled, tone: demoEnabled ? "positive" : "default", hint: "Never commerce eligible" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Inbound applications" title="Merchant-submitted applications" note="A just-submitted merchant application appears here immediately. ΓΕΜΗ match state and contact provenance guide verification; enabling DEMO provisions the linked pre-live vendor without activating commerce." />
      {formalApplications.length === 0 ? <WorkspaceEmptyState title="No inbound applications require action." body="New merchant applications will appear here at application_started and remain visible through the pre-live onboarding stages." /> : <div className="workspace-queue-list">
        {formalApplications.map((application) => {
          const demo = application.vendorId ? demoByVendor.get(application.vendorId) : undefined;
          const registry = registryByApplication.get(application.id);
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
            {registry && <div className="workspace-inline-note">
              <strong>ΓΕΜΗ: {registry.lookupStatus === "matched" ? "matched ✓" : registry.lookupStatus === "not_found" ? "not found · manual check" : registry.lookupStatus === "unavailable" ? "unavailable · manual check" : "not checked"}</strong>
              {` · ΑΦΜ ${registry.taxNumber}`}{registry.gemiNumber ? ` · ΓΕΜΗ ${registry.gemiNumber}` : ""}{registry.companyStatus ? ` · ${registry.companyStatus}` : ""}
              {` · email ${registry.emailSource} · phone ${registry.phoneSource}`}{registry.checkedAt ? ` · checked ${fmtDate(registry.checkedAt)}` : ""}
            </div>}
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
      <WorkspaceSectionHeading eyebrow="Hub expansion" title="Applications from /hubs/join" note="HUB applications are part of the operational intake queue. Every card now carries the readable application number, subscription snapshot, Trial state and the next governed Admin action." />
      {hubProspects.length === 0 ? <WorkspaceEmptyState title="No HUB applications have been submitted yet." body="New /hubs/join submissions will appear here immediately after they are stored." /> : <div className="workspace-queue-list">
        {hubProspects.map((prospect) => {
          const next = hubNextStatus(prospect.status);
          const trialActive = Boolean(prospect.trialExpiresAt && prospect.trialExpiresAt > Date.now() && prospect.trialDemoMode);
          return <article className="workspace-queue-card" id={`hub-application-${prospect.reference}`} key={prospect.reference}>
            <div className="workspace-queue-head">
              <div>
                <strong>{prospect.businessName}</strong>
                <small>{prospect.legalName} · {prospect.email}</small>
                <small><strong>{prospect.reference}</strong></small>
              </div>
              <WorkspaceStatusBadge status={prospect.status} />
            </div>

            <div className="workspace-queue-primary">
              <span>{prospect.hubCity} · {prospect.hubRegion}</span>
              <span>Plan {prospect.planCode.toUpperCase()} · {prospect.billingCycle}</span>
              <span>{prospect.primaryCategory}</span>
              <span>{prospect.phone}</span>
            </div>

            <div className="workspace-inline-note">
              <strong>Subscription snapshot</strong>
              {` · setup ${fmtMoney(prospect.setupFeeCents)} · recurring ${prospect.planCode === "claim" ? "free" : fmtMoney(prospect.recurringFeeCents)} · commission ${(prospect.commissionBps / 100).toFixed(2)}% · payment ${prospect.paymentState}`}
            </div>
            <div className="workspace-inline-note">
              <strong>HUB {prospect.hubSlug}</strong>{` · ΑΦΜ ${prospect.taxNumber}`}{prospect.gemiNumber ? ` · ΓΕΜΗ ${prospect.gemiNumber}` : ""}
            </div>
            <p className="workspace-queue-summary">{prospect.notes ?? prospect.currentSalesChannels ?? "No additional application notes supplied."}</p>
            <div className="workspace-inline-note">Contact: <strong>{prospect.contactName}</strong> · {prospect.addressLine} · {prospect.postalCode}{prospect.websiteUrl ? ` · ${prospect.websiteUrl}` : ""}</div>

            <div className="workspace-inline-note">
              <strong>3-day Trial:</strong>{" "}
              {prospect.trialVendorId
                ? trialActive
                  ? `ACTIVE · expires ${fmtDate(prospect.trialExpiresAt!)}`
                  : `Provisioned · ${prospect.trialExpiresAt ? `expired ${fmtDate(prospect.trialExpiresAt)}` : "expiry unavailable"}`
                : "Not provisioned yet for this older application."}
            </div>

            <div className="workspace-action-bar">
              <span>Received {fmtDate(prospect.createdAt)} · updated {fmtDate(prospect.updatedAt)}</span>
              <div className="workspace-action-buttons">
                {prospect.trialVendorId && <Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(prospect.trialVendorId)}/catalogue`}>Trial catalogue</Link>}
                {prospect.trialVendorId && <Link className="button button-secondary" href={`/demo/vendor/${encodeURIComponent(prospect.trialVendorId)}`} target="_blank">Private preview ↗</Link>}
              </div>
            </div>

            <form action={provisionHubProspectTrialAction} className="admin-directory-filters" style={{ marginTop: 12 }}>
              <input type="hidden" name="csrfToken" value={applicationWorkspace.csrfToken} />
              <input type="hidden" name="applicationId" value={prospect.internalId} />
              <input type="hidden" name="reason" value="Create or resend private 3-day Trial access from Admin Applications" />
              <button className="button" type="submit">{prospect.trialVendorId ? "Resend Trial access email" : "Create Trial & send email"}</button>
            </form>

            {next && <form action={setHubProspectStatus} className="admin-directory-filters" style={{ marginTop: 12 }}>
              <input type="hidden" name="csrfToken" value={applicationWorkspace.csrfToken} />
              <input type="hidden" name="applicationId" value={prospect.internalId} />
              <input type="hidden" name="status" value={next.status} />
              <label><span>Workflow note</span><input name="reason" defaultValue={`Admin review: ${prospect.status} → ${next.status}`} minLength={3} maxLength={500} required /></label>
              <button className="button button-secondary" type="submit">{next.label}</button>
            </form>}

            {!["declined", "converted"].includes(prospect.status) && <form action={setHubProspectStatus} className="admin-directory-filters" style={{ marginTop: 8 }}>
              <input type="hidden" name="csrfToken" value={applicationWorkspace.csrfToken} />
              <input type="hidden" name="applicationId" value={prospect.internalId} />
              <input type="hidden" name="status" value="declined" />
              <label><span>Decline reason</span><input name="reason" placeholder="Reason sent to applicant…" minLength={3} maxLength={500} required /></label>
              <button className="button button-secondary" type="submit">Decline</button>
            </form>}
          </article>;
        })}
      </div>}
    </div></section>

    <section className="shell vendor-section">
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
    </section>
  </main>;
}
