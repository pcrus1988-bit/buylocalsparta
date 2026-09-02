import type { SeoDiagnosticReport, SeoDiagnosticSeverity } from "./seo-diagnostic-reports";

export type SeoReportTrendPoint = Readonly<{
  id: string;
  createdAt: string;
  reason: string;
  score: number;
  critical: number;
  warning: number;
  sitemapEstimatedCount: number;
  productIndexEligible: number;
  vendorIndexEligible: number;
  crawlOrphans: number;
  crawlWeak: number;
}>;

export type SeoReportRecurringFinding = Readonly<{
  id: string;
  title: string;
  detail: string;
  severity: SeoDiagnosticSeverity;
  occurrences: number;
  current: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}>;

export type SeoReportComparisonMetric = Readonly<{
  key: string;
  label: string;
  previous: number;
  current: number;
  delta: number;
  lowerIsBetter?: boolean;
}>;

const SEVERITY_ORDER: Readonly<Record<SeoDiagnosticSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
  good: 3
};

function boundedLimit(value: number, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

export function seoReportTrendSeries(reports: readonly SeoDiagnosticReport[], requestedLimit = 12): readonly SeoReportTrendPoint[] {
  const limit = boundedLimit(requestedLimit, 12, 50);
  return reports.slice(0, limit).reverse().map((report) => ({
    id: report.id,
    createdAt: report.createdAt,
    reason: report.reason,
    score: report.score,
    critical: report.severityCounts.critical,
    warning: report.severityCounts.warning,
    sitemapEstimatedCount: report.metrics.sitemapEstimatedCount,
    productIndexEligible: report.metrics.productIndexEligible,
    vendorIndexEligible: report.metrics.vendorIndexEligible,
    crawlOrphans: report.metrics.crawlOrphans,
    crawlWeak: report.metrics.crawlWeak
  }));
}

export function seoReportRecurringFindings(reports: readonly SeoDiagnosticReport[], requestedLimit = 12): readonly SeoReportRecurringFinding[] {
  const limit = boundedLimit(requestedLimit, 12, 50);
  const window = reports.slice(0, limit);
  const currentIds = new Set(window[0]?.diagnostics.filter((item) => item.severity !== "good").map((item) => item.id) ?? []);
  const byId = new Map<string, SeoReportRecurringFinding>();

  for (const report of [...window].reverse()) {
    for (const diagnostic of report.diagnostics.filter((item) => item.severity !== "good")) {
      const existing = byId.get(diagnostic.id);
      const severity = !existing || SEVERITY_ORDER[diagnostic.severity] < SEVERITY_ORDER[existing.severity]
        ? diagnostic.severity
        : existing.severity;
      byId.set(diagnostic.id, {
        id: diagnostic.id,
        title: diagnostic.title,
        detail: diagnostic.detail,
        severity,
        occurrences: (existing?.occurrences ?? 0) + 1,
        current: currentIds.has(diagnostic.id),
        firstSeenAt: existing?.firstSeenAt ?? report.createdAt,
        lastSeenAt: report.createdAt
      });
    }
  }

  return [...byId.values()].sort((left, right) =>
    Number(right.current) - Number(left.current)
      || SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
      || right.occurrences - left.occurrences
      || right.lastSeenAt.localeCompare(left.lastSeenAt)
  );
}

export function seoReportComparison(current: SeoDiagnosticReport, previous: SeoDiagnosticReport): readonly SeoReportComparisonMetric[] {
  const metrics: readonly SeoReportComparisonMetric[] = [
    { key: "health", label: "Health score", previous: previous.score, current: current.score, delta: current.score - previous.score },
    { key: "sitemap", label: "Estimated sitemap URLs", previous: previous.metrics.sitemapEstimatedCount, current: current.metrics.sitemapEstimatedCount, delta: current.metrics.sitemapEstimatedCount - previous.metrics.sitemapEstimatedCount },
    { key: "products", label: "Index-eligible products", previous: previous.metrics.productIndexEligible, current: current.metrics.productIndexEligible, delta: current.metrics.productIndexEligible - previous.metrics.productIndexEligible },
    { key: "vendors", label: "Index-eligible vendors", previous: previous.metrics.vendorIndexEligible, current: current.metrics.vendorIndexEligible, delta: current.metrics.vendorIndexEligible - previous.metrics.vendorIndexEligible },
    { key: "orphans", label: "Indexable orphans", previous: previous.metrics.crawlOrphans, current: current.metrics.crawlOrphans, delta: current.metrics.crawlOrphans - previous.metrics.crawlOrphans, lowerIsBetter: true },
    { key: "weak", label: "Weakly linked URLs", previous: previous.metrics.crawlWeak, current: current.metrics.crawlWeak, delta: current.metrics.crawlWeak - previous.metrics.crawlWeak, lowerIsBetter: true },
    { key: "critical", label: "Critical diagnostics", previous: previous.severityCounts.critical, current: current.severityCounts.critical, delta: current.severityCounts.critical - previous.severityCounts.critical, lowerIsBetter: true },
    { key: "warnings", label: "Warnings", previous: previous.severityCounts.warning, current: current.severityCounts.warning, delta: current.severityCounts.warning - previous.severityCounts.warning, lowerIsBetter: true }
  ];
  return metrics;
}
