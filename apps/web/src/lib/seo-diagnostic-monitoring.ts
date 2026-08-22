import type { SeoDiagnosticReport } from "./seo-diagnostic-reports";

export type SeoDiagnosticRegressionSeverity = "critical" | "warning" | "info";

export type SeoDiagnosticRegressionSignal = Readonly<{
  id: string;
  severity: SeoDiagnosticRegressionSeverity;
  title: string;
  detail: string;
  previous: number;
  current: number;
  delta: number;
}>;

const SEVERITY_ORDER: Readonly<Record<SeoDiagnosticRegressionSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2
};

function countDropSignal(input: {
  id: string;
  title: string;
  detail: string;
  previous: number;
  current: number;
  minimumDrop: number;
}): SeoDiagnosticRegressionSignal | undefined {
  const drop = input.previous - input.current;
  const materialDrop = Math.max(input.minimumDrop, Math.ceil(input.previous * 0.1));
  if (drop < materialDrop) return undefined;
  return {
    id: input.id,
    severity: "warning",
    title: input.title,
    detail: `${input.detail} Previous ${input.previous}; current ${input.current}; drop ${drop}.`,
    previous: input.previous,
    current: input.current,
    delta: -drop
  };
}

function runtimeLossSignal(
  id: string,
  title: string,
  detail: string,
  previous: boolean,
  current: boolean
): SeoDiagnosticRegressionSignal | undefined {
  if (!previous || current) return undefined;
  return { id, severity: "critical", title, detail, previous: 1, current: 0, delta: -1 };
}

export function seoDiagnosticRegressionSignals(
  latest: SeoDiagnosticReport | undefined,
  previous: SeoDiagnosticReport | undefined
): readonly SeoDiagnosticRegressionSignal[] {
  if (!latest || !previous) return [];
  const signals: SeoDiagnosticRegressionSignal[] = [];
  const previousCriticalIds = new Set(previous.diagnostics.filter((item) => item.severity === "critical").map((item) => item.id));
  for (const diagnostic of latest.diagnostics.filter((item) => item.severity === "critical" && !previousCriticalIds.has(item.id))) signals.push({
    id: `critical-diagnostic:${diagnostic.id}`,
    severity: "critical",
    title: `New critical SEO diagnostic: ${diagnostic.title}`,
    detail: diagnostic.detail,
    previous: 0,
    current: 1,
    delta: 1
  });

  const scoreDelta = latest.score - previous.score;
  if (scoreDelta <= -8) signals.push({
    id: "health-score-drop",
    severity: scoreDelta <= -20 ? "critical" : "warning",
    title: "SEO health score fell materially",
    detail: `The internal readiness score moved from ${previous.score} to ${latest.score}. This is a regression signal, not a search-ranking score.`,
    previous: previous.score,
    current: latest.score,
    delta: scoreDelta
  });

  const comparableCurrentFormat = latest.formatVersion >= 2 && previous.formatVersion >= 2;
  for (const signal of [
    runtimeLossSignal("product-runtime-loss", "Product SEO inventory became unavailable", "The previous snapshot could read the public product projection, but the latest snapshot cannot.", previous.runtime.databaseProductsAvailable, latest.runtime.databaseProductsAvailable),
    runtimeLossSignal("vendor-runtime-loss", "Vendor SEO inventory became unavailable", "The previous snapshot could read the public vendor directory, but the latest snapshot cannot.", previous.runtime.databaseVendorsAvailable, latest.runtime.databaseVendorsAvailable),
    runtimeLossSignal("media-runtime-loss", "Governed public media became unavailable", "The governed public-media integration was available in the previous snapshot and is unavailable now.", previous.runtime.governedPublicMediaEnabled, latest.runtime.governedPublicMediaEnabled),
    countDropSignal({ id: "sitemap-inventory-drop", title: "Estimated sitemap inventory dropped", detail: "A material reduction can indicate an indexing switch, admission failure or unexpected public-entity loss.", previous: previous.metrics.sitemapEstimatedCount, current: latest.metrics.sitemapEstimatedCount, minimumDrop: 5 }),
    comparableCurrentFormat ? countDropSignal({ id: "product-eligibility-drop", title: "Index-eligible product inventory dropped", detail: "Review product admission, content-quality blockers and governed overrides before release.", previous: previous.metrics.productIndexEligible, current: latest.metrics.productIndexEligible, minimumDrop: 3 }) : undefined,
    countDropSignal({ id: "vendor-eligibility-drop", title: "Index-eligible vendor inventory dropped", detail: "Review partner admission, Research quality gating and governed overrides before release.", previous: previous.metrics.vendorIndexEligible, current: latest.metrics.vendorIndexEligible, minimumDrop: 5 })
  ]) if (signal) signals.push(signal);

  const orphanDelta = comparableCurrentFormat ? latest.metrics.crawlOrphans - previous.metrics.crawlOrphans : 0;
  if (orphanDelta > 0) signals.push({
    id: "crawl-orphan-growth",
    severity: "warning",
    title: "Indexable orphan pages increased",
    detail: `Orphan count increased from ${previous.metrics.crawlOrphans} to ${latest.metrics.crawlOrphans}. Restore a stable discovery path or intentionally remove index eligibility.`,
    previous: previous.metrics.crawlOrphans,
    current: latest.metrics.crawlOrphans,
    delta: orphanDelta
  });

  const weakDelta = comparableCurrentFormat ? latest.metrics.crawlWeak - previous.metrics.crawlWeak : 0;
  const materialWeakGrowth = Math.max(3, Math.ceil(previous.metrics.crawlWeak * 0.2));
  if (weakDelta >= materialWeakGrowth) signals.push({
    id: "crawl-weak-growth",
    severity: "info",
    title: "Weakly linked pages increased",
    detail: `Weak-link count increased from ${previous.metrics.crawlWeak} to ${latest.metrics.crawlWeak}. Add contextual links where the pages remain strategically important.`,
    previous: previous.metrics.crawlWeak,
    current: latest.metrics.crawlWeak,
    delta: weakDelta
  });

  const routeClassChanges = (Object.keys(latest.routeClassCounts) as (keyof typeof latest.routeClassCounts)[])
    .filter((routeClass) => latest.routeClassCounts[routeClass] !== previous.routeClassCounts[routeClass]);
  const latestRouteTotal = Object.values(latest.routeClassCounts).reduce((sum, count) => sum + count, 0);
  const previousRouteTotal = Object.values(previous.routeClassCounts).reduce((sum, count) => sum + count, 0);
  const routeClassDelta = latestRouteTotal - previousRouteTotal;
  if (routeClassChanges.length > 0) signals.push({
    id: "route-policy-inventory-change",
    severity: "info",
    title: "Visibility-policy inventory changed",
    detail: `Route classifications changed: ${routeClassChanges.map((routeClass) => `${routeClass} ${previous.routeClassCounts[routeClass]}→${latest.routeClassCounts[routeClass]}`).join("; ")}. Confirm every addition, removal or reclassification is intentional.`,
    previous: previousRouteTotal,
    current: latestRouteTotal,
    delta: routeClassDelta
  });

  return signals.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.id.localeCompare(right.id));
}
