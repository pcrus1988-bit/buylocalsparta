import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { getSeoCrawlHistorySnapshot } from "../../../../lib/seo-crawl-history";
import { getSeoProductionSignals } from "../../../../lib/seo-production-admin";

export const metadata: Metadata = {
  title: "SEO Production Signals · Admin",
  robots: { index: false, follow: false, nocache: true }
};

export const dynamic = "force-dynamic";

function when(value?: string): string {
  if (!value) return "No successful sync yet";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function number(value: number): string {
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 }).format(value);
}

export default async function AdminSeoProductionPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const [signals, crawl] = await Promise.all([
    getSeoProductionSignals(principal),
    getSeoCrawlHistorySnapshot(principal)
  ]);
  const providerErrors = signals.providers.filter((provider) => provider.error).length;
  const incompleteBackfills = signals.providers.filter((provider) => !provider.backfillComplete).length;
  const latestCrawl = crawl.runs[0];
  const merchantAttention = signals.merchant.status !== "healthy";
  const attention = !signals.persistenceAvailable || providerErrors > 0 || crawl.metrics.criticalOpen > 0 || merchantAttention;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · SEO & Visibility · Production</div>
        <h1>Production visibility signals</h1>
        <p className="lead">Live operational status for automated Google Search Console and GA4 history, retained production crawl evidence and the governed Google Merchant Center product feed. This screen surfaces the production systems that run behind the editorial SEO controls.</p>
      </div>
      <aside className={attention ? "dashboard-health-card needs-attention" : "dashboard-health-card"}>
        <span>Production SEO</span>
        <strong>{attention ? "Needs attention" : "Healthy"}</strong>
        <p>{providerErrors} provider errors · {crawl.metrics.criticalOpen} critical crawl issues</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "GSC latest day", value: signals.gsc.latestDay ?? "No data", tone: signals.gsc.latestDay ? "positive" : "attention", hint: `${number(signals.gsc.impressions)} impressions · ${number(signals.gsc.clicks)} clicks` },
      { label: "GA4 latest day", value: signals.ga4.latestDay ?? "No data", tone: signals.ga4.latestDay ? "positive" : "attention", hint: `${number(signals.ga4.organicSessions)} organic sessions` },
      { label: "Crawl issues", value: crawl.metrics.open, tone: crawl.metrics.criticalOpen ? "attention" : crawl.metrics.open ? "attention" : "positive", hint: `${crawl.metrics.criticalOpen} critical` },
      { label: "Merchant feed", value: signals.merchant.itemCount ?? "—", tone: merchantAttention ? "attention" : "positive", hint: signals.merchant.status }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Automated Google history" title="Search Console + GA4 production metrics" note="The scheduled production collector retains daily page-level GSC and organic landing-page GA4 metrics. Provider health and historical backfill progress are shown explicitly instead of being hidden behind the scheduler." />
      {!signals.persistenceAvailable
        ? <div className="workspace-empty-state"><strong>Production metrics persistence is unavailable.</strong><span>Check the production database schema and runtime connection before relying on automated SEO history.</span></div>
        : <>
          <div className="admin-domain-card-grid">
            <article className="admin-domain-card"><span>Google Search Console</span><strong>{signals.gsc.latestDay ?? "No retained day"}</strong><p>{number(signals.gsc.routes)} landing routes in the latest retained day.</p><b>{number(signals.gsc.impressions)}</b><i>Impressions · {number(signals.gsc.clicks)} clicks</i></article>
            <article className="admin-domain-card"><span>Google Analytics 4</span><strong>{signals.ga4.latestDay ?? "No retained day"}</strong><p>{number(signals.ga4.routes)} organic landing routes in the latest retained day.</p><b>{number(signals.ga4.organicSessions)}</b><i>Organic sessions · {number(signals.ga4.engagedSessions)} engaged</i></article>
            <article className="admin-domain-card"><span>GA4 outcomes</span><strong>Organic conversion signals</strong><p>Aggregate server-retained organic landing metrics.</p><b>{number(signals.ga4.ecommercePurchases)}</b><i>Purchases · {number(signals.ga4.keyEvents)} key events</i></article>
            <article className="admin-domain-card"><span>Backfill</span><strong>{incompleteBackfills ? `${incompleteBackfills} incomplete` : "Complete"}</strong><p>{signals.providers.length} configured production metric providers currently represented in sync state.</p><b>{providerErrors}</b><i>Provider errors</i></article>
          </div>
          <div className="workspace-queue-list" style={{ marginTop: 20 }}>
            {signals.providers.length === 0
              ? <div className="workspace-empty-state"><strong>No automated provider state retained yet.</strong><span>The scheduled collector will establish GSC and GA4 provider state after its first successful production run.</span></div>
              : signals.providers.map((provider) => <article className="workspace-queue-card" key={provider.provider}>
                <div className="workspace-queue-head"><div><strong>{provider.provider.toUpperCase()}</strong><small>Recent window {provider.recentStart ?? "—"} → {provider.recentEnd ?? "—"}</small></div><span className="status-pill">{provider.error ? "Error" : provider.backfillComplete ? "Synced" : "Backfilling"}</span></div>
                <div className="workspace-queue-primary"><span>Last success: {when(provider.lastSuccessAt)}</span></div>
                {provider.error && <div className="workspace-inline-note"><strong>Latest provider error:</strong> {provider.error}</div>}
              </article>)}
          </div>
          <div className="workspace-action-bar" style={{ marginTop: 18 }}><span>Manual Search Console evidence and URL inspection remain in the dedicated Google workspace.</span><Link className="button button-secondary" href="/admin/seo/search-console">Open Search Console</Link></div>
        </>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Autonomous crawl evidence" title="Production crawl health" note="The autonomous production crawler and operator-triggered crawls feed durable crawl evidence and issue history. This summary makes the latest retained result visible from the SEO control centre." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Latest run</span><strong>{latestCrawl ? when(latestCrawl.completedAt) : "No crawl yet"}</strong><p>{latestCrawl ? `${latestCrawl.completed} URLs checked in the retained run.` : "No persisted production crawl evidence is available."}</p><b>{crawl.metrics.latestRunIssues}</b><i>Latest-run issues</i></article>
        <article className="admin-domain-card"><span>Issue lifecycle</span><strong>{crawl.metrics.criticalOpen ? "Critical attention" : crawl.metrics.open ? "Open findings" : "Healthy"}</strong><p>Stable issue fingerprints preserve recurring and resolved history instead of creating duplicate findings.</p><b>{crawl.metrics.open}</b><i>Open · {crawl.metrics.criticalOpen} critical</i></article>
      </div>
      <div className="workspace-action-bar" style={{ marginTop: 18 }}><span>Inspect crawl history, trigger bounded verification and manage issue evidence in the Crawl workspace.</span><Link className="button button-secondary" href="/admin/seo/crawl">Open Crawl</Link></div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Google Merchant Center" title="Governed product feed health" note="The feed uses the same public SEO admission, crawler-visible offer price, availability and GTIN rules as the storefront. A feed outage or legitimate zero-item state is shown explicitly." />
      <div className="admin-domain-card-grid">
        <article className="admin-domain-card"><span>Feed status</span><strong>{signals.merchant.status === "healthy" ? "Healthy" : signals.merchant.status === "empty" ? "Empty" : "Error"}</strong><p>{signals.merchant.error ?? `HTTP ${signals.merchant.httpStatus ?? "—"}`}</p><b>{signals.merchant.itemCount ?? "—"}</b><i>Eligible feed items</i></article>
        <article className="admin-domain-card"><span>Production source</span><strong>RSS 2.0 product feed</strong><p>Public, governed source for Google Merchant Center and free product listings.</p><b>{signals.merchant.httpStatus ?? "—"}</b><i>HTTP status</i></article>
      </div>
      <div className="workspace-action-bar" style={{ marginTop: 18 }}><span><code>{signals.merchant.url}</code></span><div className="workspace-action-buttons"><a className="button button-secondary" href={signals.merchant.url} target="_blank" rel="noreferrer">Open feed ↗</a><Link className="button button-secondary" href="/admin/seo/reports">Unified SEO report</Link></div></div>
    </section>
  </main>;
}
