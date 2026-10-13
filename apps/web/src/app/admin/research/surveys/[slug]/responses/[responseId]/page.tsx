import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading } from "../../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { getResearchResponseDetail } from "../../../../../../../lib/research-survey-response-admin";

export const metadata: Metadata = {
  title: "Admin · Questionnaire answers", robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

function date(value?: string): string {
  return value ? new Date(value).toLocaleString("el-GR", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens"
  }) : "—";
}

export default async function ResearchResponseDetailPage({ params }: {
  params: Promise<{ slug: string; responseId: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug, responseId } = await params;
  let unavailable = false;
  let detail: Awaited<ReturnType<typeof getResearchResponseDetail>> | undefined;
  try {
    detail = await getResearchResponseDetail(principal, slug, responseId);
  } catch (cause) {
    unavailable = true;
    console.error(JSON.stringify({
      event: "research.responses.admin_detail_unavailable",
      error: cause instanceof Error ? cause.name : "unknown"
    }));
  }
  if (!unavailable && !detail) notFound();
  const root = "/admin/research/surveys/" + encodeURIComponent(slug) + "/responses";
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Questionnaire answers" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Individual questionnaire</div>
      <h1>Saved questionnaire answers</h1>
      <p className="lead">{detail?.title ?? slug}</p>
      <div className="hero-actions">
        <Link prefetch={false} href={root} className="button button-secondary">← Back to responses</Link>
      </div>
    </div></section>
    <ResearchSurveyAdminNav slug={slug} current="responses" />
    <section className="shell vendor-section">
      {unavailable ? <div className="workspace-inline-note form-error" role="alert">
        This questionnaire could not be loaded. No answer data has been inferred.
      </div> : detail && <>
        <WorkspaceSectionHeading eyebrow="Response metadata" title={detail.response.id}
          note="Read-only, sourced from the exact saved questionnaire and its instrument version." />
        <div className="workspace-queue-card">
          <div className="workspace-action-bar" style={{ flexWrap: "wrap", gap: 14 }}>
            <span><strong>Status:</strong> {detail.response.status.replaceAll("_", " ")}</span>
            <span><strong>Version:</strong> {detail.response.instrumentVersion || "—"}</span>
            <span><strong>Started:</strong> {date(detail.response.startedAt)}</span>
            <span><strong>Last saved:</strong> {date(detail.response.savedAt)}</span>
            <span><strong>Completed:</strong> {date(detail.response.completedAt)}</span>
          </div>
        </div>
        {detail.withdrawn ? <div className="workspace-inline-note" role="status">
          This participant withdrew their questionnaire. The record is retained for audit purposes,
          but the answer content is not exposed in this Admin view.
        </div> : !detail.canViewRaw ? <div className="workspace-inline-note" role="status">
          Viewing individual answers requires Research analysis/management permission.
        </div> : <>
          <WorkspaceSectionHeading eyebrow="Saved answers"
            title={detail.answers.length.toLocaleString("el-GR") + " answer(s)"}
            note={detail.response.status === "completed"
              ? "This questionnaire has a completed submission status."
              : "These are autosaved answers. They are not evidence of a formally completed submission."} />
          {detail.answers.length === 0
            ? <div className="workspace-inline-note">No saved answer rows were found for this questionnaire.</div>
            : <div className="workspace-queue-card">
              {detail.answers.map((answer, index) => <div key={answer.code + ":" + index}
                style={{ padding: "14px 0", borderBottom: index + 1 < detail.answers.length
                  ? "1px solid var(--border, #ddd)" : undefined }}>
                <small>{answer.code} · {answer.type} · Saved {date(answer.answeredAt)}</small>
                <p style={{ fontWeight: 650, margin: "6px 0" }}>{answer.prompt || answer.code}</p>
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{answer.display}</div>
              </div>)}
            </div>}
        </>}
      </>}
    </section>
  </main>;
}
