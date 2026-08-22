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

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section id="content-overview" className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Content</div><h1>Content operations</h1><p className="lead">CMS authoring, SEO metadata, publication, redirects, collections, homepage merchandising, merchant storytelling and customer communications in one governed content workspace.</p></div></section>
    <section className="shell admin-local-tabs-shell"><nav className="admin-local-tabs" aria-label="Content workspace sections"><a href="#content-overview">Overview</a><a href="#content-pages">Pages</a><a href="#content-redirects">Redirects</a><a href="#content-collections">Collections</a><a href="#content-stories">Merchant stories</a><Link href="/admin/seo">SEO & Visibility</Link><Link href="/admin/seo/crawl">Crawl</Link><Link href="/admin/seo/search-console">Search Console</Link></nav></section>

    <WorkspaceMetricStrip items={[
      { label: "Pages", value: data.pages.length },
      { label: "Drafts", value: drafts, tone: drafts ? "attention" : "default" },
      { label: "Published", value: published, tone: published ? "positive" : "default", hint: `${archived} archived` },
      { label: "Active redirects", value: activeRedirects, tone: "default", hint: `${data.collections.length} collections` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Content operations" title="Choose the surface you want to manage" note="Editorial content, routing, homepage merchandising and automatic communications remain separate governed capabilities but are discoverable from one operational entry point." />
      <div className="admin-domain-card-grid">
        <a className={`admin-domain-card${drafts ? " needs-attention" : ""}`} href="#content-pages"><span>CMS & SEO</span><strong>Pages</strong><p>Edit versioned public pages, metadata, blocks, scheduling and publication state.</p><b>{drafts}</b><i>Drafts ↓</i></a>
        <a className="admin-domain-card" href="#content-redirects"><span>Routing</span><strong>Redirects</strong><p>Govern public URL moves without breaking search discovery or customer links.</p><b>{activeRedirects}</b><i>Active ↓</i></a>
        <Link className="admin-domain-card" href="/admin/hero"><span>Homepage</span><strong>Homepage merchandising</strong><p>Hero slides, order, links and visible/hidden state without a code deployment.</p><b>Hero</b><i>Manage →</i></Link>
        <a className={`admin-domain-card${storyGaps ? " needs-attention" : ""}`} href="#content-stories"><span>Merchant stories</span><strong>Profile photography</strong><p>Approved vendor-owned media associations and safe graphic fallback.</p><b>{storyGaps}</b><i>Gaps ↓</i></a>
        {canManageEmailTemplates && <Link className="admin-domain-card" href="/admin/email-lab"><span>Communications</span><strong>Email templates & delivery</strong><p>Versioned automatic email content, preview/test sending and delivery readiness.</p><b>Email</b><i>Templates →</i></Link>}
        <Link className="admin-domain-card" href="/admin/seo"><span>Search</span><strong>SEO & Visibility</strong><p>Move from authoring into indexability, crawl and Google Search Console evidence.</p><b>SEO</b><i>Control centre →</i></Link>
      </div>
    </section>

    <section id="content-pages" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="CMS & SEO" title="Pages" note="Each page now opens into versioned authoring for EL/EN content, SEO/OG fields, validated blocks, scheduling and revision history." />
      {canWrite ? <details className="workspace-tool-panel">
        <summary><span><strong>Create content draft</strong><small>Creates version 1; publication stays separate.</small></span></summary>
        <div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/content" csrfToken={data.csrfToken} label="Create draft" fields={[{ name: "slug", label: "Slug" }, { name: "title", label: "Greek title" }, { name: "description", label: "SEO / intro description" }]} /></div>
      </details> : null}
      {data.pages.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν CMS pages." /> : <div className="workspace-queue-list">{data.pages.map((page) => <article className="workspace-queue-card" key={page.id}>
        <div className="workspace-queue-head"><div><strong>{page.title ?? `/${page.slug}`}</strong><small>/{page.slug} · {page.pageType} · version {page.version}</small></div><span className="status-pill">{page.status}</span></div>
        <WorkspaceRecordDetails label="Content record reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Page ID</strong><span>{page.id}</span></div><div className="workspace-compact-row"><strong>Version</strong><span>{page.version}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>State: <strong>{page.status}</strong>{page.scheduledAt ? ` · scheduled ${new Date(page.scheduledAt).toLocaleString("el-GR")}` : ""}</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/content/${encodeURIComponent(page.id)}`}>Edit & versions</Link>{canWrite && page.status !== "published" && page.status !== "archived" && <AdminActionButton label="Publish" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "publish" }} />}{canWrite && page.status !== "archived" && <AdminActionButton label="Archive" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "archive" }} reasonPrompt="Archive reason" danger />}{canWrite && page.status === "archived" && <AdminActionButton label="Restore draft" endpoint="/api/admin/content/action" csrfToken={data.csrfToken} body={{ pageId: page.id, action: "restore" }} />}</div></div>
      </article>)}</div>}
    </div></section>

    <section id="content-redirects" className="shell vendor-section admin-anchor-section">
      <WorkspaceSectionHeading eyebrow="Routing governance" title="Redirects" note="Use redirects when public paths move. Sources and destinations must be internal absolute paths; loop checks are enforced before writes." />
      {canWrite ? <details className="workspace-tool-panel"><summary><span><strong>Create or replace redirect</strong><small>An existing active rule for the same source is retired automatically.</small></span></summary><div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/content/redirects" csrfToken={data.csrfToken} label="Save redirect" defaults={{ statusCode: 301 }} fields={[{ name: "fromPath", label: "From path, e.g. /old-page" }, { name: "toPath", label: "To path, e.g. /new-page" }, { name: "statusCode", label: "HTTP status", type: "select", options: ["301", "302", "307", "308"] }]} /></div></details> : null}
      {data.redirects.length === 0 ? <WorkspaceEmptyState title="No redirects configured." /> : <div className="workspace-queue-list">{data.redirects.map((item) => <article className="workspace-queue-card" key={item.id}><div className="workspace-queue-head"><div><strong>{item.fromPath} → {item.toPath}</strong><small>HTTP {item.statusCode}</small></div><span className="status-pill">{item.active ? "active" : "retired"}</span></div><WorkspaceRecordDetails label="Redirect record"><div className="workspace-compact-row"><strong>ID</strong><span>{item.id}</span></div></WorkspaceRecordDetails></article>)}</div>}
    </section>

    <section id="content-collections" className="vendor-section section-tint admin-anchor-section"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Editorial merchandising" title="Product collections" note="Collections are already persisted in the CMS domain and are now visible from Content operations. Dedicated collection authoring is the next editor surface." />
      {data.collections.length === 0 ? <WorkspaceEmptyState title="No product collections configured." /> : <div className="workspace-queue-list">{data.collections.map((collection) => <article className="workspace-queue-card" key={collection.id}><div className="workspace-queue-head"><div><strong>{collection.title}</strong><small>/{collection.slug}</small></div><span className="status-pill">{collection.status}</span></div><WorkspaceRecordDetails label="Collection record"><div className="workspace-compact-row"><strong>ID</strong><span>{collection.id}</span></div></WorkspaceRecordDetails></article>)}</div>}
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
