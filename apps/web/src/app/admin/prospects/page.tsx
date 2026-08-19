import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { verifiedProspectsWorkspace } from "../../../lib/prospect-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Prospects", robots: { index: false, follow: false } };

const stateLabel = (state: string) => ({
  verification_pending: "Επανέλεγχος",
  catalog_onboarding: "Κατάλογος / onboarding",
  test_ready: "Έτοιμο για test",
  restricted: "Περιορισμένο",
  suspended: "Απενεργοποιημένο",
  closed: "Κλειστό"
}[state] ?? state.replaceAll("_", " "));

export default async function ProspectsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await verifiedProspectsWorkspace(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Verified pipeline · application passed verification</div>
        <h1>Prospects</h1>
        <p className="lead">Μόλις μια επίσημη αίτηση περάσει verification, παύει να είναι pending application και μεταφέρεται εδώ ως verified prospect. Από εδώ συνεχίζονται contract, catalog/test readiness και τελική activation.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Νέες αιτήσεις</Link>
          <Link className="button button-secondary" href="/admin/research-vendors">Research leads</Link>
          <Link className="text-link" href="/admin/finance/agreements">Vendor agreements →</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Verified prospects", value: data.summary.total },
      { label: "Catalog onboarding", value: data.summary.catalog, tone: data.summary.catalog ? "attention" : "default" },
      { label: "Test ready", value: data.summary.testReady },
      { label: "Contract ready", value: data.summary.contractReady, tone: data.summary.contractReady ? "positive" : "default", hint: `${data.summary.restricted} restricted / suspended / closed` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Post-verification pipeline"
        title="Verified prospects & onboarding"
        note="Verification creates/links the internal vendor record but does not activate or publish the shop. Contract evidence, catalog readiness, test readiness and activation remain separate gates."
      />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη.</div>}
      {data.prospects.length === 0 ? <WorkspaceEmptyState
        eyebrow="No verified prospects"
        title="Δεν υπάρχουν prospects μετά το verification."
        body="Οι νέες αιτήσεις παραμένουν στην ουρά αιτήσεων μέχρι να πατήσεις Pass verification."
        action={<Link className="button button-secondary" href="/admin/vendors">Άνοιγμα αιτήσεων</Link>}
      /> : <div className="workspace-queue-list">{data.prospects.map((prospect) => <article className="workspace-queue-card" key={prospect.applicationId}>
        <div className="workspace-queue-head">
          <div><strong>{prospect.tradingName}</strong><small>{prospect.legalName} · {prospect.id}</small></div>
          <span className="status-pill">{stateLabel(prospect.applicationState)}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{prospect.postcode ?? "—"}</span>
          <span>{prospect.requestedPlanCode}</span>
          <span>{prospect.contactEmail}</span>
          <span>{prospect.activeLocationCount}/{prospect.locationCount} active locations</span>
        </div>
        {prospect.verificationNotes && <p className="workspace-queue-summary">Verification: {prospect.verificationNotes}</p>}

        <WorkspaceRecordDetails label="Prospect readiness">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Application</strong><span>{prospect.applicationId} · {stateLabel(prospect.applicationState)}</span></div>
            <div className="workspace-compact-row"><strong>Vendor record</strong><span>{prospect.id} · verified internal record</span></div>
            <div className="workspace-compact-row"><strong>Contract gate</strong><span>{prospect.agreementReady ? `Ready · ${prospect.agreementCode ?? prospect.agreementId ?? "documented"} · ${prospect.agreementStatus ?? "verified"}` : prospect.agreementStatus ? `Not ready · ${prospect.agreementCode ?? prospect.agreementId ?? "agreement"} · ${prospect.agreementStatus}` : "Not started"}</span></div>
            <div className="workspace-compact-row"><strong>Public directory</strong><span>{prospect.publicDirectoryVisible ? "Visible" : "Hidden until explicit publication"}</span></div>
            <div className="workspace-compact-row"><strong>VAT / ΓΕΜΗ</strong><span>{prospect.taxNumber ?? "—"} · {prospect.gemiNumber ?? "—"}</span></div>
          </div>
        </WorkspaceRecordDetails>

        {prospect.applicationState === "test_ready" && !prospect.agreementReady && <div className="workspace-inline-note">Test readiness is complete, but activation remains blocked until the signed PDF + gov.gr reference + Admin verification is complete.</div>}

        <div className="workspace-action-bar">
          <span>Next governed action: <strong>{stateLabel(prospect.applicationState)}</strong></span>
          <div className="workspace-action-buttons">
            {prospect.applicationState === "verification_pending" && <AdminActionButton label="Pass verification" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Verification reason / evidence" />}
            {prospect.applicationState === "catalog_onboarding" && <AdminActionButton label="Mark test ready" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "test_ready" }} reasonPrompt="Test-ready evidence" />}
            {prospect.applicationState === "test_ready" && prospect.agreementReady && <AdminActionButton label="Activate shop (hidden)" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Final activation approval reason" />}
            {prospect.applicationState === "test_ready" && !prospect.agreementReady && <Link className="button button-secondary" href={`/admin/finance/agreements?vendorId=${encodeURIComponent(prospect.id)}`}>Complete contract workflow</Link>}
            {prospect.applicationState === "restricted" && <AdminActionButton label="Resume catalog" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Reason for resuming catalog onboarding" />}
            {prospect.applicationState === "restricted" && prospect.agreementReady && <AdminActionButton label="Activate (hidden)" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Final activation approval reason" />}
            {prospect.applicationState === "suspended" && prospect.agreementReady && <AdminActionButton label="Reactivate (hidden)" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Reactivation reason" />}
            {prospect.applicationState === "suspended" && !prospect.agreementReady && <Link className="button button-secondary" href={`/admin/finance/agreements?vendorId=${encodeURIComponent(prospect.id)}`}>Restore contract gate</Link>}
            {["catalog_onboarding", "test_ready"].includes(prospect.applicationState) && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
            {prospect.applicationState !== "closed" && <AdminActionButton label="Close" endpoint={`/api/admin/vendors/${prospect.applicationId}/transition`} csrfToken={data.csrfToken} body={{ to: "closed" }} reasonPrompt="Permanent closure reason" danger />}
            <AdminActionButton label="Delete application" endpoint={`/api/admin/vendors/${prospect.applicationId}/delete`} csrfToken={data.csrfToken} reasonPrompt="Permanent deletion reason" extraPrompt={{ field: "confirmation", message: `Permanent database deletion. Type the exact application ID to confirm:\n${prospect.applicationId}` }} danger />
          </div>
        </div>
      </article>)}</div>}
    </section>
  </main>;
}
