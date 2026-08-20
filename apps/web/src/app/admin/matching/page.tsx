import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminMatchingWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Product Matching", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; submission?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminMatchingWorkspace(principal);
  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const status = params.status?.trim();
  const filteredSubmissions = data.submissions.filter((item) => {
    const matchesStatus = !status || item.status === status;
    const matchesQuery = !query || [item.id, item.title, item.categoryCode, item.vendorId, item.canonicalVariantId, ...item.candidates.map((candidate) => candidate.canonicalVariantId)].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query));
    return matchesStatus && matchesQuery;
  });
  const statuses = [...new Set(data.submissions.map((item) => item.status))].sort();
  const selected = filteredSubmissions.find((item) => item.id === params.submission)
    ?? filteredSubmissions.find((item) => ["submitted", "needs_review"].includes(item.status) || item.candidates.some((candidate) => ["pending", "auto_linked"].includes(candidate.status)))
    ?? filteredSubmissions[0];
  const review = data.submissions.filter((item) => ["submitted", "needs_review"].includes(item.status)).length;
  const candidateActions = data.submissions.reduce((total, item) => total + item.candidates.filter((candidate) => ["pending", "auto_linked"].includes(candidate.status)).length, 0);
  const linked = data.submissions.filter((item) => Boolean(item.canonicalVariantId)).length;
  const offerReady = data.submissions.filter((item) => item.canonicalVariantId && ["linked", "approved"].includes(item.status)).length;
  const hrefFor = (submissionId: string) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (status) search.set("status", status);
    search.set("submission", submissionId);
    return `/admin/matching?${search.toString()}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Catalog · triage</div><h1>Product Matching</h1><p className="lead">Queue αριστερά, evidence και απόφαση δεξιά. Ο Admin συγκρίνει ένα submission κάθε φορά χωρίς να χάνει τη θέση του στην ουρά.</p></div></section>
    <WorkspaceMetricStrip items={[
      { label: "Submissions", value: data.submissions.length },
      { label: "Needs review", value: review, tone: review ? "attention" : "default" },
      { label: "Candidate decisions", value: candidateActions, tone: candidateActions ? "attention" : "default" },
      { label: "Linked", value: linked, tone: linked ? "positive" : "default", hint: `${offerReady} ready for offer review` }
    ]} />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Triage workspace" title="Matching queue & decision panel" note="Search σε source title, vendor, category, canonical ID ή submission ID. Actionable submissions εμφανίζονται πρώτα από το runtime ordering." />
      <form method="get" className="admin-directory-filters"><label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Product, vendor, canonical ID…" /></label><label><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><div><button className="button button-secondary" type="submit">Filter</button>{(query || status) && <Link className="text-link" href="/admin/matching">Clear</Link>}</div></form>
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
            {selected.candidates.length === 0 ? <div className="workspace-inline-note">Δεν υπάρχει candidate. Αν το προϊόν είναι πραγματικά νέο, δημιούργησε canonical variant.</div> : selected.candidates.map((candidate) => {
              const actionable = ["pending", "auto_linked"].includes(candidate.status);
              return <section className={`admin-candidate-card${actionable ? " is-actionable" : ""}`} key={candidate.id}><div><span>{candidate.level}</span><strong>{candidate.canonicalVariantId}</strong><small>{Math.round(candidate.confidence * 100)}% confidence · {candidate.status}</small></div>{actionable && <div className="workspace-action-buttons"><AdminActionButton label="Approve match" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "approve_match", id: candidate.id }} reasonPrompt="Match approval reason" /><AdminActionButton label="Reject" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "reject_match", id: candidate.id }} reasonPrompt="Match rejection reason" danger /></div>}</section>;
            })}
          </div>
          <div className="workspace-action-bar"><span>{selected.canonicalVariantId ? `Linked to ${selected.canonicalVariantId}` : "No canonical variant selected yet."}</span><div className="workspace-action-buttons">{selected.canonicalVariantId && ["linked", "approved"].includes(selected.status) && <AdminActionButton label="Approve offer" endpoint="/api/admin/catalog/action" csrfToken={data.csrfToken} body={{ kind: "approve_offer", id: selected.id }} reasonPrompt="Offer approval reason" />}{!selected.canonicalVariantId && ["submitted", "needs_review", "linked"].includes(selected.status) && <AdminActionButton label="Create canonical" endpoint="/api/admin/catalog/canonical" csrfToken={data.csrfToken} body={{ submissionId: selected.id }} reasonPrompt="Canonical creation reason" extraPrompt={{ field: "platformPriceMinor", message: "Platform retail price in euro cents" }} />}</div></div>
        </article>}
      </div>}
    </section>
  </main>;
}
