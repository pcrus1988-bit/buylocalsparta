import "server-only";

import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminSeoWorkspace } from "./admin-seo-runtime";
import { getSeoCrawlHistorySnapshot } from "./seo-crawl-history";
import { seoDiagnosticRegressionSignals } from "./seo-diagnostic-monitoring";
import { getSearchConsoleHistoryWorkspace } from "./seo-gsc-history";
import { getSeoGscIndexCoverageWorkspace } from "./seo-gsc-index-coverage";
import { getSeoSchemaDiagnosticsWorkspace } from "./seo-schema-diagnostics";
import { getSeoSitemapHistoryWorkspace } from "./seo-sitemap-history";
import { getSeoUrlRegistryWorkspace } from "./seo-url-registry";

export const SEO_EVIDENCE_MAX_AGE_HOURS = Object.freeze({
  crawl: 24,
  sitemap: 24,
  searchConsole: 72
});

export type SeoOperationalCheckState = "pass" | "warning" | "fail" | "unknown";

export type SeoOperationalCheck = Readonly<{
  id: string;
  label: string;
  state: SeoOperationalCheckState;
  detail: string;
  href: string;
}>;

export type SeoEvidenceFreshness = Readonly<{
  capturedAt?: string;
  maxAgeHours: number;
  ageHours?: number;
  stale: boolean;
}>;

export type SeoUnifiedReportWorkspace = Readonly<{
  generatedAt: string;
  status: "healthy" | "attention" | "blocked";
  checks: readonly SeoOperationalCheck[];
  metrics: Readonly<{
    governedUrls: number;
    desiredIndexable: number;
    actualSitemap: number;
    sitemapExpectedMissing: number;
    sitemapUnexpectedActual: number;
    openIssues: number;
    criticalOpenIssues: number;
    latestCrawlIssues: number;
    gscClicks: number;
    gscImpressions: number;
    gscPages: number;
    gscCoverageGoverned: number;
    gscCoverageInspected: number;
    gscCoverageHealthy: number;
    gscCoverageAttention: number;
    gscCoverageMissing: number;
    gscCoverageStale: number;
    gscCoverageHardFailures: number;
    gscCoverageCanonicalMismatch: number;
    gscCoverageFailedVerdict: number;
    gscCoveragePartialVerdict: number;
    gscCoverageIndexingBlocked: number;
    gscCoverageFetchFailed: number;
    schemaManaged: number;
    schemaHealthy: number;
    schemaMissing: number;
    schemaInvalid: number;
    schemaUnexpected: number;
    schemaNotChecked: number;
  }>;
  freshness: Readonly<{
    crawl: SeoEvidenceFreshness;
    sitemap: SeoEvidenceFreshness;
    searchConsole: SeoEvidenceFreshness;
  }>;
  latestGscCapturedAt?: string;
  latestSitemapCapturedAt?: string;
  latestCrawlCompletedAt?: string;
  reports: Awaited<ReturnType<typeof adminSeoWorkspace>>["reports"];
  regressionSignals: ReturnType<typeof seoDiagnosticRegressionSignals>;
}>;

function check(id: string, label: string, state: SeoOperationalCheckState, detail: string, href: string): SeoOperationalCheck {
  return { id, label, state, detail, href };
}

function overallStatus(checks: readonly SeoOperationalCheck[]): SeoUnifiedReportWorkspace["status"] {
  if (checks.some((item) => item.state === "fail")) return "blocked";
  if (checks.some((item) => item.state === "warning" || item.state === "unknown")) return "attention";
  return "healthy";
}

function evidenceFreshness(capturedAt: string | undefined, maxAgeHours: number, nowMs: number): SeoEvidenceFreshness {
  if (!capturedAt) return { maxAgeHours, stale: true };
  const capturedMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedMs)) return { capturedAt, maxAgeHours, stale: true };
  const ageHours = Math.max(0, (nowMs - capturedMs) / 3_600_000);
  return { capturedAt, maxAgeHours, ageHours, stale: ageHours > maxAgeHours };
}

function freshnessLabel(value: SeoEvidenceFreshness): string {
  if (!value.capturedAt || value.ageHours === undefined) return "no retained evidence";
  const rounded = value.ageHours < 1 ? "<1h" : `${Math.round(value.ageHours)}h`;
  return value.stale ? `stale (${rounded}; target ≤${value.maxAgeHours}h)` : `fresh (${rounded}; target ≤${value.maxAgeHours}h)`;
}

export async function getSeoUnifiedReportWorkspace(principal: SessionPrincipal): Promise<SeoUnifiedReportWorkspace> {
  const [overview, registry, crawl, sitemap, gsc, gscCoverage, schema] = await Promise.all([
    adminSeoWorkspace(principal),
    getSeoUrlRegistryWorkspace(principal),
    getSeoCrawlHistorySnapshot(principal),
    getSeoSitemapHistoryWorkspace(principal),
    getSearchConsoleHistoryWorkspace(principal),
    getSeoGscIndexCoverageWorkspace(principal),
    getSeoSchemaDiagnosticsWorkspace(principal)
  ]);

  const generatedAt = new Date().toISOString();
  const nowMs = Date.parse(generatedAt);
  const latestCrawlCompletedAt = crawl.runs[0]?.completedAt;
  const latestSitemapCapturedAt = sitemap.latest?.capturedAt;
  const latestGscCapturedAt = gsc.latest?.capturedAt;
  const freshness = {
    crawl: evidenceFreshness(latestCrawlCompletedAt, SEO_EVIDENCE_MAX_AGE_HOURS.crawl, nowMs),
    sitemap: evidenceFreshness(latestSitemapCapturedAt, SEO_EVIDENCE_MAX_AGE_HOURS.sitemap, nowMs),
    searchConsole: evidenceFreshness(latestGscCapturedAt, SEO_EVIDENCE_MAX_AGE_HOURS.searchConsole, nowMs)
  } as const;

  const overviewCritical = overview.diagnostics.filter((item) => item.severity === "critical").length;
  const overviewWarnings = overview.diagnostics.filter((item) => item.severity === "warning").length;
  const latestReport = overview.reports.reports[0];
  const previousReport = overview.reports.reports[1];
  const regressionSignals = seoDiagnosticRegressionSignals(latestReport, previousReport);
  const googleCoverageHardFailures = gscCoverage.rows.filter((row) => row.canonicalMismatch
    || row.verdict === "FAIL"
    || Boolean(row.indexingState && row.indexingState !== "INDEXING_ALLOWED")
    || Boolean(row.pageFetchState && row.pageFetchState !== "SUCCESSFUL")).length;

  const checks: SeoOperationalCheck[] = [
    check(
      "governed-url-registry",
      "Governed URL registry",
      !registry.persistenceAvailable ? "unknown" : registry.metrics.withCriticalIssues > 0 ? "fail" : registry.metrics.withOpenIssues > 0 ? "warning" : "pass",
      !registry.persistenceAvailable
        ? "Persistent page-level SEO evidence is unavailable."
        : `${registry.metrics.active} active URLs · ${registry.metrics.withOpenIssues} URLs with open issues · ${registry.metrics.withCriticalIssues} critical.`,
      "/admin/seo/pages"
    ),
    check(
      "crawl-issues",
      "Production crawl findings",
      !crawl.persistenceAvailable || !latestCrawlCompletedAt ? "unknown" : crawl.metrics.criticalOpen > 0 ? "fail" : crawl.metrics.open > 0 || freshness.crawl.stale ? "warning" : "pass",
      !crawl.persistenceAvailable
        ? "Durable crawl history is unavailable."
        : !latestCrawlCompletedAt
          ? "No production crawl evidence has been retained yet."
          : `${crawl.metrics.open} open findings · ${crawl.metrics.criticalOpen} critical · ${crawl.metrics.latestRunIssues} findings in latest run · ${freshnessLabel(freshness.crawl)}.`,
      "/admin/seo/issues"
    ),
    check(
      "sitemap-evidence",
      "Production sitemap",
      !sitemap.persistenceAvailable || !sitemap.latest ? "unknown" : !sitemap.latest.valid ? "fail" : sitemap.metrics.expectedMissing > 0 || sitemap.metrics.unexpectedActual > 0 || freshness.sitemap.stale ? "warning" : "pass",
      !sitemap.latest
        ? "No production sitemap snapshot has been retained yet."
        : `${sitemap.latest.valid ? "Valid" : "Invalid"} snapshot · ${sitemap.metrics.latestEntries} URLs · ${sitemap.metrics.expectedMissing} expected missing · ${sitemap.metrics.unexpectedActual} unexpected actual · ${freshnessLabel(freshness.sitemap)}.`,
      "/admin/seo/sitemaps"
    ),
    check(
      "search-console",
      "Search Console evidence",
      !gsc.persistenceAvailable || !gsc.latest ? "unknown" : freshness.searchConsole.stale ? "warning" : "pass",
      !gsc.latest
        ? "No retained Search Console performance sync is available yet."
        : `${gsc.latest.clicks} clicks · ${gsc.latest.impressions} impressions · ${gsc.pages.length} retained page rows for ${gsc.latest.startDate} → ${gsc.latest.endDate} · ${freshnessLabel(freshness.searchConsole)}.`,
      "/admin/seo/search-console"
    ),
    check(
      "google-index-coverage",
      "Google index coverage",
      !gscCoverage.persistenceAvailable
        ? "unknown"
        : googleCoverageHardFailures > 0
          ? "fail"
          : gscCoverage.metrics.missing > 0 || gscCoverage.metrics.stale > 0 || gscCoverage.metrics.partialVerdict > 0 || gscCoverage.metrics.attention > 0
            ? "warning"
            : "pass",
      !gscCoverage.persistenceAvailable
        ? "Retained Google URL Inspection coverage requires the PostgreSQL SEO URL registry and inspection evidence."
        : `${gscCoverage.metrics.healthy}/${gscCoverage.metrics.governedIndexable} healthy · ${gscCoverage.metrics.inspected} inspected · ${gscCoverage.metrics.missing} missing · ${gscCoverage.metrics.stale} stale (>${gscCoverage.maxAgeHours / 24}d) · ${googleCoverageHardFailures} URLs with hard Google failures · ${gscCoverage.metrics.canonicalMismatch} canonical mismatch · ${gscCoverage.metrics.failedVerdict} FAIL verdict · ${gscCoverage.metrics.indexingBlocked} indexing blocked · ${gscCoverage.metrics.fetchFailed} fetch failed · ${gscCoverage.metrics.partialVerdict} partial/other verdict.`,
      "/admin/seo/search-console/index-coverage"
    ),
    check(
      "structured-data",
      "Structured data",
      !schema.persistenceAvailable ? "unknown" : schema.metrics.invalid > 0 || schema.metrics.unexpected > 0 ? "fail" : schema.metrics.missing > 0 || schema.metrics.notChecked > 0 || (schema.metrics.managed > 0 && freshness.crawl.stale) ? "warning" : "pass",
      !schema.persistenceAvailable
        ? "Structured-data crawl evidence is unavailable."
        : `${schema.metrics.healthy}/${schema.metrics.managed} healthy · ${schema.metrics.missing} missing · ${schema.metrics.invalid} invalid · ${schema.metrics.unexpected} unexpected · ${schema.metrics.notChecked} not checked${schema.metrics.managed > 0 ? ` · crawl evidence ${freshnessLabel(freshness.crawl)}` : ""}.`,
      "/admin/seo/schema"
    ),
    check(
      "policy-diagnostics",
      "Governed SEO policy diagnostics",
      overviewCritical > 0 ? "fail" : overviewWarnings > 0 ? "warning" : "pass",
      `${overviewCritical} critical · ${overviewWarnings} warnings in the current governed policy/content projection.`,
      "/admin/seo"
    ),
    check(
      "regression-watch",
      "Persisted baseline regression watch",
      regressionSignals.some((signal) => signal.severity === "critical") ? "fail" : regressionSignals.some((signal) => signal.severity === "warning") ? "warning" : latestReport && previousReport ? "pass" : "unknown",
      latestReport && previousReport
        ? `${regressionSignals.length} material signal${regressionSignals.length === 1 ? "" : "s"} between the two latest saved diagnostic baselines.`
        : "Two saved diagnostic baselines are required for regression comparison.",
      "/admin/seo/reports"
    )
  ];

  return {
    generatedAt,
    status: overallStatus(checks),
    checks,
    metrics: {
      governedUrls: registry.metrics.active,
      desiredIndexable: registry.metrics.desiredIndexable,
      actualSitemap: registry.metrics.actualSitemap,
      sitemapExpectedMissing: sitemap.metrics.expectedMissing,
      sitemapUnexpectedActual: sitemap.metrics.unexpectedActual,
      openIssues: crawl.metrics.open,
      criticalOpenIssues: crawl.metrics.criticalOpen,
      latestCrawlIssues: crawl.metrics.latestRunIssues,
      gscClicks: gsc.latest?.clicks ?? 0,
      gscImpressions: gsc.latest?.impressions ?? 0,
      gscPages: gsc.pages.length,
      gscCoverageGoverned: gscCoverage.metrics.governedIndexable,
      gscCoverageInspected: gscCoverage.metrics.inspected,
      gscCoverageHealthy: gscCoverage.metrics.healthy,
      gscCoverageAttention: gscCoverage.metrics.attention,
      gscCoverageMissing: gscCoverage.metrics.missing,
      gscCoverageStale: gscCoverage.metrics.stale,
      gscCoverageHardFailures: googleCoverageHardFailures,
      gscCoverageCanonicalMismatch: gscCoverage.metrics.canonicalMismatch,
      gscCoverageFailedVerdict: gscCoverage.metrics.failedVerdict,
      gscCoveragePartialVerdict: gscCoverage.metrics.partialVerdict,
      gscCoverageIndexingBlocked: gscCoverage.metrics.indexingBlocked,
      gscCoverageFetchFailed: gscCoverage.metrics.fetchFailed,
      schemaManaged: schema.metrics.managed,
      schemaHealthy: schema.metrics.healthy,
      schemaMissing: schema.metrics.missing,
      schemaInvalid: schema.metrics.invalid,
      schemaUnexpected: schema.metrics.unexpected,
      schemaNotChecked: schema.metrics.notChecked
    },
    freshness,
    latestGscCapturedAt,
    latestSitemapCapturedAt,
    latestCrawlCompletedAt,
    reports: overview.reports,
    regressionSignals
  };
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[\",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function seoUnifiedReportCsv(report: SeoUnifiedReportWorkspace): string {
  const rows: Array<readonly [string, string, string, string]> = [
    ["section", "metric", "value", "detail"],
    ["summary", "generated_at", report.generatedAt, ""],
    ["summary", "status", report.status, ""],
    ...Object.entries(report.metrics).map(([key, value]) => ["metrics", key, String(value), ""] as const),
    ...Object.entries(report.freshness).map(([key, value]) => ["freshness", key, value.stale ? "stale" : "fresh", `${value.capturedAt ?? "no evidence"}; age_hours=${value.ageHours === undefined ? "" : value.ageHours.toFixed(2)}; max_age_hours=${value.maxAgeHours}`] as const),
    ...report.checks.map((item) => ["check", item.id, item.state, `${item.label}: ${item.detail}`] as const),
    ...report.regressionSignals.map((item) => ["regression", item.id, item.severity, item.detail] as const)
  ];
  return rows.map((row) => row.map(csv).join(",")).join("\n");
}
