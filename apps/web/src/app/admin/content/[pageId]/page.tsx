import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { AdminContentPageEditor } from "../../../../components/AdminContentPageEditor";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminContentEditorWorkspace } from "../../../../lib/admin-content-editor";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Content Editor · Admin", robots: { index: false, follow: false, nocache: true } };

function when(value?: number) {
  return value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "—";
}

export default async function AdminContentEditorPage({ params }: { params: Promise<{ pageId: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { pageId } = await params;
  const workspace = await adminContentEditorWorkspace(principal, decodeURIComponent(pageId));
  const page = workspace.page;
  const canWrite = hasAdminPermission(principal, "content.write");
  const publicHref = page.slug ? `/${page.slug}` : "/";

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={workspace.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Content · CMS · Version {page.version}</div><h1>{page.translations.el?.title ?? page.slug}</h1><p className="lead">Edit content, search metadata, Open Graph presentation and validated CMS blocks. Every save creates an immutable revision.</p></div>
      <aside className={page.status === "published" ? "dashboard-health-card" : "dashboard-health-card needs-attention"}><span>Publication</span><strong>{page.status}</strong><p>/{page.slug}</p></aside>
    </section>

    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Content editor sections"><a href="#content-editor">Content & SEO</a><a href="#publication">Publication</a><a href="#revisions">Versions</a><Link href={publicHref} target="_blank">Preview public page ↗</Link><Link href="/admin/content">All content</Link><Link href="/admin/seo">SEO & Visibility</Link></nav></section>

    <WorkspaceMetricStrip items={[
      { label: "Status", value: page.status, tone: page.status === "published" ? "positive" : "attention" },
      { label: "Version", value: page.version },
      { label: "Last update", value: when(page.updatedAt) },
      { label: "Scheduled", value: when(page.scheduledAt), tone: page.scheduledAt ? "attention" : "default" }
    ]} />

    <section id="content-editor" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Authoring" title="Content & search presentation" note="The slug is intentionally immutable here. Public route changes belong in redirect and canonical governance, not silent renames." />
      <AdminContentPageEditor pageId={page.id} pageType={page.pageType} status={page.status} scheduledAt={page.scheduledAt} csrfToken={workspace.csrfToken} translations={page.translations} canWrite={canWrite} />
    </section>

    <section id="publication" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Lifecycle" title="Publication controls" note="Publish, archive or restore the current version. Scheduled pages are released by the existing CMS publication maintenance job." />
      <div className="workspace-action-bar"><span>Published: {when(page.publishedAt)} · Scheduled: {when(page.scheduledAt)}</span>{canWrite ? <div className="workspace-action-buttons">
        {page.status !== "published" && page.status !== "archived" ? <AdminActionButton label="Publish now" endpoint="/api/admin/content/action" csrfToken={workspace.csrfToken} body={{ pageId: page.id, action: "publish" }} reasonPrompt="Publication reason" /> : null}
        {page.status !== "archived" ? <AdminActionButton label="Archive" endpoint="/api/admin/content/action" csrfToken={workspace.csrfToken} body={{ pageId: page.id, action: "archive" }} reasonPrompt="Why should this page be archived?" danger /> : null}
        {page.status === "archived" ? <AdminActionButton label="Restore to draft" endpoint="/api/admin/content/action" csrfToken={workspace.csrfToken} body={{ pageId: page.id, action: "restore" }} reasonPrompt="Restoration reason" /> : null}
      </div> : null}</div>
    </div></section>

    <section id="revisions" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Immutable history" title="Version history" note="Authoring and lifecycle changes are stored as revision snapshots." />
      <div className="workspace-queue-list">{workspace.revisions.map((revision) => <article className="workspace-queue-card" key={revision.id}><div className="workspace-queue-head"><div><strong>Version {revision.version}</strong><small>{revision.reason} · {revision.actorId}</small></div><span className="status-pill">{when(revision.createdAt)}</span></div><details className="workspace-tool-panel"><summary><span><strong>Revision snapshot</strong><small>Read-only evidence.</small></span></summary><div className="workspace-tool-body"><code>{JSON.stringify(revision.snapshot)}</code></div></details></article>)}</div>
    </section>
  </main>;
}
