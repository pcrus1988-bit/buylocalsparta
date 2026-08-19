import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceFilterBar, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../components/WorkspacePagePrimitives";
import { adminVendorsWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendors", robots: { index: false, follow: false } };

type PageSearchParams = Promise<{ q?: string | string[]; status?: string | string[] }>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

const stateLabel = (state: string) => ({
  verification_pending: "Σε επαλήθευση",
  catalog_onboarding: "Κατάλογος",
  test_ready: "Έτοιμο για test",
  active: "Ενεργό",
  restricted: "Περιορισμένο",
  closed: "Κλειστό",
  draft: "Draft"
}[state] ?? state.replaceAll("_", " "));

const stagePriority: Record<string, number> = {
  verification_pending: 0,
  catalog_onboarding: 1,
  test_ready: 2,
  restricted: 3,
  draft: 4,
  active: 5,
  closed: 6
};

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminVendorsWorkspace(principal);
  const params = await searchParams;
  const query = one(params.q).trim();
  const status = one(params.status) || "all";
  const needle = query.toLocaleLowerCase("el");

  const verification = data.applications.filter((item) => item.state === "verification_pending").length;
  const onboarding = data.applications.filter((item) => ["catalog_onboarding", "test_ready"].includes(item.state)).length;
  const active = data.applications.filter((item) => item.state === "active").length;
  const restricted = data.applications.filter((item) => ["restricted", "closed"].includes(item.state)).length;
  const filtered = data.applications
    .filter((application) => {
      if (status !== "all" && application.state !== status) return false;
      if (!needle) return true;
      return [application.tradingName, application.legalName, application.primaryCategory, application.postcode, application.requestedPlanCode, application.contactEmail, application.taxNumber, application.state]
        .filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => (stagePriority[a.state] ?? 99) - (stagePriority[b.state] ?? 99) || a.tradingName.localeCompare(b.tradingName, "el"));

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Vendor onboarding</div>
        <h1>Αιτήσεις συνεργατών</h1>
        <p className="lead">Έλεγξε πρώτα ό,τι περιμένει απόφαση και προχώρησε μόνο στο επιτρεπτό επόμενο στάδιο.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/research-vendors">Research queue</Link><Link className="text-link" href="/admin/categories">Κατηγορίες →</Link></div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Σε επαλήθευση", value: verification, tone: verification ? "attention" : "default", hint: "χρειάζονται KYB έλεγχο" },
      { label: "Onboarding", value: onboarding, hint: "catalog / test-ready" },
      { label: "Ενεργοί", value: active, tone: active ? "positive" : "default" },
      { label: "Restricted / closed", value: restricted }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Onboarding queue" title="Επόμενες ενέργειες" note="Οι ενεργές αποφάσεις εμφανίζονται πρώτες. Verification, catalog onboarding και test-ready δεν παρακάμπτονται." />
      <WorkspaceFilterBar
        action="/admin/vendors"
        query={query}
        queryPlaceholder="Επωνυμία, email, ΑΦΜ, κατηγορία…"
        filters={[{
          name: "status",
          label: "Στάδιο",
          value: status,
          options: [
            { value: "all", label: "Όλα τα στάδια" },
            { value: "verification_pending", label: "Σε επαλήθευση" },
            { value: "catalog_onboarding", label: "Catalog onboarding" },
            { value: "test_ready", label: "Test ready" },
            { value: "active", label: "Ενεργοί" },
            { value: "restricted", label: "Περιορισμένοι" },
            { value: "draft", label: "Draft" },
            { value: "closed", label: "Κλειστοί" }
          ]
        }]}
        resultLabel={`${filtered.length} από ${data.applications.length} αιτήσεις`}
        resetHref="/admin/vendors"
      />
      {data.applications.length === 0 ? <WorkspaceEmptyState
        eyebrow="Καμία επίσημη αίτηση"
        title="Δεν υπάρχει ακόμη αίτηση για έλεγχο."
        body="Τα research prospects παραμένουν ξεχωριστά μέχρι να δημιουργηθεί merchant-owned application record."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Άνοιγμα research queue</Link>}
      /> : filtered.length === 0 ? <WorkspaceEmptyState
        eyebrow="Δεν βρέθηκαν αποτελέσματα"
        title="Κανένα application δεν ταιριάζει στα φίλτρα."
        action={<Link className="button button-secondary" href="/admin/vendors">Καθαρισμός φίλτρων</Link>}
      /> : <div className="workspace-queue-list">{filtered.map((application) => <article className="workspace-queue-card" key={application.id}>
        <div className="workspace-queue-head">
          <div><strong>{application.tradingName}</strong><small>{application.legalName} · {application.primaryCategory}</small></div>
          <WorkspaceStatusBadge status={application.state} label={stateLabel(application.state)} />
        </div>
        <div className="workspace-queue-primary">
          <span>{application.postcode}</span>
          <span>{application.requestedPlanCode}</span>
          {application.contactEmail && <span>{application.contactEmail}</span>}
        </div>
        {application.verificationNotes && <p className="workspace-queue-summary">{application.verificationNotes}</p>}
        <WorkspaceRecordDetails label="Στοιχεία αίτησης & τεκμηρίωση">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Application ID</strong><span>{application.id}</span></div>
            <div className="workspace-compact-row"><strong>Tax number</strong><span>{application.taxNumber ?? "—"}</span></div>
            <div className="workspace-compact-row"><strong>Shop story</strong><span>{application.shopStory ?? "Δεν έχει καταχωρηθεί ακόμη."}</span></div>
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>Τρέχον στάδιο: <strong>{stateLabel(application.state)}</strong></span>
          <div className="workspace-action-buttons">
            {application.state === "verification_pending" && <AdminActionButton label="Pass verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Verification reason" />}
            {application.state === "catalog_onboarding" && <AdminActionButton label="Mark test ready" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "test_ready" }} reasonPrompt="Test-ready evidence" />}
            {application.state === "test_ready" && <AdminActionButton label="Activate" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Activation approval reason" />}
            {!['closed', 'active'].includes(application.state) && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
          </div>
        </div>
      </article>)}</div>}
    </section>
  </main>;
}
