import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import {
  adminLaunchControlWorkspace,
  normalizeLaunchControlFilters,
  type LaunchControlTone
} from "../../../../lib/admin-launch-control";
import { getAdminSession } from "../../../../lib/admin-session";
import { WEB_BUILD_VERSION } from "../../../../lib/build";

export const metadata: Metadata = { title: "Admin · Launch Control", robots: { index: false, follow: false } };

type PageProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

type Kpi = Readonly<{
  label: string;
  value: string | number;
  hint: string;
  href: string;
  tone?: LaunchControlTone;
  meta?: string;
  delta?: number;
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function euroMinor(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value / 100);
}

function pct(value: number | undefined, digits = 0): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function delta(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function deltaLabel(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}% vs previous`;
}

function toneClass(tone: LaunchControlTone | undefined): string {
  return tone ? ` lc-tone-${tone}` : "";
}

function barWidth(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(value > 0 ? 3 : 0, Math.min(100, (value / max) * 100))}%`;
}

function FunnelStep({ label, value, previous }: Readonly<{ label: string; value: number; previous?: number }>) {
  const conversion = previous && previous > 0 ? value / previous : undefined;
  return <div className="lc-funnel-step">
    <div><span>{label}</span><strong>{value.toLocaleString("el-GR")}</strong></div>
    <div className="lc-funnel-track"><i style={{ width: previous ? `${Math.max(4, Math.min(100, (value / previous) * 100))}%` : "100%" }} /></div>
    <small>{conversion === undefined ? "funnel start" : `${pct(conversion, conversion < 0.1 ? 1 : 0)} from previous stage`}</small>
  </div>;
}

export default async function LaunchControlOverview({ searchParams }: PageProps) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin")) redirect("/admin");

  const raw = await searchParams;
  let filters;
  try {
    filters = normalizeLaunchControlFilters({
      from: first(raw.from),
      to: first(raw.to),
      vendorId: first(raw.vendor),
      categoryCode: first(raw.category),
      market: first(raw.market)
    });
  } catch {
    filters = normalizeLaunchControlFilters({});
  }

  const data = await adminLaunchControlWorkspace(principal, filters);
  const analytics = data.analytics;
  const previous = data.previousAnalytics;
  const finance = data.finance;
  const seo = data.seo;
  const operations = data.operations;
  const activation = data.activation;
  const maintenance = data.maintenance;
  const current = analytics?.summary;
  const prior = previous?.summary;

  const critical = data.attention.filter((item) => item.severity === "critical").length;
  const warnings = data.attention.filter((item) => item.severity === "warning").length;
  const opportunities = data.attention.filter((item) => item.severity === "opportunity").length;
  const healthChecks = operations?.health.checks ?? [];
  const nonReadyHealth = healthChecks.filter((check) => !["ready", "healthy", "ok", "disabled"].includes(String(check.state).toLowerCase())).length;
  const failingJobs = maintenance ? maintenance.jobNames.filter((job) => (job.state?.consecutiveFailures ?? 0) > 0).length : undefined;
  const currentEvidence = activation?.evidence.filter((row) => row.buildVersion === WEB_BUILD_VERSION && (!row.expiresAt || row.expiresAt > Date.now())) ?? [];
  const activeEvidenceIssues = currentEvidence.filter((row) => row.status !== "passed").length;
  const financeFindings = finance ? Object.values(finance.controls).reduce((sum, item) => sum + item, 0) : undefined;
  const seoCritical = seo?.diagnostics.filter((item) => item.severity === "critical").length ?? 0;
  const seoWarnings = seo?.diagnostics.filter((item) => item.severity === "warning").length ?? 0;
  const vendorApplications = data.vendors?.applications ?? [];
  const vendorStateCounts = new Map<string, number>();
  for (const application of vendorApplications) vendorStateCounts.set(application.state, (vendorStateCounts.get(application.state) ?? 0) + 1);

  const kpis: Kpi[] = [
    {
      label: "Launch readiness",
      value: data.readiness.score === undefined ? "—" : `${data.readiness.score}%`,
      hint: `${data.readiness.measurable}/${data.readiness.total} dimensions measurable`,
      href: "#readiness",
      tone: data.readiness.score === undefined ? "unavailable" : data.readiness.score >= 90 ? "positive" : data.readiness.score >= 70 ? "neutral" : data.readiness.score >= 50 ? "attention" : "critical",
      meta: "snapshot"
    },
    {
      label: "Platform health",
      value: data.dashboard.health.ok ? "HEALTHY" : "ATTENTION",
      hint: operations ? `${nonReadyHealth} non-ready health checks` : "aggregate Admin health",
      href: "/admin/operations",
      tone: data.dashboard.health.ok ? "positive" : "critical",
      meta: "live snapshot"
    },
    {
      label: "Vendors in scope",
      value: current?.vendorCount ?? "—",
      hint: seo ? `${seo.metrics.partners} public partner profiles` : "analytics vendor scope",
      href: "/admin/partners",
      meta: "selected scope"
    },
    {
      label: "Active offers",
      value: current?.activeProducts ?? "—",
      hint: seo ? `${seo.metrics.products} public canonical products` : "approved vendor offers",
      href: "/admin/catalogue",
      meta: "selected scope"
    },
    {
      label: "Product views",
      value: current?.productViews ?? "—",
      hint: deltaLabel(delta(current?.productViews, prior?.productViews)) ?? "no comparable prior baseline",
      href: "/admin/analytics",
      delta: delta(current?.productViews, prior?.productViews),
      meta: "selected period"
    },
    {
      label: "Attributed orders",
      value: current?.attributedOrders ?? "—",
      hint: deltaLabel(delta(current?.attributedOrders, prior?.attributedOrders)) ?? "purchase attribution events",
      href: "/admin/orders",
      delta: delta(current?.attributedOrders, prior?.attributedOrders),
      meta: "selected period"
    },
    {
      label: "Attributed GMV",
      value: euroMinor(current?.revenueMinor),
      hint: deltaLabel(delta(current?.revenueMinor, prior?.revenueMinor)) ?? "analytics purchase attribution",
      href: "/admin/analytics",
      delta: delta(current?.revenueMinor, prior?.revenueMinor),
      meta: "selected period"
    },
    {
      label: "View → order",
      value: pct(current?.conversionRate, current?.conversionRate && current.conversionRate < 0.1 ? 1 : 0),
      hint: `Cart rate ${pct(current?.cartRate, 1)}`,
      href: "/admin/analytics",
      meta: "selected period"
    },
    {
      label: "SEO indexable products",
      value: seo ? seo.metrics.productIndexEligible : "—",
      hint: seo ? `${seo.metrics.products - seo.metrics.productIndexEligible} held back by governance` : "SEO source unavailable",
      href: "/admin/seo",
      tone: seo && seo.metrics.products > seo.metrics.productIndexEligible ? "attention" : seo ? "positive" : "unavailable",
      meta: "snapshot"
    },
    {
      label: "Open vendor liability",
      value: euroMinor(finance?.metrics.openVendorLiabilityMinor),
      hint: financeFindings === undefined ? "finance source unavailable" : `${financeFindings} finance control findings`,
      href: "/admin/finance",
      tone: finance?.metrics.openVendorLiabilityMinor ? "attention" : finance ? "positive" : "unavailable",
      meta: "finance snapshot"
    },
    {
      label: "30d GMV run-rate",
      value: euroMinor(data.forecast.projected30DayRevenueMinor),
      hint: data.forecast.basis,
      href: "#forecast",
      tone: data.forecast.confidence === "insufficient" ? "unavailable" : "neutral",
      meta: `${data.forecast.confidence} confidence`
    },
    {
      label: "Critical actions",
      value: critical,
      hint: `${warnings} warnings · ${opportunities} opportunities`,
      href: "#attention",
      tone: critical ? "critical" : warnings ? "attention" : "positive",
      meta: "cross-platform"
    }
  ];

  const maxCompare = Math.max(current?.revenueMinor ?? 0, prior?.revenueMinor ?? 0, 1);
  const selectedVendor = analytics?.vendors.find((vendor) => vendor.id === filters.vendorId);
  const selectedCategory = analytics?.categories.find((category) => category.code === filters.categoryCode);

  return <main className="vendor-app admin-app admin-launch-control">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined lc-hero">
      <div>
        <div className="eyebrow">Launch Control · Executive cockpit</div>
        <h1>KONTA ΜΟΥ Command Center</h1>
        <p className="lead">Μία συμπαγής εικόνα για readiness, marketplace performance, vendors, catalogue, finance, SEO και platform health. Κάθε αριθμός διατηρεί το πραγματικό source boundary του· όταν δεν υπάρχει αξιόπιστο metric, εμφανίζεται ως μη διαθέσιμο.</p>
      </div>
      <aside className={`lc-readiness-hero${toneClass(kpis[0].tone)}`}>
        <span>Measured readiness</span>
        <strong>{data.readiness.score === undefined ? "—" : `${data.readiness.score}%`}</strong>
        <div className="lc-ring" style={{ "--lc-progress": `${data.readiness.score ?? 0}%` } as React.CSSProperties}><i /></div>
        <small>{data.readiness.measurable}/{data.readiness.total} measurable · {data.dataState.toUpperCase()}</small>
      </aside>
    </section>

    <section className="shell lc-filter-shell" aria-label="Launch Control filters">
      <form method="get" className="lc-filter-bar">
        <label><span>Market</span><select name="market" defaultValue="sparta"><option value="sparta">Sparta · current market</option></select></label>
        <label><span>From</span><input type="date" name="from" defaultValue={filters.from} /></label>
        <label><span>To</span><input type="date" name="to" defaultValue={filters.to} /></label>
        <label><span>Vendor</span><select name="vendor" defaultValue={filters.vendorId ?? ""}><option value="">All vendors</option>{(analytics?.vendors ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label><span>Category</span><select name="category" defaultValue={filters.categoryCode ?? ""}><option value="">All categories</option>{(analytics?.categories ?? []).map((category) => <option key={category.code} value={category.code}>{`${"— ".repeat(category.depth)}${category.label}`}</option>)}</select></label>
        <div className="lc-filter-actions"><button type="submit" className="button">Apply</button><Link className="text-link" href="/admin/launchcontrol/overview">Reset</Link></div>
      </form>
      <div className="lc-filter-context"><span className={`lc-data-state is-${data.dataState}`}>{data.dataState === "live" ? "LIVE SOURCES" : "PARTIAL SOURCES"}</span><span>{selectedVendor?.name ?? "All vendors"} · {selectedCategory?.label ?? "All categories"}</span><span>{filters.from} → {filters.to}</span><span>Refreshed {new Date(data.generatedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}</span></div>
    </section>

    <section className="shell lc-kpi-grid" aria-label="Executive KPI overview">
      {kpis.map((item) => <Link href={item.href} className={`lc-kpi-card${toneClass(item.tone)}`} key={item.label}>
        <div className="lc-kpi-head"><span>{item.label}</span><small>{item.meta}</small></div>
        <strong>{typeof item.value === "number" ? item.value.toLocaleString("el-GR") : item.value}</strong>
        <p>{item.hint}</p>
        {item.delta !== undefined ? <div className="lc-micro-axis"><i style={{ width: `${Math.min(100, Math.max(8, 50 + Math.max(-42, Math.min(42, item.delta))))}%` }} /></div> : null}
      </Link>)}
    </section>

    <section className="shell lc-command-grid">
      <article className="lc-command-card lc-today-card">
        <div className="lc-card-head"><div><span>KONTA ΜΟΥ TODAY</span><h2>Executive interpretation</h2></div><span className={`lc-state-chip is-${data.dataState}`}>{data.dataState}</span></div>
        <p>{data.summary}</p>
        <div className="lc-today-actions">{data.attention.slice(0, 3).map((item) => <Link key={item.id} href={item.href}><span>{item.severity}</span><strong>{item.label}</strong><small>{item.detail}</small></Link>)}</div>
      </article>

      <article id="forecast" className="lc-command-card lc-forecast-card">
        <div className="lc-card-head"><div><span>PREDICTION</span><h2>30-day run-rate</h2></div><span className="lc-state-chip">{data.forecast.confidence}</span></div>
        <div className="lc-forecast-values"><div><span>Projected GMV</span><strong>{euroMinor(data.forecast.projected30DayRevenueMinor)}</strong></div><div><span>Projected orders</span><strong>{data.forecast.projected30DayOrders ?? "—"}</strong></div></div>
        <p>{data.forecast.basis}</p>
        <div className="lc-compare-chart" aria-label="Current versus previous attributed GMV">
          <div><span>Current</span><i style={{ width: barWidth(current?.revenueMinor ?? 0, maxCompare) }} /><b>{euroMinor(current?.revenueMinor)}</b></div>
          <div><span>Previous</span><i style={{ width: barWidth(prior?.revenueMinor ?? 0, maxCompare) }} /><b>{euroMinor(prior?.revenueMinor)}</b></div>
        </div>
      </article>
    </section>

    <section id="readiness" className="shell vendor-section lc-readiness-section">
      <WorkspaceSectionHeading eyebrow="Launch readiness" title="Every score must explain itself" note={`Overall score uses only ${data.readiness.measurable} measurable dimensions. Unconnected dimensions are excluded from the average rather than silently treated as zero or green.`} />
      <div className="lc-readiness-grid">{data.readiness.dimensions.map((dimension) => <Link href={dimension.href} key={dimension.key} className={`lc-readiness-row${toneClass(dimension.tone)}`}>
        <div><span>{dimension.label}</span><small>{dimension.source}</small></div>
        <strong>{dimension.score === undefined ? "—" : `${dimension.score}%`}</strong>
        <div className="lc-readiness-track"><i style={{ width: `${dimension.score ?? 0}%` }} /></div>
        <p>{dimension.detail}</p>
      </Link>)}</div>
    </section>

    <section id="attention" className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Action centre" title={critical ? `${critical} critical signal${critical === 1 ? "" : "s"}` : warnings ? `${warnings} warning signal${warnings === 1 ? "" : "s"}` : "Connected controls are clear"} note="Sorted by severity across operations, vendors, catalogue, finance, SEO and governance. Every signal deep-links to its owning workspace." />
      {data.attention.length ? <div className="lc-attention-list">{data.attention.map((item) => <Link href={item.href} key={item.id} className={`lc-attention-row is-${item.severity}`}><span>{item.severity}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><b>{item.value ?? "→"}</b><i>Open →</i></Link>)}</div> : <div className="workspace-page-empty"><div><div className="eyebrow">Clear</div><h3>No aggregated action is open.</h3><p>Specialist workspaces remain authoritative for their own detail.</p></div></div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Commerce funnel" title="Selected-period customer movement" note="Aggregate analytics only. Funnel stages use the current vendor/category/date scope and do not expose customer-level information." />
      {current ? <div className="lc-funnel-grid">
        <FunnelStep label="Impressions" value={current.impressions} />
        <FunnelStep label="Product views" value={current.productViews} previous={current.impressions} />
        <FunnelStep label="Cart adds" value={current.cartAdds} previous={current.productViews} />
        <FunnelStep label="Checkout starts" value={current.checkoutStarts} previous={current.cartAdds} />
        <FunnelStep label="Orders" value={current.attributedOrders} previous={current.checkoutStarts} />
      </div> : <div className="lc-unavailable-panel"><strong>Commerce funnel unavailable</strong><span>The analytics source could not be loaded for this scope.</span></div>}
    </section>

    <section className="shell vendor-section lc-domain-section">
      <WorkspaceSectionHeading eyebrow="All functions" title="Compact domain overview" note="Sections stay collapsed until detail is needed. The summary line remains visible so the entire platform can be scanned without a long dashboard." />
      <div className="lc-domain-stack">
        <details open><summary><span>Operations</span><strong>{data.dashboard.metrics.orders} total order snapshot</strong><small>{nonReadyHealth} non-ready platform checks · {data.dashboard.metrics.payableProcurements} payable procurements</small></summary><div className="lc-domain-body"><div className="lc-stat-cluster"><div><span>Orders snapshot</span><b>{data.dashboard.metrics.orders}</b></div><div><span>Health checks</span><b>{healthChecks.length || "—"}</b></div><div><span>Non-ready</span><b>{operations ? nonReadyHealth : "—"}</b></div><div><span>Fairness appeals</span><b>{data.dashboard.metrics.fairnessAppeals}</b></div></div><div className="lc-link-row"><Link href="/admin/work">Marketplace operations →</Link><Link href="/admin/orders">Orders →</Link><Link href="/admin/delivery">Delivery →</Link></div></div></details>

        <details><summary><span>Vendors</span><strong>{current?.vendorCount ?? "—"} vendors in analytics scope</strong><small>{vendorApplications.length} onboarding applications · {data.dashboard.metrics.vendorVerificationQueue} requiring verification</small></summary><div className="lc-domain-body"><div className="lc-stage-bars">{[...vendorStateCounts.entries()].sort((a, b) => b[1] - a[1]).map(([state, count]) => <div key={state}><span>{state.replaceAll("_", " ")}</span><i style={{ width: barWidth(count, Math.max(...vendorStateCounts.values(), 1)) }} /><b>{count}</b></div>)}</div><div className="lc-link-row"><Link href="/admin/partners">Partner overview →</Link><Link href="/admin/partners/pipeline">Pipeline →</Link><Link href="/admin/applications">Applications →</Link></div></div></details>

        <details><summary><span>Catalogue</span><strong>{current?.activeProducts ?? "—"} active offers</strong><small>{seo ? `${seo.metrics.productIndexEligible}/${seo.metrics.products} products index-eligible` : "SEO quality inventory unavailable"}</small></summary><div className="lc-domain-body"><div className="lc-stat-cluster"><div><span>Active offers</span><b>{current?.activeProducts ?? "—"}</b></div><div><span>Canonical products</span><b>{seo?.metrics.products ?? "—"}</b></div><div><span>Index eligible</span><b>{seo?.metrics.productIndexEligible ?? "—"}</b></div><div><span>Matching queue</span><b>{data.dashboard.metrics.catalogReviewQueue}</b></div><div><span>Media pending</span><b>{data.dashboard.metrics.pendingMedia}</b></div><div><span>Compliance pending</span><b>{data.dashboard.metrics.pendingCompliance}</b></div></div><div className="lc-link-row"><Link href="/admin/catalogue">Catalogue →</Link><Link href="/admin/matching">Matching →</Link><Link href="/admin/catalogue-intake">Intake →</Link></div></div></details>

        <details><summary><span>Customers & demand</span><strong>{current?.productViews ?? "—"} product views</strong><small>{data.dashboard.analytics.searches} searches in dashboard 30-day market snapshot · {pct(data.dashboard.analytics.searchSuccessRate, 0)} success</small></summary><div className="lc-domain-body"><div className="lc-stat-cluster"><div><span>Searches · 30d snapshot</span><b>{data.dashboard.analytics.searches}</b></div><div><span>Search success</span><b>{pct(data.dashboard.analytics.searchSuccessRate)}</b></div><div><span>Product views · selected</span><b>{current?.productViews ?? "—"}</b></div><div><span>Unique viewers</span><b>{current?.uniqueViewers ?? "—"}</b></div></div><div className="lc-link-row"><Link href="/admin/demand">Demand Intelligence →</Link><Link href="/admin/customers">Customers →</Link><Link href="/admin/ask-local">Ask Local →</Link></div></div></details>

        <details><summary><span>Finance</span><strong>{euroMinor(finance?.metrics.capturedGmvMinor)} captured product GMV</strong><small>{financeFindings === undefined ? "Finance source unavailable" : `${financeFindings} control findings · ${euroMinor(finance?.metrics.openVendorLiabilityMinor)} open vendor liability`}</small></summary><div className="lc-domain-body">{finance ? <><div className="lc-money-grid"><div><span>Captured product GMV</span><b>{euroMinor(finance.metrics.capturedGmvMinor)}</b><small>lifetime snapshot · not platform revenue</small></div><div><span>Expected platform fees</span><b>{euroMinor(finance.metrics.expectedPlatformFeeMinor)}</b></div><div><span>Issued fee revenue · net</span><b>{euroMinor(finance.metrics.issuedPlatformFeeNetMinor)}</b></div><div><span>Open vendor liability</span><b>{euroMinor(finance.metrics.openVendorLiabilityMinor)}</b></div><div><span>Completed refunds</span><b>{euroMinor(finance.metrics.completedRefundMinor)}</b></div><div><span>Paid vendors</span><b>{euroMinor(finance.metrics.paidVendorMinor)}</b></div></div><div className="lc-link-row"><Link href="/admin/finance">Finance →</Link><Link href="/admin/finance/vendor-billing">Vendor Billing →</Link><Link href="/admin/tax">Tax & myDATA →</Link></div></> : <div className="lc-unavailable-panel"><strong>Finance unavailable</strong><span>No finance snapshot was returned for this session/runtime.</span></div>}</div></details>

        <details><summary><span>SEO & Discovery</span><strong>{seo?.metrics.sitemapEstimatedCount ?? "—"} estimated sitemap URLs</strong><small>{seoCritical} critical · {seoWarnings} warnings · {seo?.metrics.productIndexEligible ?? "—"} indexable products</small></summary><div className="lc-domain-body">{seo ? <><div className="lc-stat-cluster"><div><span>Products</span><b>{seo.metrics.products}</b></div><div><span>Index eligible</span><b>{seo.metrics.productIndexEligible}</b></div><div><span>Research vendors</span><b>{seo.metrics.research}</b></div><div><span>Research eligible</span><b>{seo.metrics.researchIndexEligible}</b></div><div><span>Estimated sitemap</span><b>{seo.metrics.sitemapEstimatedCount}</b></div><div><span>Governed overrides</span><b>{seo.metrics.entityOverrides}</b></div></div><div className="lc-diagnostics">{seo.diagnostics.filter((item) => item.severity === "critical" || item.severity === "warning").slice(0, 5).map((item) => <div key={item.id}><span>{item.severity}</span><strong>{item.title}</strong><small>{item.count ?? ""}</small></div>)}</div><div className="lc-link-row"><Link href="/admin/seo">SEO Overview →</Link><Link href="/admin/seo/issues">Issues →</Link><Link href="/admin/seo/search-console">Search Console →</Link></div></> : <div className="lc-unavailable-panel"><strong>SEO unavailable</strong><span>SEO governance data could not be loaded.</span></div>}</div></details>

        <details><summary><span>Technology & platform</span><strong>{data.dashboard.health.ok ? "Healthy" : "Attention"}</strong><small>{operations ? `${nonReadyHealth} non-ready health checks` : "health details unavailable"} · {failingJobs === undefined ? "maintenance unavailable" : `${failingJobs} failing jobs`} · {activeEvidenceIssues} evidence issues</small></summary><div className="lc-domain-body"><div className="lc-health-list">{healthChecks.slice(0, 12).map((check) => <div key={check.name}><span className={isHealthyStateForUi(check.state) ? "is-good" : "is-bad"}>●</span><strong>{check.name}</strong><small>{String(check.state)}</small></div>)}</div><div className="lc-link-row"><Link href="/admin/platform">Platform →</Link><Link href="/admin/operations">Health & Audit →</Link><Link href="/admin/maintenance">Jobs →</Link><Link href="/admin/activation">Production Readiness →</Link></div></div></details>

        <details><summary><span>Compliance & trust</span><strong>{data.dashboard.metrics.pendingCompliance + data.dashboard.metrics.pendingMedia} pending review items</strong><small>{data.dashboard.metrics.pendingCompliance} compliance · {data.dashboard.metrics.pendingMedia} media · denominator intentionally not invented</small></summary><div className="lc-domain-body"><div className="lc-stat-cluster"><div><span>Compliance pending</span><b>{data.dashboard.metrics.pendingCompliance}</b></div><div><span>Media pending</span><b>{data.dashboard.metrics.pendingMedia}</b></div><div><span>Fairness appeals</span><b>{data.dashboard.metrics.fairnessAppeals}</b></div></div><div className="lc-link-row"><Link href="/admin/trust">Trust →</Link><Link href="/admin/recalls">Product Safety →</Link><Link href="/admin/fairness">Fairness →</Link></div></div></details>

        <details><summary><span>Geographic expansion</span><strong>Sparta · connected</strong><small>Hub-ready architecture; cross-market analytics are not connected yet</small></summary><div className="lc-domain-body"><div className="lc-hub-card"><div><span>Current market</span><strong>Sparta</strong><small>Vendor, catalogue, analytics and SEO sources currently resolve against the Sparta market boundary.</small></div><div><span>Additional hubs</span><strong>NOT CONNECTED</strong><small>No synthetic Tripoli/Kalamata/etc. readiness is shown until those market datasets exist in the runtime.</small></div></div><p className="lc-footnote">The filter contract already carries a market dimension. The underlying existing analytics/SEO services are still Sparta-scoped, so Launch Control refuses to simulate other hubs.</p></div></details>
      </div>
    </section>

    <section className="shell lc-source-note"><strong>Metric integrity</strong><p>Selected-period metrics come from aggregate marketplace analytics. Finance cards are current/lifetime accounting snapshots where stated. Platform and readiness cards are evidence snapshots. A dash (—) means the source is unavailable or the denominator is not defensible; it never means zero.</p></section>
  </main>;
}

function isHealthyStateForUi(value: unknown): boolean {
  return ["ready", "healthy", "ok", "passed", "disabled"].includes(String(value ?? "").toLowerCase());
}
