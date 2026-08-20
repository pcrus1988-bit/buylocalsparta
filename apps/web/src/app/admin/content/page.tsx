import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminJsonForm } from "../../../components/AdminJsonForm";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminStoryMediaForm } from "../../../components/AdminStoryMediaForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminContentWorkspace } from "../../../lib/admin-governance-runtime";
import { adminMerchantStoryMediaWorkspace } from "../../../lib/admin-merchant-story-media";
import { hasAdminPermission } from "../../../lib/admin-runtime";
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
  const archived = data.pages.filter((page) => page.status === "archived").length;
  const linkedPhotos = storyMedia.available ? storyMedia.stories.filter((story) => Boolean(story.currentMediaId)).length : 0;
  const storyGaps = storyMedia.available ? Math.max(0, storyMedia.stories.length - linkedPhotos) : 0;
  const canManageEmailTemplates = hasAdminPermission(principal, "notifications.manage");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section id="content-overview" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Content</div><h1>Content operations</h1><p className="lead">CMS/SEO, homepage merchandising, merchant storytelling και customer communications οργανωμένα ως ένα content domain, με τις υπάρχουσες review και publish δικλείδες ανέπαφες.</p></div></section>
    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Content workspace sections"><a href="#content-overview">Overview</a><a href="#content-pages">CMS & SEO</a><a href="#content-stories">Merchant stories</a></nav></section>

    <WorkspaceMetricStrip items={[
      { label: "Pages", value: data.pages.length },
      { label: "Drafts", value: drafts, tone: drafts ? "attention" : "default" },
      { label: "Published", value: published, tone: published ? "positive" : "default", hint: `${archived} archived` },
      { label: "Story photos", value: linkedPhotos, tone: storyGaps ? "attention" : "positive", hint: storyMedia.available ? `${storyGaps} using fallback art` : "PostgreSQL required" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Content operations" title="Choose the surface you want to manage" note="Editorial content, homepage merchandising and automatic communications remain separate governed capabilities, but are now discoverable from one operational entry point." />
      <div className="admin-domain-card-grid">
        <a className={`admin-domain-card${drafts ? " needs-attention" : ""}`} href="#content-pages"><span>CMS & SEO</span><strong>Pages</strong><p>Versioned public pages with explicit publish, archive and restore transitions.</p><b>{drafts}</b><i>Drafts ↓</i></a>
        <Link className="admin-domain-card" href="/admin/hero"><span>Homepage</span><strong>Homepage merchandising</strong><p>Hero slides, order, links and visible/hidden state without a code deployment.</p><b>Hero</b><i>Manage →</i></Link>
        <a className={`admin-domain-card${storyGaps ? " needs-attention" : ""}`} href="#content-stories"><span>Merchant stories</span><strong>Profile photography</strong><p>Approved vendor-owned media associations and safe graphic fallback.</p><b>{storyGaps}</b><i>Gaps ↓</i></a>
        {canManageEmailTemplates && <Link className="admin-domain-card" href="/admin/email-lab"><span>Communications</span><strong>Email templates & delivery</strong><p>Versioned automatic email content, preview/test sending and delivery readiness.</p><b>Email</b><i>Templates →</i></Link>}
      </div>
    </section>

    <section id="content-pages" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="CMS & SEO" title="Pages" note="Publish, archive και restore παραμένουν explicit state transitions. Technical record IDs stay behind progressive disclosure." />
      <details className="workspace-tool-panel">
        <summary><span><strong>Create content draft</strong><small>Advanced CMS action · publication stays separate.</small></span></summary>
        <div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/content" csrfToken={data.csrfToken} label="Create draft" fields={[{ name: "slug", label: "Slug" }, { name: "title", label: "Greek title" }, { name: "description", label: "SEO / intro description" }]} /></div>
      </details>
      {data.pages.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν CMS pages." /> : <div className="workspace-queue-list">{data.pages.map((page) => <article className="workspace-queue-card" key={page.id}>
        <div className="workspace-queue-head"><div><strong>/{page.slug}</strong><small>{page.pageType} · version {page.version}</small></div><span className="status-pill">{page.status}</span></div>
        <WorkspaceRecordDetails label="Content record reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Page ID</strong><span>{page.id}</span></div><div className="workspace-compact-row"><strong>Version</strong><span>{page.version}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{page.status}</strong></span><div className="workspace-action-buttons">{page.status !== "published" && page.status !== "archived" && <AdminActionButton label="Publish" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "publish" }} />}{page.status !== "archived" && <AdminActionButton label="Archive" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "archive" }} reasonPrompt="Archive reason" danger />}{page.status === "archived" && <AdminActionButton label="Restore draft" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "restore" }} />}</div></div>
      </article>)}</div>}
    </div></section>

    <section id="content-stories" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Merchant storytelling" title="Public profile photography" note="Μόνο approved Vendor-owned media μπορούν να συνδεθούν. Κενή επιλογή επαναφέρει το ασφαλές graphic fallback." />
      {!storyMedia.available ? <WorkspaceEmptyState title="Merchant media linking requires PostgreSQL runtime." body="Database-less preview δεν αποθηκεύει πραγματικές associations." /> : storyMedia.stories.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν merchant stories." /> : <div className="workspace-queue-list">{storyMedia.stories.map((story) => <article className="workspace-queue-card" key={story.storyId}>
        <div className="workspace-queue-head"><div><strong>{story.title}</strong><small>{story.vendorName}</small></div><span className="status-pill">{story.currentMediaId ? "photo linked" : "fallback art"}</span></div>
        <div className="workspace-queue-primary"><span>{story.status}</span><span>{story.candidates.length} approved candidates</span></div>
        <details className="workspace-tool-panel" style={{ marginTop: 12 }}><summary><span><strong>Change profile image</strong><small>{story.candidates.length ? "Choose an approved media asset or fallback." : "No approved candidate yet."}</small></span></summary><div className="workspace-tool-body"><AdminStoryMediaForm storyId={story.storyId} csrfToken={storyMedia.csrfToken} currentMediaId={story.currentMediaId} candidates={story.candidates} /></div></details>
      </article>)}</div>}
    </section>
  </main>;
}
