import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminFinanceOverview } from "./admin-finance-overview";
import { adminMaintenanceWorkspace } from "./admin-governance-runtime";
import {
  adminActivationWorkspace,
  adminDashboard,
  adminOperationsWorkspace,
  adminVendorsWorkspace,
  hasAdminPermission
} from "./admin-runtime";
import {
  adminVendorAnalyticsReport,
  normalizeAdminAnalyticsFilters,
  type AdminAnalyticsFilters,
  type AdminVendorAnalyticsReport
} from "./admin-analytics-reporting";
import { adminSeoWorkspace } from "./admin-seo-runtime";
import { WEB_BUILD_VERSION } from "./build";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LaunchControlFilters = AdminAnalyticsFilters & Readonly<{
  market: "sparta";
}>;

export type LaunchControlTone = "positive" | "attention" | "critical" | "neutral" | "unavailable";

export type LaunchControlReadinessDimension = Readonly<{
  key: "technology" | "vendors" | "catalogue" | "operations" | "payments" | "seo" | "compliance" | "marketing";
  label: string;
  score?: number;
  tone: LaunchControlTone;
  detail: string;
  href: string;
  source: string;
}>;

export type LaunchControlAttention = Readonly<{
  id: string;
  severity: "critical" | "warning" | "opportunity";
  label: string;
  detail: string;
  value?: number;
  href: string;
}>;

export type LaunchControlForecast = Readonly<{
  projected30DayRevenueMinor?: number;
  projected30DayOrders?: number;
  confidence: "insufficient" | "low" | "medium" | "high";
  basis: string;
}>;

export type LaunchControlWorkspace = Readonly<{
  generatedAt: number;
  filters: LaunchControlFilters;
  dataState: "live" | "partial";
  dashboard: Awaited<ReturnType<typeof adminDashboard>>;
  analytics?: AdminVendorAnalyticsReport;
  previousAnalytics?: AdminVendorAnalyticsReport;
  seo?: Awaited<ReturnType<typeof adminSeoWorkspace>>;
  finance?: Awaited<ReturnType<typeof adminFinanceOverview>>;
  operations?: Awaited<ReturnType<typeof adminOperationsWorkspace>>;
  maintenance?: Awaited<ReturnType<typeof adminMaintenanceWorkspace>>;
  activation?: Awaited<ReturnType<typeof adminActivationWorkspace>>;
  vendors?: Awaited<ReturnType<typeof adminVendorsWorkspace>>;
  readiness: Readonly<{
    score?: number;
    measurable: number;
    total: number;
    dimensions: readonly LaunchControlReadinessDimension[];
  }>;
  attention: readonly LaunchControlAttention[];
  forecast: LaunchControlForecast;
  summary: string;
}>;

function safeScore(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) return undefined;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function scoreTone(score: number | undefined): LaunchControlTone {
  if (score === undefined) return "unavailable";
  if (score >= 90) return "positive";
  if (score >= 70) return "neutral";
  if (score >= 50) return "attention";
  return "critical";
}

function isHealthyState(value: unknown): boolean {
  return ["ready", "healthy", "ok", "passed"].includes(String(value ?? "").toLowerCase());
}

function priorPeriod(filters: AdminAnalyticsFilters): AdminAnalyticsFilters {
  const from = new Date(`${filters.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${filters.to}T00:00:00.000Z`).getTime();
  const spanDays = Math.floor((to - from) / DAY_MS) + 1;
  const previousTo = from - DAY_MS;
  const previousFrom = previousTo - ((spanDays - 1) * DAY_MS);
  return {
    ...filters,
    from: new Date(previousFrom).toISOString().slice(0, 10),
    to: new Date(previousTo).toISOString().slice(0, 10)
  };
}

function buildForecast(report: AdminVendorAnalyticsReport | undefined): LaunchControlForecast {
  if (!report) return { confidence: "insufficient", basis: "Marketplace analytics are unavailable for the selected scope." };
  const from = new Date(`${report.filters.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${report.filters.to}T00:00:00.000Z`).getTime();
  const days = Math.floor((to - from) / DAY_MS) + 1;
  if (days < 7 || report.summary.attributedOrders < 3) {
    return { confidence: "insufficient", basis: "At least 7 days and 3 attributed orders are required before a run-rate forecast is shown." };
  }
  const projected30DayRevenueMinor = Math.round((report.summary.revenueMinor / days) * 30);
  const projected30DayOrders = Math.round((report.summary.attributedOrders / days) * 30);
  const confidence = days >= 30 && report.summary.attributedOrders >= 30
    ? "high"
    : days >= 14 && report.summary.attributedOrders >= 10
      ? "medium"
      : "low";
  return {
    projected30DayRevenueMinor,
    projected30DayOrders,
    confidence,
    basis: `${days}-day observed run rate · ${report.summary.attributedOrders} attributed orders. This is a deterministic pace projection, not an AI certainty.`
  };
}

function buildSummary(input: {
  readinessScore?: number;
  attention: readonly LaunchControlAttention[];
  analytics?: AdminVendorAnalyticsReport;
  previousAnalytics?: AdminVendorAnalyticsReport;
  forecast: LaunchControlForecast;
}): string {
  const clauses: string[] = [];
  if (input.readinessScore !== undefined) clauses.push(`Measured launch readiness is ${input.readinessScore}%.`);
  else clauses.push("Launch readiness is only partially measurable with the currently connected evidence.");

  const critical = input.attention.filter((item) => item.severity === "critical").length;
  const warning = input.attention.filter((item) => item.severity === "warning").length;
  if (critical) clauses.push(`${critical} critical control signal${critical === 1 ? " requires" : "s require"} intervention.`);
  else if (warning) clauses.push(`${warning} warning signal${warning === 1 ? " needs" : "s need"} follow-up.`);
  else clauses.push("No aggregated critical or warning signal is currently open in the connected workspaces.");

  if (input.analytics && input.previousAnalytics) {
    const current = input.analytics.summary.attributedOrders;
    const previous = input.previousAnalytics.summary.attributedOrders;
    if (previous > 0) {
      const delta = Math.round(((current - previous) / previous) * 100);
      clauses.push(`Attributed orders are ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)}% versus the previous equivalent period.`);
    } else if (current > 0) clauses.push("The selected period has attributed orders while the previous equivalent period had none.");
  }

  if (input.forecast.confidence !== "insufficient") clauses.push(`The 30-day commerce projection currently carries ${input.forecast.confidence} confidence.`);
  return clauses.join(" ");
}

export function normalizeLaunchControlFilters(
  input: Readonly<{ from?: string; to?: string; vendorId?: string; categoryCode?: string; market?: string }>,
  now = Date.now()
): LaunchControlFilters {
  const analytics = normalizeAdminAnalyticsFilters(input, now);
  return { ...analytics, market: "sparta" };
}

export async function adminLaunchControlWorkspace(
  principal: SessionPrincipal,
  filters: LaunchControlFilters
): Promise<LaunchControlWorkspace> {
  const generatedAt = Date.now();
  const dashboard = await adminDashboard(principal);

  const canAnalytics = hasAdminPermission(principal, "analytics.market.read");
  const canFinance = hasAdminPermission(principal, "finance.read");
  const canSeo = hasAdminPermission(principal, "content.read");
  const canPlatform = hasAdminPermission(principal, "admin.audit.read");
  const canVendors = hasAdminPermission(principal, "vendor.manage");

  const [analytics, previousAnalytics, seo, finance, operations, maintenance, activation, vendors] = await Promise.all([
    canAnalytics ? adminVendorAnalyticsReport(principal, filters).catch(() => undefined) : undefined,
    canAnalytics ? adminVendorAnalyticsReport(principal, priorPeriod(filters)).catch(() => undefined) : undefined,
    canSeo ? adminSeoWorkspace(principal).catch(() => undefined) : undefined,
    canFinance ? adminFinanceOverview(principal).catch(() => undefined) : undefined,
    canPlatform ? adminOperationsWorkspace(principal).catch(() => undefined) : undefined,
    canPlatform ? adminMaintenanceWorkspace(principal).catch(() => undefined) : undefined,
    canPlatform ? adminActivationWorkspace(principal).catch(() => undefined) : undefined,
    canVendors ? adminVendorsWorkspace(principal).catch(() => undefined) : undefined
  ]);

  const now = Date.now();
  const currentEvidence = activation?.evidence.filter((row) => row.buildVersion === WEB_BUILD_VERSION && (!row.expiresAt || row.expiresAt > now)) ?? [];
  const activationPassed = currentEvidence.filter((row) => row.status === "passed").length;
  const technologyScore = safeScore(activationPassed, currentEvidence.length);

  const paymentEvidence = currentEvidence.filter((row) => `${row.provider} ${row.checkName}`.toLowerCase().match(/viva|payment/));
  const paymentScore = safeScore(paymentEvidence.filter((row) => row.status === "passed").length, paymentEvidence.length);

  const operationChecks = operations?.health.checks ?? [];
  const operationScore = safeScore(operationChecks.filter((check) => isHealthyState(check.state) || String(check.state).toLowerCase() === "disabled").length, operationChecks.length);

  const catalogueScore = seo ? safeScore(seo.metrics.productIndexEligible, seo.metrics.products) : undefined;
  const seoEligible = seo ? seo.metrics.productIndexEligible + seo.metrics.researchIndexEligible : 0;
  const seoTotal = seo ? seo.metrics.products + seo.metrics.research : 0;
  const seoScore = seo ? safeScore(seoEligible, seoTotal) : undefined;

  const vendorTotal = analytics?.summary.vendorCount ?? 0;
  const partnerCount = seo?.metrics.partners ?? 0;
  const vendorScore = vendorTotal > 0 && partnerCount <= vendorTotal ? safeScore(partnerCount, vendorTotal) : undefined;

  const dimensions: LaunchControlReadinessDimension[] = [
    { key: "technology", label: "Technology", score: technologyScore, tone: scoreTone(technologyScore), detail: technologyScore === undefined ? "No fresh current-build provider evidence is available." : `${activationPassed}/${currentEvidence.length} fresh current-build provider checks passed.`, href: "/admin/activation", source: "Production Readiness" },
    { key: "vendors", label: "Vendors", score: vendorScore, tone: scoreTone(vendorScore), detail: vendorScore === undefined ? "A defensible active-vendor denominator is not available for this scope." : `${partnerCount}/${vendorTotal} vendors in the analytics scope are represented as public partners.`, href: "/admin/partners", source: "Partners + Analytics" },
    { key: "catalogue", label: "Catalogue", score: catalogueScore, tone: scoreTone(catalogueScore), detail: seo ? `${seo.metrics.productIndexEligible}/${seo.metrics.products} public products pass the SEO quality/index gate.` : "Catalogue readiness source is unavailable.", href: "/admin/catalogue", source: "SEO product quality gate" },
    { key: "operations", label: "Operations", score: operationScore, tone: scoreTone(operationScore), detail: operations ? `${operationChecks.filter((check) => isHealthyState(check.state) || String(check.state).toLowerCase() === "disabled").length}/${operationChecks.length} platform health checks are ready/healthy/disabled.` : "Operational health evidence is unavailable.", href: "/admin/operations", source: "System Health" },
    { key: "payments", label: "Payments", score: paymentScore, tone: scoreTone(paymentScore), detail: paymentScore === undefined ? "No fresh payment-provider readiness evidence is available." : `${paymentEvidence.filter((row) => row.status === "passed").length}/${paymentEvidence.length} payment evidence checks passed.`, href: "/admin/activation", source: "Production Readiness" },
    { key: "seo", label: "SEO", score: seoScore, tone: scoreTone(seoScore), detail: seo ? `${seoEligible}/${seoTotal} governed product/research-vendor entities pass their current index-quality gate.` : "SEO readiness source is unavailable.", href: "/admin/seo", source: "SEO & Visibility" },
    { key: "compliance", label: "Compliance", tone: "unavailable", detail: `${dashboard.metrics.pendingCompliance} pending compliance review${dashboard.metrics.pendingCompliance === 1 ? "" : "s"}; no complete denominator exists, so no percentage is invented.`, href: "/admin/trust", source: "Trust review queue" },
    { key: "marketing", label: "Marketing", tone: "unavailable", detail: "No governed marketing-readiness metric is connected yet.", href: "/admin/content", source: "Not connected" }
  ];
  const measurableScores = dimensions.flatMap((dimension) => dimension.score === undefined ? [] : [dimension.score]);
  const readinessScore = measurableScores.length ? Math.round(measurableScores.reduce((sum, score) => sum + score, 0) / measurableScores.length) : undefined;

  const attention: LaunchControlAttention[] = [];
  if (!dashboard.health.ok) attention.push({ id: "dashboard-health", severity: "critical", label: "Platform health", detail: "The aggregate Admin health snapshot is not ready.", value: 1, href: "/admin/operations" });
  if (dashboard.metrics.vendorVerificationQueue > 0) attention.push({ id: "vendor-verification", severity: "warning", label: "Vendor verification", detail: "Applications or restricted vendor records require a decision.", value: dashboard.metrics.vendorVerificationQueue, href: "/admin/partners/pipeline" });
  if (dashboard.metrics.catalogReviewQueue > 0) attention.push({ id: "catalog-review", severity: "warning", label: "Catalogue matching", detail: "Canonical matches/offers are waiting for review.", value: dashboard.metrics.catalogReviewQueue, href: "/admin/matching" });
  if (dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance > 0) attention.push({ id: "trust-review", severity: "warning", label: "Trust review", detail: "Media or compliance evidence is waiting for review.", value: dashboard.metrics.pendingMedia + dashboard.metrics.pendingCompliance, href: "/admin/trust" });
  if (dashboard.metrics.payableProcurements > 0) attention.push({ id: "payables", severity: "warning", label: "Supplier payables", detail: "Procurements are ready for finance action.", value: dashboard.metrics.payableProcurements, href: "/admin/finance" });
  if (dashboard.metrics.fairnessAppeals > 0) attention.push({ id: "fairness", severity: "warning", label: "Fairness appeals", detail: "Governance appeals are open or under review.", value: dashboard.metrics.fairnessAppeals, href: "/admin/fairness" });

  if (finance) {
    const financeFindings = Object.values(finance.controls).reduce((sum, value) => sum + value, 0);
    if (financeFindings > 0) attention.push({ id: "finance-controls", severity: "warning", label: "Finance controls", detail: "Finance diagnostics contain open reconciliation, evidence or payout prerequisites.", value: financeFindings, href: "/admin/finance#finance-diagnostics" });
  }
  if (seo) {
    const seoCritical = seo.diagnostics.filter((item) => item.severity === "critical").length;
    const seoWarnings = seo.diagnostics.filter((item) => item.severity === "warning").length;
    if (seoCritical > 0) attention.push({ id: "seo-critical", severity: "critical", label: "SEO critical diagnostics", detail: "Search visibility has critical governed diagnostics.", value: seoCritical, href: "/admin/seo/issues" });
    else if (seoWarnings > 0) attention.push({ id: "seo-warning", severity: "warning", label: "SEO warnings", detail: "Search visibility has warning-level diagnostics.", value: seoWarnings, href: "/admin/seo/issues" });
  }
  if (analytics && analytics.summary.productViews > 0 && analytics.summary.cartAdds === 0) {
    attention.push({ id: "demand-no-cart", severity: "opportunity", label: "Viewed demand without cart activity", detail: "The selected period has product views but no add-to-cart event. Inspect demand and product fit.", value: analytics.summary.productViews, href: "/admin/demand" });
  }

  const severityOrder = { critical: 0, warning: 1, opportunity: 2 } as const;
  attention.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (b.value ?? 0) - (a.value ?? 0));

  const forecast = buildForecast(analytics);
  const summary = buildSummary({ readinessScore, attention, analytics, previousAnalytics, forecast });
  const expectedSources = [analytics, seo, canFinance ? finance : true, canPlatform ? operations : true, canPlatform ? activation : true];
  const dataState = expectedSources.every(Boolean) ? "live" : "partial";

  return {
    generatedAt,
    filters,
    dataState,
    dashboard,
    analytics,
    previousAnalytics,
    seo,
    finance,
    operations,
    maintenance,
    activation,
    vendors,
    readiness: { score: readinessScore, measurable: measurableScores.length, total: dimensions.length, dimensions },
    attention,
    forecast,
    summary
  };
}
