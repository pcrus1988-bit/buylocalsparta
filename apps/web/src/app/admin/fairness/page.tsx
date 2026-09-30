import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminFairnessWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Fairness", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 120) || undefined;
  const pageNumber = Math.max(1, Math.floor(Number(params.page ?? "1")) || 1);
  const pageSize = 40;
  const data = await adminFairnessWorkspace(principal, { q: query, limit: pageSize, offset: (pageNumber - 1) * pageSize });
  const supplierRows = data.snapshots.reduce((sum, snapshot) => sum + snapshot.snapshot.length, 0);
  const pageHref = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (nextPage > 1) search.set("page", String(nextPage));
    return `/admin/fairness${search.size ? `?${search.toString()}` : ""}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Fair Vendor Exposure</div><h1>Fairness</h1><p className="lead">Appeals stay visible as a governance queue, while exposure evidence is now searchable and loaded 40 canonical variants at a time.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Canonical variants", value: data.metrics.variantTotal, hint: query ? `${data.filteredTotal} matching` : undefined },
      { label: "Evidence rows on page", value: supplierRows },
      { label: "Open appeals", value: data.metrics.open, tone: data.metrics.open ? "attention" : "default" },
      { label: "Under review", value: data.metrics.underReview, tone: data.metrics.underReview ? "attention" : data.metrics.resolved ? "positive" : "default", hint: `${data.metrics.resolved} resolved` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Appeals" title="Governance queue" note="Appeal outcomes και paid promotion δεν αλλάζουν σιωπηρά τα assignment weights. Up to 250 most relevant appeal rows are shown; global counters remain exact." />
      {data.appeals.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν fairness appeals." /> : <div className="workspace-queue-list">{data.appeals.map((appeal) => <article className="workspace-queue-card" key={appeal.id}>
        <div className="workspace-queue-head"><div><strong>{appeal.reason}</strong><small>{appeal.canonicalVariantId ?? "Market-level appeal"}</small></div><span className="status-pill">{appeal.status}</span></div>
        {appeal.resolution && <p className="workspace-queue-summary">{appeal.resolution}</p>}
        <WorkspaceRecordDetails label="Vendor & appeal references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Appeal ID</strong><span>{appeal.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{appeal.vendorId}</span></div>{appeal.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{appeal.canonicalVariantId}</span></div>}</div></WorkspaceRecordDetails>
        {["open", "under_review"].includes(appeal.status) && <div className="workspace-action-bar"><span>{appeal.resolution ?? "Awaiting platform review"}</span><div className="workspace-action-buttons">{appeal.status === "open" && <AdminActionButton label="Start review" endpoint="/api/admin/fairness/appeal" csrfToken={data.csrfToken} body={{ appealId: appeal.id, status: "under_review" }} />}<AdminActionButton label="Resolve" endpoint="/api/admin/fairness/appeal" csrfToken={data.csrfToken} body={{ appealId: appeal.id, status: "resolved" }} reasonPrompt="Resolution" /><AdminActionButton label="Reject" endpoint="/api/admin/fairness/appeal" csrfToken={data.csrfToken} body={{ appealId: appeal.id, status: "rejected" }} reasonPrompt="Rejection resolution" danger /></div></div>}
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Exposure evidence" title="Assignment snapshots" note="Search by title, model, slug or canonical ID. Only the visible 40-variant page hydrates its supplier deficit/exposure rows." />
      <form method="get" className="admin-directory-filters">
        <label><span>Find canonical variant</span><input name="q" defaultValue={params.q ?? ""} maxLength={120} placeholder="Title, model, slug or canonical ID…" /></label>
        <div><button className="button button-secondary" type="submit">Filter evidence</button>{query ? <Link className="text-link" href="/admin/fairness">Clear</Link> : null}</div>
      </form>
      {data.snapshots.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν fairness snapshots για αυτό το φίλτρο." /> : <div className="workspace-queue-list">{data.snapshots.map((variant) => <article className="workspace-queue-card" key={variant.id}>
        <div className="workspace-queue-head"><div><strong>{variant.title}</strong><small>{variant.snapshot.length} eligible suppliers · {variant.id}</small></div><span className="status-pill">evidence</span></div>
        <WorkspaceRecordDetails label="Supplier deficit & exposure evidence"><div className="workspace-compact-list">{variant.snapshot.map((row) => <div className="workspace-compact-row" key={row.vendorId}><strong>{row.vendorId}</strong><span>Deficit {row.deficit.toFixed(3)}</span><small>{row.qualifiedExposures} qualified exposures</small></div>)}</div></WorkspaceRecordDetails>
      </article>)}</div>}
      {data.filteredTotal > pageSize ? <div className="workspace-action-bar" style={{ marginTop: "1rem" }}>
        <span>Showing {data.filteredTotal ? data.offset + 1 : 0}–{Math.min(data.offset + data.snapshots.length, data.filteredTotal)} of {data.filteredTotal.toLocaleString("el-GR")} variants.</span>
        <div className="workspace-action-buttons">
          {pageNumber > 1 ? <Link className="button button-secondary" href={pageHref(pageNumber - 1)}>Previous</Link> : null}
          {data.hasMore ? <Link className="button button-secondary" href={pageHref(pageNumber + 1)}>Next</Link> : null}
        </div>
      </div> : null}
    </div></section>
  </main>;
}
