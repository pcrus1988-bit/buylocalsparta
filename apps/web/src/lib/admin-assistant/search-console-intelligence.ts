import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getSearchConsoleHistoryWorkspace } from "../seo-gsc-history";
import { searchConsoleReadiness } from "../seo-search-console";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

function percentDelta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return Math.round(((current - previous) / previous) * 100);
}

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

export async function searchConsoleIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const [history, readiness] = await Promise.all([
    getSearchConsoleHistoryWorkspace(principal).catch(() => undefined),
    Promise.resolve(searchConsoleReadiness())
  ]);
  if (!history) return base;

  const evidence: AdminAssistantEvidence[] = [...(base.evidence ?? [])];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };
  const latest = history.latest;
  const previous = history.previous;

  evidence.push({
    id: "gsc:readiness",
    kind: "kontamou",
    label: "Search Console readiness",
    detail: `API enabled=${readiness.enabled ? "yes" : "no"}; credentials=${readiness.credentialsConfigured ? "configured" : "missing"}; persisted sync history=${history.persistenceAvailable ? "available" : "unavailable"}.`,
    metric: readiness.ready,
    sourceTool: "getSearchConsoleIntelligence"
  });

  if (!readiness.ready || !history.persistenceAvailable) {
    add({
      id: "gsc-integration-not-ready",
      ruleId: "search_console_not_ready",
      severity: readiness.enabled ? "warning" : "opportunity",
      category: "seo",
      title: readiness.enabled ? "Search Console integration is incomplete" : "Search Console integration is disabled",
      detail: readiness.enabled
        ? "The Search Console feature is enabled but property/credential/readiness or persisted evidence is incomplete, so demand conclusions cannot be treated as current Google evidence."
        : "KONTA MOY has no active Search Console evidence flow in this environment.",
      evidence: [`enabled = ${readiness.enabled}`, `credentialsConfigured = ${readiness.credentialsConfigured}`, `persistenceAvailable = ${history.persistenceAvailable}`],
      evidenceIds: ["gsc:readiness"],
      recommendation: "Complete the existing Search Console readiness checklist before using Google-performance recommendations operationally.",
      href: "/admin/seo/search-console#gsc-readiness",
      confidence: "high"
    }, { seoImpact: 8, dataQualityImpact: 7, urgency: readiness.enabled ? 7 : 4, effort: 5 });
  }

  if (!latest) {
    add({
      id: "gsc-no-persisted-baseline",
      ruleId: "search_console_no_baseline",
      severity: "warning",
      category: "seo",
      title: "No persisted Search Console baseline exists",
      detail: "Without an immutable successful sync, the assistant cannot distinguish current Google demand from assumptions or stale external observations.",
      evidence: ["savedSyncs = 0"],
      evidenceIds: ["gsc:readiness"],
      recommendation: "Run the existing governed Search Console sync after readiness is complete, then compare future snapshots to that baseline.",
      href: "/admin/seo/search-console#gsc-performance",
      confidence: "high"
    }, { seoImpact: 8, dataQualityImpact: 8, urgency: 6, effort: 3 });
    return {
      ...base,
      summary: `${base.summary} Search Console: no persisted performance baseline is currently available.`,
      facts: [...base.facts.slice(0, 5), "No persisted Search Console baseline is available."].slice(0, 6),
      evidence,
      findings: mergeFindings(base.findings, findings),
      recommendations: prioritizeRecommendations(candidates, 5)
    };
  }

  evidence.push(
    { id: "gsc:latest", kind: "kontamou", label: "Latest Google performance", detail: `${latest.startDate} → ${latest.endDate}: ${latest.impressions.toLocaleString("el-GR")} impressions, ${latest.clicks.toLocaleString("el-GR")} clicks, ${(latest.ctr * 100).toFixed(1)}% CTR, average position ${latest.position ? latest.position.toFixed(1) : "—"}.`, metric: latest.impressions, sourceTool: "getSearchConsoleIntelligence" },
    { id: "gsc:queries", kind: "kontamou", label: "Privacy-safe queries", detail: `${history.queries.length.toLocaleString("el-GR")} privacy-minimized query rows are retained for the latest sync.`, metric: history.queries.length, sourceTool: "getSearchConsoleIntelligence" },
    { id: "gsc:pages", kind: "kontamou", label: "Landing pages", detail: `${history.pages.length.toLocaleString("el-GR")} canonical-origin page rows are retained for the latest sync.`, metric: history.pages.length, sourceTool: "getSearchConsoleIntelligence" }
  );

  if (previous) {
    const impressionDelta = percentDelta(latest.impressions, previous.impressions);
    const clickDelta = percentDelta(latest.clicks, previous.clicks);
    evidence.push({
      id: "gsc:change",
      kind: "derived",
      label: "Saved-sync change",
      detail: `Versus the previous immutable sync: impressions ${impressionDelta === undefined ? "not comparable" : `${impressionDelta >= 0 ? "+" : ""}${impressionDelta}%`}; clicks ${clickDelta === undefined ? "not comparable" : `${clickDelta >= 0 ? "+" : ""}${clickDelta}%`}.`,
      metric: impressionDelta ?? 0,
      sourceTool: "getSearchConsoleIntelligence"
    });
    if ((impressionDelta !== undefined && impressionDelta <= -20) || (clickDelta !== undefined && clickDelta <= -30)) {
      add({
        id: "gsc-performance-decline",
        ruleId: "search_visibility_decline",
        severity: "warning",
        category: "seo",
        title: "Google organic performance declined between saved syncs",
        detail: `Impressions changed ${impressionDelta === undefined ? "n/a" : `${impressionDelta}%`} and clicks ${clickDelta === undefined ? "n/a" : `${clickDelta}%`} versus the previous retained Search Console snapshot. Window composition should be checked before attributing cause.`,
        evidence: [`latestImpressions = ${latest.impressions}`, `previousImpressions = ${previous.impressions}`, `latestClicks = ${latest.clicks}`, `previousClicks = ${previous.clicks}`],
        evidenceIds: ["gsc:latest", "gsc:change"],
        recommendation: "Compare affected landing pages and SEO diagnostics before changing metadata or catalogue content; do not infer causality from aggregate decline alone.",
        href: "/admin/seo/search-console#gsc-pages",
        confidence: "high"
      }, { seoImpact: 9, customerImpact: 4, urgency: 8, effort: 5 });
    }
  }

  const lowCtr = history.queries
    .filter((row) => row.impressions >= 20 && row.ctr < 0.02 && row.position > 0 && row.position <= 20)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, 12);
  const nearPageOne = history.queries
    .filter((row) => row.impressions >= 20 && row.position > 8 && row.position <= 20)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, 12);
  const zeroClick = history.queries
    .filter((row) => row.impressions >= 20 && row.clicks === 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 12);

  if (lowCtr.length) {
    add({
      id: "gsc-low-ctr-opportunities",
      ruleId: "search_console_high_impression_low_ctr",
      severity: "opportunity",
      category: "seo",
      title: `${lowCtr.length} high-impression query opportunity/ies have CTR below 2%`,
      detail: `Top examples: ${lowCtr.slice(0, 5).map((row) => `${row.key} (${row.impressions} imp., ${(row.ctr * 100).toFixed(1)}% CTR, pos. ${row.position.toFixed(1)})`).join(" · ")}. These are privacy-minimized Google query aggregates, not individual-user searches.`,
      evidence: lowCtr.slice(0, 5).map((row) => `${row.key}: impressions=${row.impressions}, clicks=${row.clicks}, ctr=${(row.ctr * 100).toFixed(1)}%, position=${row.position.toFixed(1)}`),
      evidenceIds: ["gsc:queries", "gsc:latest"],
      recommendation: "Match each query to the strongest existing landing page and inspect title/description/content intent before creating new pages.",
      href: "/admin/seo/search-console#gsc-queries",
      affectedCount: lowCtr.length,
      confidence: "high"
    }, { seoImpact: 9, customerImpact: 5, urgency: 5, effort: 5, reversibility: 8 });
  }

  if (nearPageOne.length) {
    add({
      id: "gsc-near-page-one-opportunities",
      ruleId: "search_console_near_page_one",
      severity: "opportunity",
      category: "seo",
      title: `${nearPageOne.length} query opportunity/ies sit near page-one range`,
      detail: `These retained queries have at least 20 impressions and average position between 8 and 20. Top examples: ${nearPageOne.slice(0, 5).map((row) => `${row.key} (pos. ${row.position.toFixed(1)})`).join(" · ")}.`,
      evidence: nearPageOne.slice(0, 5).map((row) => `${row.key}: impressions=${row.impressions}, position=${row.position.toFixed(1)}`),
      evidenceIds: ["gsc:queries"],
      recommendation: "Prioritize relevance/content/internal-link improvements on existing matching pages before creating duplicate search-intent pages.",
      href: "/admin/seo/search-console#gsc-queries",
      affectedCount: nearPageOne.length,
      confidence: "medium"
    }, { seoImpact: 8, urgency: 4, effort: 5, reversibility: 8 });
  }

  if (zeroClick.length) {
    add({
      id: "gsc-zero-click-demand",
      ruleId: "search_console_zero_click_demand",
      severity: "opportunity",
      category: "seo",
      title: `${zeroClick.length} retained query opportunity/ies have impressions but zero clicks`,
      detail: `Top examples: ${zeroClick.slice(0, 5).map((row) => `${row.key} (${row.impressions} impressions, pos. ${row.position.toFixed(1)})`).join(" · ")}. Zero clicks can reflect rank, snippet relevance, or intent mismatch; it is not proof of a metadata defect.`,
      evidence: zeroClick.slice(0, 5).map((row) => `${row.key}: impressions=${row.impressions}, clicks=0, position=${row.position.toFixed(1)}`),
      evidenceIds: ["gsc:queries"],
      recommendation: "Inspect ranking position and matching landing page first, then improve the snippet/content only when the intent alignment supports it.",
      href: "/admin/seo/search-console#gsc-queries",
      affectedCount: zeroClick.length,
      confidence: "high"
    }, { seoImpact: 8, customerImpact: 4, urgency: 4, effort: 5 });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  return {
    ...base,
    summary: `${base.summary} Search Console latest: ${latest.impressions.toLocaleString("el-GR")} impressions · ${latest.clicks.toLocaleString("el-GR")} clicks · ${(latest.ctr * 100).toFixed(1)}% CTR · avg. position ${latest.position ? latest.position.toFixed(1) : "—"}. ${lowCtr.length + nearPageOne.length + zeroClick.length ? "Deterministic demand opportunities are available below." : "No high-signal query opportunity crossed the current deterministic thresholds."}`,
    facts: [...base.facts.slice(0, 3), `Latest Search Console window ${latest.startDate} → ${latest.endDate}.`, `${latest.impressions} impressions · ${latest.clicks} clicks · ${(latest.ctr * 100).toFixed(1)}% CTR.`, `${history.queries.length} privacy-safe query rows · ${history.pages.length} landing-page rows.`].slice(0, 6),
    evidence,
    findings: mergeFindings(base.findings, findings),
    recommendations: [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5)
  };
}
