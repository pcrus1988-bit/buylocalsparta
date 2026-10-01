import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminBulkCatalogApproval } from "../../../components/AdminBulkCatalogApproval";
import { AdminProductLifecycleActions } from "../../../components/AdminProductLifecycleActions";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminMatchingWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendor Matching", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; submission?: string; page?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const query = params.q?.trim();
  const status = params.status?.trim();
  const pageNumber = Math.max(1, Math.floor(Number(params.page ?? "1")) || 1);
  const pageSize = 60;
  const requestedSubmissionId = params.submission?.trim() || undefined;
  const data = await adminMatchingWorkspace(principal,{ q:query, status, submissionId:requestedSubmissionId, limit:pageSize, offset:(pageNumber-1)*pageSize });
  const filteredSubmissions = data.submissions;
  const statuses = data.statuses;
  const selected = data.requestedSubmission
    ?? filteredSubmissions.find((item) => item.id === requestedSubmissionId)
    ?? filteredSubmissions.find((item) => ["submitted", "needs_review"].includes(item.status) || item.candidates.some((candidate) => ["pending", "auto_linked"].includes(candidate.status)))
    ?? filteredSubmissions[0];
  const review = data.metrics.review;
  const candidateActions = data.metrics.candidateActions;
  const linked = data.metrics.linked;
  const offerReady = data.metrics.offerReady;
  const bulkApprovalIds = filteredSubmissions.filter((item) => ["submitted", "needs_review", "linked"].includes(item.status)).map((item) => item.id);
  const hrefFor = (submissionId: string) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (status) search.set("status", status);
    if (pageNumber > 1) search.set("page", String(pageNumber));
    search.set("submission", submissionId);
    return `/admin/matching?${search.toString()}`;
  };
  const pageHref = (page: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (status) search.set("status", status);
    if (page > 1) search.set("page", String(page));
    return `/admin/matching${search.size?`?${search.toString()}`:""}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Catalogue · commercial matching</div><h1>Vendor Matching</h1><p className="lead">Queue αριστερά, evidence και απόφαση δεξιά. Ταυτότητα canonical και εμπορική έγκριση offer παραμένουν δύο ξεχωριστές αποφάσεις.</p><div className="workspace-action-bar" style={{marginTop:"1rem"}}><Link className="button button-primary" href="/admin/catalogue">← Catalogue Operations</Link></div></div></section>
    <WorkspaceMetricStrip items={[
      { label: "Submissions", value: data.metrics.submissions, hint: `${data.filteredTotal.toLocaleString("el-GR")} in current filter` },
      { label: "Needs review", value: review, tone: review ? "attention" : "default" },
      { label: "Candidate decisions", value: candidateActions, tone: candidateActions ? "attention" : "default" },
      { label: "Linked", value: linked, tone: linked ? "positive" : "default", hint: `${offerReady} ready for offer review` }
    ]} />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Triage workspace" title="Matching queue & decision panel" note="Search σε source title, vendor, category, canonical ID ή submission ID. Δημιουργία canonical εδώ αφορά μόνο product identity· δεν δημιουργεί ή τιμολογεί vendor offer." />
      <form method="get" className="admin-directory-filters"><label><span>Search</span><input name="q" defaultValue={query ?? ""} placeholder="Product, vendor, canonical ID…" /></label><label><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><div><button className="button button-secondary" type="submit">Filter</button>{(query || status) && <Link className="text-link" href="/admin/matching">Clear</Link>}</div></form>
      <AdminBulkCatalogApproval csrfToken={data.csrfToken} submissionIds={bulkApprovalIds} />
      {filteredSubmissions.length === 0 ? <WorkspaceEmptyState title="Δεν βρέθηκαν matching submissions με αυτά τα φίλτρα." /> : <div className="admin-split-workspace">
        <div className="admin-triage-list" aria-label="Matching submissions">{filteredSubmissions.map((submission) => {
          const decisions = submission.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status)).length;
          return <Link href={hrefFor(submission.id)} key={submission.id} className={`admin-triage-row${selected?.id === submission.id ? " is-selected" : ""}`}><span><strong>{submission.title}</strong><small>{submission.vendorId} · {submission.categoryCode}</small></span><span className="admin-triage-meta"><b>{submission.status.replaceAll("_", " ")}</b><small>{submission.candidates.length} candidates{decisions ? ` · ${decisions} decisions` : ""}</small></span><i aria-hidden="true">›</i></Link>;
        })}</div>
        {selected && <article className="admin-decision-panel">
          <div className="admin-decision-head"><div><span>Selected submission</span><h2>{selected.title}</h2><p>{selected.vendorId} · {selected.categoryCode} · supplier {selected.supplierPrice}</p></div><span className="status-pill">{selected.status}</span></div>
          <div className="admin-decision-summary"><div><span>Canonical</span><strong>{selected.canonicalVariantId ?? "Unlinked"}</strong></div><div><span>Candidates</span><strong>{selected.candidates.length}</strong></div><div><span>Submission ID</span><strong>{selected.id}</strong></div></div>
          <WorkspaceRecordDetails label="Source & identifiers" open><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Source vendor</strong><span>{selected.vendorId}</span></div><div className="workspace-compact-row"><strong>Submission</strong><span>{selected.id}</span></div>{selected.canonicalVariantId && <div className="workspace-compact-row"><strong>Linked canonical</strong><span>{selected.canonicalVariantId}</span></div>}</div></WorkspaceRecordDetails>
          <div className="admin-candidate-stack">
            {selected.candidates.length === 0 ? <div className="workspace-inline-note">Δεν υπάρχει candidate. Αν το προϊόν είναι πραγματικά νέο, δημιούργησε μόνο την canonical ταυτότητα. Η τιμή και η πωλησιμότητα παραμένουν στο vendor offer.</div> : selected.candidates.map((candidate) => {
              const actionable = ["pending", "auto_linked"].includes(candidate.status);
              return <section className={`admin-candidate-card${actionable ? " is-actionable" : ""}`} key={candidate.id}><div><span>{candidate.level}</span><strong>{candidate.canonicalVariantId}</strong><small>{Math.round(candidate.confidence * 100)}% confidence · {candidate.status}</small></div>{actionable && <div className="workspace-action-buttons"><AdminActionButton label="Approve match" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "approve_match", id: candidate.id }} reasonPrompt="Match approval reason" /><AdminActionButton label="Reject" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "reject_match", id: candidate.id }} reasonPrompt="Match rejection reason" danger /></div>}</section>;
            })}
          </div>
          <div className="workspace-action-bar"><span>{selected.status === "archived" ? "Archived products remain visible to Admin and vendor but are not available for sale." : selected.canonicalVariantId ? `Linked to ${selected.canonicalVariantId}` : "No canonical identity selected yet. Creating one does not set a platform retail price."}</span><div className="workspace-action-buttons">{selected.canonicalVariantId && ["linked", "approved"].includes(selected.status) && <AdminActionButton label="Approve offer" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "approve_offer", id: selected.id }} reasonPrompt="Offer approval reason" />}{!selected.canonicalVariantId && ["submitted", "needs_review", "linked"].includes(selected.status) && <AdminActionButton label="Create canonical identity" endpoint="/api/admin/catalog/canonical" csrfToken={data.csrfToken} body={{ submissionId: selected.id }} reasonPrompt="Why is this a genuinely new canonical product?" />}<AdminProductLifecycleActions submissionId={selected.id} submissionStatus={selected.status} csrfToken={data.csrfToken} /></div></div>
        </article>}
      </div>}
      {data.filteredTotal>pageSize?<div className="workspace-action-bar" style={{marginTop:"1rem"}}>
        <span>Showing {data.offset+1}–{Math.min(data.offset+filteredSubmissions.length,data.filteredTotal)} of {data.filteredTotal.toLocaleString("el-GR")} matching submissions.</span>
        <div className="workspace-action-buttons">
          {pageNumber>1?<Link className="button button-secondary" href={pageHref(pageNumber-1)}>Previous</Link>:null}
          {data.hasMore?<Link className="button button-secondary" href={pageHref(pageNumber+1)}>Next</Link>:null}
        </div>
      </div>:null}
    </section>
  </main>;
}
