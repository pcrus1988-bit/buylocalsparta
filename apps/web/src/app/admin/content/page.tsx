import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminJsonForm } from "../../../components/AdminJsonForm";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminStoryMediaForm } from "../../../components/AdminStoryMediaForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminContentWorkspace } from "../../../lib/admin-governance-runtime";
import { adminMerchantStoryMediaWorkspace } from "../../../lib/admin-merchant-story-media";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  let storyMedia;
  try {
    [data, storyMedia] = await Promise.all([adminContentWorkspace(principal), adminMerchantStoryMediaWorkspace(principal)]);
  } catch { redirect("/admin"); }

  const published = data.pages.filter((page) => page.status === "published").length;
  const drafts = data.pages.filter((page) => !["published", "archived"].includes(page.status)).length;
  const linkedPhotos = storyMedia.available ? storyMedia.stories.filter((story) => Boolean(story.currentMediaId)).length : 0;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Content governance</div><h1>CMS & SEO</h1><p className="lead">Δημόσιο περιεχόμενο και merchant photography παραμένουν versioned, explicit και reviewable χωρίς να αναμειγνύονται με την καθημερινή moderation queue.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Pages", value: data.pages.length },
      { label: "Drafts", value: drafts, tone: drafts ? "attention" : "default" },
      { label: "Published", value: published, tone: published ? "positive" : "default" },
      { label: "Story photos", value: linkedPhotos, hint: storyMedia.available ? `${storyMedia.stories.length} merchant stories` : "PostgreSQL required" }
    ]} />

    <section className="shell vendor-section">
      <details className="workspace-tool-panel">
        <summary><span><strong>Create content draft</strong><small>Advanced CMS action · publication stays separate.</small></span></summary>
        <div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/content" csrfToken={data.csrfToken} label="Create draft" fields={[{ name: "slug", label: "Slug" }, { name: "title", label: "Greek title" }, { name: "description", label: "SEO / intro description" }]} /></div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="CMS" title="Pages" note="Publish, archive και restore παραμένουν explicit state transitions." />
      {data.pages.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν CMS pages." /> : <div className="workspace-queue-list">{data.pages.map((page) => <article className="workspace-queue-card" key={page.id}>
        <div className="workspace-queue-head"><div><strong>/{page.slug}</strong><small>{page.pageType} · version {page.version}</small></div><span className="status-pill">{page.status}</span></div>
        <WorkspaceRecordDetails label="Content record reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Page ID</strong><span>{page.id}</span></div><div className="workspace-compact-row"><strong>Version</strong><span>{page.version}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{page.status}</strong></span><div className="workspace-action-buttons">{page.status !== "published" && page.status !== "archived" && <AdminActionButton label="Publish" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "publish" }} />}{page.status !== "archived" && <AdminActionButton label="Archive" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "archive" }} reasonPrompt="Archive reason" danger />}{page.status === "archived" && <AdminActionButton label="Restore draft" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "restore" }} />}</div></div>
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Merchant storytelling" title="Public profile photography" note="Μόνο approved Vendor-owned media μπορούν να συνδεθούν. Κενή επιλογή επαναφέρει το ασφαλές graphic fallback." />
      {!storyMedia.available ? <WorkspaceEmptyState title="Merchant media linking requires PostgreSQL runtime." body="Database-less preview δεν αποθηκεύει πραγματικές associations." /> : storyMedia.stories.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν merchant stories." /> : <div className="workspace-queue-list">{storyMedia.stories.map((story) => <article className="workspace-queue-card" key={story.storyId}>
        <div className="workspace-queue-head"><div><strong>{story.title}</strong><small>{story.vendorName}</small></div><span className="status-pill">{story.currentMediaId ? "photo linked" : "fallback art"}</span></div>
        <div className="workspace-queue-primary"><span>{story.status}</span><span>{story.candidates.length} approved candidates</span></div>
        <details className="workspace-tool-panel" style={{ marginTop: 12 }}><summary><span><strong>Change profile image</strong><small>{story.candidates.length ? "Choose an approved media asset or fallback." : "No approved candidate yet."}</small></span></summary><div className="workspace-tool-body"><AdminStoryMediaForm storyId={story.storyId} csrfToken={storyMedia.csrfToken} currentMediaId={story.currentMediaId} candidates={story.candidates} /></div></details>
      </article>)}</div>}
    </section>
  </main>;
}
