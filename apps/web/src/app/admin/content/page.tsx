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
  const canWrite = hasAdminPermission(principal, "content.write");
  const activeRedirects = data.redirects.filter((item) => item.active).length;

  return <main className="vendor-app admin-app admin-content-operations">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section id="content-overview" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Editorial operations</div>
      <h1>Content</h1>
      <p className="lead">Author → Publish → Route → Merchandise → Communicate. Manage public content without mixing CMS lifecycle, homepage merchandising, email templates and search visibility into one undifferentiated workspace.</p>
    </div></section>
    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Content workspace sections"><a href="#content-pages">Pages</a><a href="#content-redirects">Redirects</a><a href="#content-stories">Merchant stories</a><a href="#content-inventory">Collections</a></nav></section>

    <WorkspaceMetricStrip items={[
      { label: "Pages", value: data.pages.length, hint: `${published} published · ${archived} archived` },
      { label: "Work in progress", value: drafts, tone: drafts ? "attention" : "default", hint: "Draft or scheduled content" },
      { label: "Active redirects", value: activeRedirects, hint: "Public route governance" },
      { label: "Story image gaps", value: storyGaps, tone: storyGaps ? "attention" : "positive", hint: `${linkedPhotos} profiles linked` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Editorial workflow" title="Choose the surface that owns the work" note="Content owns authoring, publication and routing. Homepage and Email are specialist Content workspaces. SEO & Visibility validates discoverability after the content exists." />
      <div className="content-workflow-grid">
        <a className={`content-workflow-card${drafts ? " needs-attention" : ""}`} href="#content-pages"><span>Author & publish</span><strong>CMS pages</strong><p>Versioned EL/EN content, SEO/OG presentation, blocks, scheduling and publication lifecycle.</p><b>{drafts}</b><i>Work in progress ↓</i></a>
        <a className="content-workflow-card" href="#content-redirects"><span>Route</span><strong>Redirects</strong><p>Move public paths safely without breaking customer links or search discovery.</p><b>{activeRedirects}</b><i>Active rules ↓</i></a>
        <Link className="content-workflow-card" href="/admin/hero"><span>Merchandise</span><strong>Homepage</strong><p>Hero slides and promotional CTA order, links and visible state without a deployment.</p><b>Home</b><i>Manage →</i></Link>
        <a className={`content-workflow-card${storyGaps ? " needs-attention" : ""}`} href="#content-stories"><span>Tell the story</span><strong>Merchant stories</strong><p>Attach already-approved vendor-owned media to public merchant storytelling.</p><b>{storyGaps}</b><i>Image gaps ↓</i></a>
        {canManageEmailTemplates ? <Link className="content-workflow-card" href="/admin/email-lab"><span>Communicate</span><strong>Email</strong><p>Versioned automatic email content, previews, test sends and delivery readiness.</p><b>Email</b><i>Templates →</i></Link> : null}
        <Link className="content-workflow-card content-handoff-card" href="/admin/seo"><span>Validate visibility</span><strong>SEO & Visibility</strong><p>Indexability, crawl, schema and Google evidence belong to the specialist visibility workspace.</p><b>SEO</b><i>Control centre →</i></Link>
      </div>
    </section>

    <section id="content-pages" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Author & publish" title="CMS pages" note="Each page opens into versioned authoring for EL/EN content, search/OG presentation, validated blocks, scheduling and immutable revision history." />
      {canWrite ? <details className="workspace-tool-panel">
        <summary><span><strong>Create content draft</strong><small>Creates version 1; publication remains a separate explicit action.</small></span></summary>
        <div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/content" csrfToken={data.csrfToken} label="Create draft" fields={[{ name: "slug", label: "Slug" }, { name: "title", label: "Greek title" }, { name: "description", label: "SEO / intro description" }]} /></div>
      </details> : null}
      {data.pages.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν CMS pages." /> : <div className="workspace-queue-list">{data.pages.map((page) => <article className="workspace-queue-card" key={page.id}>
        <div className="workspace-queue-head"><div><strong>/{page.slug}</strong><small>{page.pageType} · version {page.version}</small></div><span className={`status-pill${page.status !== "published" && page.status !== "archived" ? " needs-attention" : ""}`}>{page.status}</span></div>
        <WorkspaceRecordDetails label="Content record reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Page ID</strong><span>{page.id}</span></div><div className="workspace-compact-row"><strong>Version</strong><span>{page.version}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{page.status}</strong>{page.scheduledAt ? ` · scheduled ${new Date(page.scheduledAt).toLocaleString("el-GR")}` : ""}</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/content/${encodeURIComponent(page.id)}`}>Edit & versions</Link>{canWrite && page.status !== "published" && page.status !== "archived" && <AdminActionButton label="Publish" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "publish" }} />}{canWrite && page.status !== "archived" && <AdminActionButton label="Archive" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "archive" }} reasonPrompt="Archive reason" danger />}{canWrite && page.status === "archived" && <AdminActionButton label="Restore draft" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "restore" }} />}</div></div>
      </article>)}</div>}
    </div></section>

    <section id="content-redirects" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Route" title="Redirects" note="Use redirects when a public path moves. Sources and destinations stay internal absolute paths; loop checks remain enforced before writes." />
      {canWrite ? <details className="workspace-tool-panel"><summary><span><strong>Create or replace redirect</strong><small>An existing active rule for the same source is retired automatically.</small></span></summary><div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/content/redirects" csrfToken={data.csrfToken} label="Save redirect" defaults={{ statusCode: 301 }} fields={[{ name: "fromPath", label: "From path, e.g. /old-page" }, { name: "toPath", label: "To path, e.g. /new-page" }, { name: "statusCode", label: "HTTP status", type: "select", options: ["301", "302", "307", "308"] }]} /></div></details> : null}
      {data.redirects.length === 0 ? <WorkspaceEmptyState title="No redirects configured." /> : <div className="workspace-queue-list">{data.redirects.map((item) => <article className="workspace-queue-card" key={item.id}><div className="workspace-queue-head"><div><strong>{item.fromPath} → {item.toPath}</strong><small>HTTP {item.statusCode}</small></div><span className="status-pill">{item.active ? "active" : "retired"}</span></div><WorkspaceRecordDetails label="Redirect record"><div className="workspace-compact-row"><strong>ID</strong><span>{item.id}</span></div></WorkspaceRecordDetails></article>)}</div>}
    </section>

    <section id="content-stories" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Merchandise" title="Merchant story photography" note="Content chooses among already-approved Vendor-owned media. Media rights and moderation remain owned by Trust; empty selection restores the safe graphic fallback." />
      {!storyMedia.available ? <WorkspaceEmptyState title="Merchant media linking requires PostgreSQL runtime." body="Database-less preview δεν αποθηκεύει πραγματικές associations." /> : storyMedia.stories.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν merchant stories." /> : <div className="workspace-queue-list">{storyMedia.stories.map((story) => <article className="workspace-queue-card" key={story.storyId}>
        <div className="workspace-queue-head"><div><strong>{story.title}</strong><small>{story.vendorName}</small></div><span className={`status-pill${story.currentMediaId ? "" : " needs-attention"}`}>{story.currentMediaId ? "photo linked" : "fallback art"}</span></div>
        <div className="workspace-queue-primary"><span>{story.status}</span><span>{story.candidates.length} approved candidates</span></div>
        <details className="workspace-tool-panel" style={{ marginTop: 12 }}><summary><span><strong>Change profile image</strong><small>{story.candidates.length ? "Choose an approved media asset or fallback." : "No approved candidate yet."}</small></span></summary><div className="workspace-tool-body"><AdminStoryMediaForm storyId={story.storyId} csrfToken={storyMedia.csrfToken} currentMediaId={story.currentMediaId} candidates={story.candidates} /></div></details>
      </article>)}</div>}
    </div></section>

    <section id="content-inventory" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Reference inventory" title="Product collections" note="Collections exist in the CMS domain, but this page does not pretend to be a collection editor. They remain available as reference until dedicated collection authoring is implemented." />
      <WorkspaceRecordDetails label={`Collection inventory · ${data.collections.length}`}>
        {data.collections.length === 0 ? <WorkspaceEmptyState title="No product collections configured." /> : <div className="workspace-queue-list">{data.collections.map((collection) => <article className="workspace-queue-card" key={collection.id}><div className="workspace-queue-head"><div><strong>{collection.title}</strong><small>/{collection.slug}</small></div><span className="status-pill">{collection.status}</span></div><WorkspaceRecordDetails label="Collection record"><div className="workspace-compact-row"><strong>ID</strong><span>{collection.id}</span></div></WorkspaceRecordDetails></article>)}</div>}
      </WorkspaceRecordDetails>
    </section>
  </main>;
}
