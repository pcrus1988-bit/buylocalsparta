import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSeoRegistryActions } from "../../../../components/AdminSeoRegistryActions";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoSitemapHistoryWorkspace } from "../../../../lib/seo-sitemap-history";

export const metadata: Metadata = {
  title: "SEO Sitemaps · Admin",
  robots: { index: false, follow: false, nocache: true }
};

function routeList(title: string, routes: readonly string[], empty: string) {
  return <article className="admin-domain-card"><span>{title}</span><strong>{routes.length ? `${routes.length} shown` : "None"}</strong>{routes.length ? <div className="workspace-compact-list" style={{ marginTop: 10 }}>{routes.map((route) => <div className="workspace-compact-row" key={route}><strong>URL</strong><span>{route}</span></div>)}</div> : <p>{empty}</p>}</article>;
}

export default async function AdminSeoSitemapsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await getSeoSitemapHistoryWorkspace(principal);
  const canWrite = hasAdminPermission(principal, "content.write");
  const latest = data.latest;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Sitemaps</div>
        <h1>Production sitemap evidence</h1>
        <p className="lead">Capture what `/sitemap.xml` actually serves in production, preserve each response as immutable evidence, compare it with the previous valid snapshot, and reconcile it against the governed URL registry instead of relying on an estimated count.</p>
      </div>
      <aside className={!latest?.valid || data.metrics.expectedMissing || data.metrics.unexpectedActual ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Latest sitemap</span>
        <strong>{!latest ? "No snapshot" : latest.valid ? `${latest.entryCount} URLs` : "Invalid"}</strong>
        <p>{data.metrics.expectedMissing} expected missing · {data.metrics.unexpectedActual} unexpected</p>
      </aside>
    </section>

    <section className="shell admin-local-tabs-shell">
      <nav className="admin-local-tabs" aria-label="SEO sitemap workspace navigation">
        <Link href="/admin/seo">Overview</Link>
        <Link href="/admin/seo/pages">Pages</Link>
        <Link href="/admin/seo/issues">Issues</Link>
        <Link href="/admin/seo/crawl">Crawl</Link>
        <Link href="/admin/seo/sitemaps">Sitemaps</Link>
        <Link href="/admin/seo/search-console">Search Console</Link>
      </nav>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Latest URLs", value: data.metrics.latestEntries, tone: latest?.valid ? "positive" : "attention" },
      { label: "Added since previous", value: data.metrics.added, tone: data.metrics.added ? "attention" : undefined },
      { label: "Removed since previous", value: data.metrics.removed, tone: data.metrics.removed ? "attention" : undefined },
      { label: "Registry mismatches", value: data.metrics.expectedMissing + data.metrics.unexpectedActual, tone: data.metrics.expectedMissing + data.metrics.unexpectedActual ? "attention" : "positive", hint: `${data.metrics.expectedMissing} missing · ${data.metrics.unexpectedActual} unexpected` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Live production capture" title="Snapshot `/sitemap.xml`" note="The fetch is bounded to the configured canonical origin, rejects redirects and external URLs, caps the response at 5 MB / 50,000 URLs, and preserves invalid responses as evidence rather than pretending the sitemap was healthy." />
      <AdminSeoRegistryActions csrfToken={principal.csrfToken} canWrite={canWrite} action="capture" />
      {!data.persistenceAvailable && <div className="workspace-empty-state" style={{ marginTop: 16 }}><strong>Sitemap history is unavailable.</strong><span>PostgreSQL runtime is required for immutable production sitemap evidence.</span></div>}
      {latest && <div className="workspace-compact-list" style={{ marginTop: 16 }}>
        <div className="workspace-compact-row"><strong>Status</strong><span>{latest.valid ? "Valid URL-set sitemap" : `Invalid · ${latest.error ?? "unknown error"}`}</span></div>
        <div className="workspace-compact-row"><strong>Captured</strong><span>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(latest.capturedAt))} · HTTP {latest.httpStatus ?? "—"} · {latest.responseTimeMs} ms</span></div>
        <div className="workspace-compact-row"><strong>Source</strong><span>{latest.sitemapUrl}</span></div>
        <div className="workspace-compact-row"><strong>SHA-256</strong><span>{latest.bodySha256 ?? "No response body"}</span></div>
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Reconciliation" title="What changed and what does not match policy" note="Added/removed compares the two latest valid captures. Expected-missing/unexpected-actual compares the latest valid production sitemap with the current persisted governed URL registry." />
      <div className="admin-domain-card-grid">
        {routeList("Added routes", data.addedRoutes, "No routes were added between the two latest valid snapshots.")}
        {routeList("Removed routes", data.removedRoutes, "No routes were removed between the two latest valid snapshots.")}
        {routeList("Expected but missing", data.expectedMissing, "Every registry URL expected in the sitemap is present in the latest valid capture.")}
        {routeList("Unexpected actual", data.unexpectedActual, "The latest valid sitemap contains no routes outside the current expected registry set.")}
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Immutable history" title="Sitemap snapshot timeline" note="Snapshots and their normalized URL entries cannot be updated or deleted. Invalid captures remain visible so transient deployment or routing failures are not erased from the operational record." />
      {data.snapshots.length === 0
        ? <div className="workspace-empty-state"><strong>No sitemap snapshots yet.</strong><span>Capture production `/sitemap.xml` to establish the first durable baseline.</span></div>
        : <div className="workspace-queue-list">{data.snapshots.map((snapshot) => <article className="workspace-queue-card" key={snapshot.id}>
          <div className="workspace-queue-head"><div><strong>{snapshot.valid ? `${snapshot.entryCount} URLs` : "Invalid sitemap capture"}</strong><small>{new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(snapshot.capturedAt))} · actor {snapshot.actorId ?? "system"}</small></div><span className="status-pill">{snapshot.valid ? "Valid" : "Invalid"}</span></div>
          <div className="workspace-queue-primary"><span>HTTP {snapshot.httpStatus ?? "—"} · {snapshot.responseTimeMs} ms · {snapshot.contentType ?? "content type unavailable"}</span></div>
          {snapshot.error && <div className="workspace-inline-note" style={{ marginTop: 10 }}>{snapshot.error}</div>}
          <div className="workspace-action-bar"><span><code>{snapshot.id}</code></span><div className="workspace-action-buttons"><a className="text-link" href={snapshot.sitemapUrl} target="_blank" rel="noreferrer">Open live sitemap ↗</a></div></div>
        </article>)}</div>}
    </section>
  </main>;
}
