import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceFilterBar, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../components/WorkspacePagePrimitives";
import { adminMatchingWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Product Matching", robots: { index: false, follow: false } };
type PageSearchParams = Promise<{ q?: string | string[]; status?: string | string[] }>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminMatchingWorkspace(principal);
  const params = await searchParams;
  const query = one(params.q).trim();
  const status = one(params.status) || "all";
  const needle = query.toLocaleLowerCase("el");
  const review = data.submissions.filter((item) => ["submitted", "needs_review"].includes(item.status)).length;
  const candidateActions = data.submissions.reduce((total, item) => total + item.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status)).length, 0);
  const linked = data.submissions.filter((item) => Boolean(item.canonicalVariantId)).length;
  const offerReady = data.submissions.filter((item) => item.canonicalVariantId && ["linked", "approved"].includes(item.status)).length;
  const statusOptions = [...new Set(data.submissions.map((item) => item.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "el"));
  const filtered = data.submissions
    .filter((submission) => {
      if (status !== "all" && submission.status !== status) return false;
      if (!needle) return true;
      return [submission.title, submission.categoryCode, submission.vendorId, submission.id, submission.canonicalVariantId, submission.status, ...submission.candidates.flatMap((candidate) => [candidate.canonicalVariantId, candidate.level, candidate.status])]
        .filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => {
      const aActions = a.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status)).length;
      const bActions = b.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status)).length;
      const aReview = ["submitted", "needs_review"].includes(a.status) ? 1 : 0;
      const bReview = ["submitted", "needs_review"].includes(b.status) ? 1 : 0;
      return bActions - aActions || bReview - aReview || a.title.localeCompare(b.title, "el");
    });

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Canonical catalog governance</div><h1>Product Matching Centre</h1><p className="lead">Δες πρώτα submissions που περιμένουν platform απόφαση. Τα source προϊόντα παραμένουν ιδιωτικά μέχρι match και offer approval.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Submissions", value: data.submissions.length },
      { label: "Needs review", value: review, tone: review ? "attention" : "default" },
      { label: "Candidate decisions", value: candidateActions, tone: candidateActions ? "attention" : "default" },
      { label: "Linked", value: linked, tone: linked ? "positive" : "default", hint: `${offerReady} ready for offer review` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Matching queue" title="Αποφάσεις καταλόγου" note="Candidate decisions ταξινομούνται πρώτα. Evidence ανοίγει μόνο όταν το χρειάζεσαι." />
      <WorkspaceFilterBar
        action="/admin/matching"
        query={query}
        queryPlaceholder="Τίτλος, category, vendor, canonical ID…"
        filters={[{ name: "status", label: "Κατάσταση", value: status, options: [{ value: "all", label: "Όλες" }, ...statusOptions.map((value) => ({ value, label: value.replaceAll("_", " ") }))] }]}
        resultLabel={`${filtered.length} από ${data.submissions.length} submissions`}
        resetHref="/admin/matching"
      />
      {data.submissions.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν source products για matching." body="Νέα vendor submissions θα εμφανιστούν εδώ χωρίς να δημοσιεύονται αυτόματα." /> : filtered.length === 0 ? <WorkspaceEmptyState eyebrow="Δεν βρέθηκαν αποτελέσματα" title="Κανένα submission δεν ταιριάζει στα φίλτρα." action={<a className="button button-secondary" href="/admin/matching">Καθαρισμός φίλτρων</a>} /> : <div className="workspace-queue-list">
        {filtered.map((submission) => {
          const actionableCandidates = submission.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status));
          return <article className="workspace-queue-card" key={submission.id}>
            <div className="workspace-queue-head">
              <div><strong>{submission.title}</strong><small>{submission.categoryCode} · Supplier {submission.supplierPrice}</small></div>
              <WorkspaceStatusBadge status={submission.status} />
            </div>
            <div className="workspace-queue-primary">
              <span>{submission.candidates.length} candidates</span>
              <span>{submission.canonicalVariantId ? "Linked canonical" : "Unlinked"}</span>
              {actionableCandidates.length > 0 && <span>{actionableCandidates.length} decisions</span>}
            </div>
            <WorkspaceRecordDetails label="Candidate evidence & source identifiers" open={actionableCandidates.length === 1}>
              <div className="workspace-compact-list">
                <div className="workspace-compact-row"><strong>Source</strong><span>{submission.vendorId} · {submission.id}</span></div>
                {submission.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{submission.canonicalVariantId}</span></div>}
                {submission.candidates.length ? submission.candidates.map((candidate) => <div className="workspace-compact-row" key={candidate.id}><strong>{candidate.canonicalVariantId}</strong><span>{candidate.level} · {Math.round(candidate.confidence * 100)}% confidence</span><small>{candidate.status}</small></div>) : <div className="workspace-compact-row"><strong>Δεν υπάρχει ενεργός candidate</strong><span>Μπορεί να χρειάζεται δημιουργία νέου canonical variant.</span></div>}
              </div>
            </WorkspaceRecordDetails>
            <div className="workspace-action-bar">
              <span>{submission.canonicalVariantId ? `Linked: ${submission.canonicalVariantId}` : "Δεν έχει συνδεθεί canonical variant."}</span>
              <div className="workspace-action-buttons">
                {actionableCandidates.map((candidate) => <span key={candidate.id} className="workspace-action-buttons"><AdminActionButton label="Approve match" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "approve_match", id: candidate.id }} reasonPrompt="Match approval reason" /><AdminActionButton label="Reject match" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "reject_match", id: candidate.id }} reasonPrompt="Match rejection reason" danger /></span>)}
                {submission.canonicalVariantId && ["linked", "approved"].includes(submission.status) && <AdminActionButton label="Approve offer" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "approve_offer", id: submission.id }} reasonPrompt="Offer approval reason" />}
                {!submission.canonicalVariantId && ["submitted", "needs_review", "linked"].includes(submission.status) && <AdminActionButton label="Create canonical" endpoint="/api/admin/catalog/canonical" csrfToken={data.csrfToken} body={{ submissionId: submission.id }} reasonPrompt="Canonical creation reason" extraPrompt={{ field: "platformPriceMinor", message: "Platform retail price in euro cents" }} />}
              </div>
            </div>
          </article>;
        })}
      </div>}
    </section>
  </main>;
}
