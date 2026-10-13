import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import {
  listResearchResponses, RESEARCH_RESPONSE_EXPORT_MAX_ROWS
} from "../../../../../../lib/research-survey-response-admin";

export const metadata: Metadata = {
  title: "Admin · Questionnaire responses", robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

function date(value?: string): string {
  return value ? new Date(value).toLocaleString("el-GR", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens"
  }) : "—";
}

export default async function SurveyResponsesAdminPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; q?: string; cursor?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const query = await searchParams;
  let error = false;
  let data: Awaited<ReturnType<typeof listResearchResponses>> | undefined;
  try {
    data = await listResearchResponses(principal, slug, query);
  } catch (cause) {
    error = true;
    console.error(JSON.stringify({
      event: "research.responses.admin_index_unavailable",
      error: cause instanceof Error ? cause.name : "unknown"
    }));
  }
  if (!error && !data) notFound();
  const root = "/admin/research/surveys/" + encodeURIComponent(slug) + "/responses";
  const exportParams = new URLSearchParams();
  if (data?.status) exportParams.set("status", data.status);
  if (data?.q) exportParams.set("q", data.q);
  const nextParams = new URLSearchParams();
  if (data?.status) nextParams.set("status", data.status);
  if (data?.q) nextParams.set("q", data.q);
  if (data?.nextCursor) nextParams.set("cursor", data.nextCursor);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Questionnaire responses" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Research · Saved questionnaire data</div>
        <h1>Questionnaire Responses</h1>
        <p className="lead">{data?.title ?? slug} · Review saved answers, including questionnaires that have not been formally submitted.</p>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="responses" />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Stored submissions" title="Response explorer"
        note="Read-only records from the live study. An in-progress questionnaire may contain saved answers but is not a formally completed submission." />
      {error ? <div className="workspace-inline-note form-error" role="alert">
        Questionnaire data could not be loaded. No counts have been assumed; refresh to retry.
      </div> : data && <>
        <div className="workspace-queue-card">
          <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 14 }}>
            {([
              ["Saved answers", data.summary.savedAnswers],
              ["With answers", data.summary.withAnswers],
              ["Questionnaire records", data.summary.total],
              ["In progress", data.summary.inProgress],
              ["Completed", data.summary.completed],
              ["Withdrawn", data.summary.withdrawn]
            ] as const).map(([label, count]) => <span key={label}>
              <strong>{count.toLocaleString("el-GR")}</strong> <small>{label}</small>
            </span>)}
          </div>
          <small>The answer count includes stored rows across this study, including withdrawn records retained in the database. Withdrawn answer content is never displayed or exported here.</small>
        </div>
        <form action={root} method="get" className="workspace-queue-card"
          style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, flex: "1 1 210px" }}>
            Questionnaire ID (optional, exact)
            <input type="search" name="q" defaultValue={data.q} maxLength={80}
              placeholder="Paste a full response UUID" />
          </label>
          <label style={{ display: "grid", gap: 6, flex: "1 1 150px" }}>
            Status
            <select name="status" defaultValue={data.status}>
              <option value="">All statuses</option>
              <option value="in_progress">In progress / saved draft</option>
              <option value="completed">Completed</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>
          <button type="submit" className="button">Apply filters</button>
          <Link prefetch={false} className="button button-secondary" href={root}>Clear</Link>
        </form>
        <div className="workspace-action-bar" style={{ flexWrap: "wrap", marginTop: 16 }}>
          <strong>Questionnaires · {data.rows.length} on this page</strong>
          {data.canViewRaw && <a className="button button-secondary"
            href={root + "/export" + (exportParams.size ? "?" + exportParams.toString() : "")}>
            Export saved answers (CSV)
          </a>}
        </div>
        <div className="workspace-inline-note">
          Detail and export require Research analysis/management permission. Export includes up to {RESEARCH_RESPONSE_EXPORT_MAX_ROWS.toLocaleString("el-GR")} answers matching the status and exact ID filters, excludes withdrawn answers, and never modifies stored data.
        </div>
        {data.rows.length === 0
          ? <div className="workspace-inline-note">No questionnaires match these filters.</div>
          : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 750, textAlign: "left" }}>
              <thead><tr>
                <th>Response ID</th><th>Status</th><th>Saved answers</th><th>Started</th>
                <th>Last saved</th><th>Completed</th><th>View</th>
              </tr></thead>
              <tbody>{data.rows.map(row => <tr key={row.id}>
                <td><code title={row.id}>{row.id.slice(0, 8)}…</code></td>
                <td><strong>{row.status.replaceAll("_", " ")}</strong></td>
                <td>{row.answerCount.toLocaleString("el-GR")}</td>
                <td>{date(row.startedAt)}</td>
                <td>{date(row.savedAt)}</td>
                <td>{date(row.completedAt)}</td>
                <td><Link prefetch={false} className="button button-secondary"
                  href={root + "/" + encodeURIComponent(row.id)}>View questionnaire</Link></td>
              </tr>)}</tbody>
            </table></div>}
        {data.nextCursor && <div className="workspace-action-bar" style={{ marginTop: 16 }}>
          <span>Showing the next 25 most recent questionnaires</span>
          <Link prefetch={false} className="button button-secondary"
            href={root + "?" + nextParams.toString()}>Next page →</Link>
        </div>}
      </>}
    </section>
  </main>;
}
