import type { SessionPrincipal } from "@buy-local-sparta/core";
import {
  adminLaunchControlWorkspace,
  type LaunchControlAttention,
  type LaunchControlFilters,
  type LaunchControlReadinessDimension,
  type LaunchControlWorkspace
} from "./admin-launch-control";
import { adminMetricIntegritySnapshot, type AdminMetricIntegritySnapshot } from "./admin-metric-integrity";

export type LaunchControlIntegrityWorkspace = LaunchControlWorkspace & Readonly<{
  metricIntegrity?: AdminMetricIntegritySnapshot;
}>;

function correctedSummary(
  workspace: LaunchControlWorkspace,
  readinessScore: number | undefined,
  measurable: number,
  total: number,
  integrity: AdminMetricIntegritySnapshot | undefined
): string {
  const originalWithoutReadiness = workspace.summary.replace(
    /^(Measured launch readiness is \d+%\.|Launch readiness is only partially measurable with the currently connected evidence\.)\s*/,
    ""
  );
  const readiness = readinessScore === undefined
    ? `Launch readiness is partially measurable (${measurable}/${total} defensible dimensions).`
    : `Measured launch readiness is ${readinessScore}% across ${measurable}/${total} defensible dimensions.`;
  const vendor = integrity
    ? `Vendor readiness is intentionally excluded until a launch target is configured; current lifecycle is ${integrity.vendorLifecycle.active} active / ${integrity.vendorLifecycle.total} Sparta vendor records.`
    : "Vendor readiness is intentionally excluded because the lifecycle denominator/target is unavailable.";
  return [readiness, vendor, originalWithoutReadiness].filter(Boolean).join(" ");
}

export async function adminLaunchControlIntegrityWorkspace(
  principal: SessionPrincipal,
  filters: LaunchControlFilters
): Promise<LaunchControlIntegrityWorkspace> {
  const [workspace, metricIntegrity] = await Promise.all([
    adminLaunchControlWorkspace(principal, filters),
    adminMetricIntegritySnapshot(principal).catch(() => undefined)
  ]);

  const dimensions: LaunchControlReadinessDimension[] = workspace.readiness.dimensions.map((dimension) => {
    if (dimension.key !== "vendors") return dimension;
    if (!metricIntegrity) return {
      ...dimension,
      score: undefined,
      tone: "unavailable",
      detail: "Vendor lifecycle data is unavailable; no readiness percentage is inferred.",
      source: "Vendor lifecycle"
    };
    const lifecycle = metricIntegrity.vendorLifecycle;
    return {
      ...dimension,
      score: undefined,
      tone: "unavailable",
      detail: `${lifecycle.active} active · ${lifecycle.applicationStarted} application-started · ${lifecycle.invited} invited · ${lifecycle.other} other, across ${lifecycle.total} Sparta vendor records. Configure a launch target before scoring readiness.`,
      source: "Vendor lifecycle · target required"
    };
  });

  const measurableScores = dimensions.flatMap((dimension) => dimension.score === undefined ? [] : [dimension.score]);
  const readinessScore = measurableScores.length
    ? Math.round(measurableScores.reduce((sum, score) => sum + score, 0) / measurableScores.length)
    : undefined;

  const attention: LaunchControlAttention[] = [...workspace.attention];
  if (metricIntegrity) {
    for (const signal of metricIntegrity.signals) {
      if (signal.state !== "critical" && signal.state !== "warning") continue;
      if (signal.id === "legacy-checkout") {
        attention.push({ id: "metric-legacy-checkout", severity: "warning", label: "Analytics contract drift", detail: signal.detail, href: "/admin/analytics" });
      }
      if (signal.id === "commerce-attribution") {
        attention.push({ id: "metric-commerce-attribution", severity: "critical", label: "Commerce attribution mismatch", detail: signal.detail, href: "/admin/analytics" });
      }
      if (signal.id === "refund-control") {
        attention.push({ id: "metric-refund-control", severity: "critical", label: "Captured cancellation / refund", detail: signal.detail, value: metricIntegrity.commerce.failedOrManualRefunds + metricIntegrity.commerce.cancelledCapturedOrders, href: "/admin/finance#finance-diagnostics" });
      }
      if (signal.id === "counteroffer-vocabulary") {
        attention.push({ id: "metric-counteroffer-vocabulary", severity: "warning", label: "Counteroffer analytics vocabulary", detail: signal.detail, href: "/admin/analytics" });
      }
    }
  }

  const severityOrder = { critical: 0, warning: 1, opportunity: 2 } as const;
  const dedupedAttention = [...new Map(attention.map((item) => [item.id, item])).values()]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (b.value ?? 0) - (a.value ?? 0));

  const requiredIntegrityKeys = new Set(["transactions", "product_funnel", "fairness", "search"]);
  const requiredIntegrityUnavailable = metricIntegrity?.sources.some((source) => requiredIntegrityKeys.has(source.key) && source.state === "unavailable") ?? false;
  const dataState = workspace.dataState === "partial" || !metricIntegrity || requiredIntegrityUnavailable ? "partial" : "live";

  return {
    ...workspace,
    dataState,
    metricIntegrity,
    readiness: {
      score: readinessScore,
      measurable: measurableScores.length,
      total: dimensions.length,
      dimensions
    },
    attention: dedupedAttention,
    summary: correctedSummary(workspace, readinessScore, measurableScores.length, dimensions.length, metricIntegrity)
  };
}
