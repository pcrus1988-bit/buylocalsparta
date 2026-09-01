import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCrawlerDashboard, type AdminCrawlerJob } from "../admin-catalogue-crawler";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type { AdminAssistantEvidence, AdminAssistantFact, AdminAssistantFinding, AdminAssistantSnapshot } from "./types";

function pct(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function terminal(status: string): boolean {
  return ["succeeded", "partial", "failed", "cancelled"].includes(status.toLowerCase());
}

function extractionRate(job: AdminCrawlerJob): number {
  return job.fetched <= 0 ? 0 : job.extracted / job.fetched;
}

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

function previousComparableJob(jobs: readonly AdminCrawlerJob[], latest: AdminCrawlerJob): AdminCrawlerJob | undefined {
  return jobs.find((job) =>
    job.id !== latest.id &&
    job.profileId === latest.profileId &&
    ["succeeded", "partial"].includes(job.status.toLowerCase()) &&
    job.fetched >= 5
  );
}

export async function crawlerOperationalIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const dashboard = await adminCrawlerDashboard(principal).catch(() => undefined);
  if (!dashboard) return base;

  const now = Date.now();
  const latest = dashboard.jobs[0];
  const evidence: AdminAssistantEvidence[] = [];
  const structuredFacts: AdminAssistantFact[] = [];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];
  const add = (finding: AdminAssistantFinding, dimensions: RecommendationCandidate["dimensions"]) => {
    findings.push(finding);
    candidates.push({ finding, dimensions });
  };

  evidence.push(
    { id: "crawler:queue", kind: "kontamou", label: "Crawler queue", detail: `${dashboard.health.queuedReady} ready, ${dashboard.health.queuedDelayed} delayed and ${dashboard.health.running} running job(s).`, metric: dashboard.health.queuedReady + dashboard.health.queuedDelayed + dashboard.health.running, sourceTool: "getCatalogueCrawlerIntelligence" },
    { id: "crawler:leases", kind: "kontamou", label: "Crawler leases", detail: `${dashboard.health.expiredLeases} expired worker lease(s); ${dashboard.health.cancellationRequested} cancellation request(s).`, metric: dashboard.health.expiredLeases, sourceTool: "getCatalogueCrawlerIntelligence" },
    { id: "crawler:24h", kind: "kontamou", label: "Crawler 24h outcome", detail: `${dashboard.health.completedLast24h} completed and ${dashboard.health.failedLast24h} failed job(s) in the last 24 hours.`, metric: dashboard.health.failedLast24h, sourceTool: "getCatalogueCrawlerIntelligence" }
  );
  structuredFacts.push(
    { id: "fact:crawler-ready", label: "Ready queue", value: String(dashboard.health.queuedReady), evidenceIds: ["crawler:queue"] },
    { id: "fact:crawler-running", label: "Running", value: String(dashboard.health.running), evidenceIds: ["crawler:queue"] },
    { id: "fact:crawler-expired-leases", label: "Expired leases", value: String(dashboard.health.expiredLeases), evidenceIds: ["crawler:leases"] }
  );

  if (dashboard.health.expiredLeases > 0) {
    add({
      id: "crawler-expired-worker-leases",
      ruleId: "crawler_expired_worker_lease",
      severity: "critical",
      category: "ingestion",
      title: `${dashboard.health.expiredLeases} crawler worker lease(s) expired`,
      detail: "The crawler runtime itself reports expired worker leases. This is stronger evidence of interrupted/stalled processing than an assistant-invented heartbeat timeout.",
      evidence: [`expiredLeases = ${dashboard.health.expiredLeases}`, `running = ${dashboard.health.running}`],
      evidenceIds: ["crawler:leases", "crawler:queue"],
      recommendation: "Inspect crawler worker health and lease recovery before queueing duplicate crawl jobs.",
      href: "/admin/catalogue-crawler",
      affectedCount: dashboard.health.expiredLeases,
      confidence: "high"
    }, { dataQualityImpact: 8, urgency: 10, effort: 4 });
  }

  if (dashboard.health.failedLast24h >= 3 && dashboard.health.failedLast24h > dashboard.health.completedLast24h) {
    add({
      id: "crawler-systemic-failures-24h",
      ruleId: "crawler_systemic_failures",
      severity: "warning",
      category: "ingestion",
      title: "Crawler failures exceed completions in the last 24 hours",
      detail: `${dashboard.health.failedLast24h} failed versus ${dashboard.health.completedLast24h} completed crawl job(s) in the runtime health window.`,
      evidence: [`failedLast24h = ${dashboard.health.failedLast24h}`, `completedLast24h = ${dashboard.health.completedLast24h}`],
      evidenceIds: ["crawler:24h"],
      recommendation: "Group recent failure reasons by source/profile before changing crawler limits or retrying broadly.",
      href: "/admin/catalogue-crawler",
      affectedCount: dashboard.health.failedLast24h,
      confidence: "high"
    }, { dataQualityImpact: 8, urgency: 8, effort: 5 });
  }

  if (!latest) {
    return {
      ...base,
      summary: "Website Import: no catalogue crawl job has been recorded yet.",
      facts: ["The current crawler dashboard has no crawl-job history."],
      evidence,
      structuredFacts,
      findings: mergeFindings(base.findings, findings),
      recommendations: prioritizeRecommendations(candidates, 5)
    };
  }

  const failedRatio = pct(latest.failed, latest.fetched + latest.failed);
  const reviewRatio = pct(latest.review, Math.max(1, latest.extracted));
  const latestExtractionRate = extractionRate(latest);
  const comparable = previousComparableJob(dashboard.jobs.slice(1), latest);
  const comparableExtractionRate = comparable ? extractionRate(comparable) : undefined;
  const extractionDropPct = comparableExtractionRate && comparableExtractionRate > 0
    ? Math.round(((comparableExtractionRate - latestExtractionRate) / comparableExtractionRate) * 100)
    : 0;
  const latestTerminal = terminal(latest.status);
  const leaseExpired = latest.status.toLowerCase() === "running" && Boolean(latest.leaseExpiresAt && latest.leaseExpiresAt < now);

  evidence.push(
    { id: "crawler:latest", kind: "kontamou", label: "Latest crawl", detail: `${latest.sourceName} · ${latest.crawlMode} · ${latest.status}. ${latest.fetched} fetched, ${latest.failed} failed, ${latest.extracted} products extracted, ${latest.review} requiring review and ${latest.promoted} promoted to PIM.`, metric: latest.status, sourceTool: "getCatalogueCrawlerIntelligence", observedAt: latest.completedAt ?? latest.lastHeartbeatAt ?? latest.createdAt },
    { id: "crawler:latest-failure-rate", kind: "derived", label: "Latest page failure ratio", detail: `${failedRatio}% of fetched-or-failed page attempts are recorded as failed.`, metric: failedRatio, sourceTool: "getCatalogueCrawlerIntelligence" },
    { id: "crawler:latest-review-rate", kind: "derived", label: "Latest review ratio", detail: `${latest.review} of ${latest.extracted} extracted product(s) require review (${reviewRatio}%).`, metric: reviewRatio, sourceTool: "getCatalogueCrawlerIntelligence" }
  );
  structuredFacts.push(
    { id: "fact:crawler-latest-status", label: "Latest crawl", value: `${latest.sourceName} · ${latest.status}`, evidenceIds: ["crawler:latest"] },
    { id: "fact:crawler-extracted", label: "Products extracted", value: String(latest.extracted), evidenceIds: ["crawler:latest"] },
    { id: "fact:crawler-review", label: "Needs review", value: `${latest.review} · ${reviewRatio}%`, evidenceIds: ["crawler:latest-review-rate"] }
  );

  if (latest.status.toLowerCase() === "failed") {
    add({
      id: `crawler-latest-failed-${latest.id}`,
      ruleId: "crawler_latest_failed",
      severity: "critical",
      category: "ingestion",
      title: `Latest crawl for ${latest.sourceName} failed`,
      detail: latest.failureReason ? `The crawler recorded: ${latest.failureReason}` : "The latest crawl is in failed state.",
      evidence: [`status = ${latest.status}`, ...(latest.failureReason ? [`failureReason = ${latest.failureReason}`] : [])],
      evidenceIds: ["crawler:latest"],
      recommendation: "Inspect the recorded failure and source/profile boundary before starting another full crawl.",
      href: "/admin/catalogue-crawler",
      confidence: "high"
    }, { dataQualityImpact: 9, urgency: 10, effort: 4 });
  } else if (leaseExpired) {
    add({
      id: `crawler-latest-expired-lease-${latest.id}`,
      ruleId: "crawler_expired_worker_lease",
      severity: "critical",
      category: "ingestion",
      title: `Running crawl for ${latest.sourceName} has an expired lease`,
      detail: "The persisted lease expiry is in the past while the job remains running. This is authoritative runtime evidence of a lease/recovery problem.",
      evidence: [`status = ${latest.status}`, `leaseExpiresAt = ${latest.leaseExpiresAt}`],
      evidenceIds: ["crawler:latest", "crawler:leases"],
      recommendation: "Recover the worker lease/job state before retrying the same source.",
      href: "/admin/catalogue-crawler",
      confidence: "high"
    }, { dataQualityImpact: 8, urgency: 10, effort: 4 });
  }

  if (latestTerminal && latest.fetched >= 10 && failedRatio >= 20) {
    add({
      id: `crawler-high-page-failure-${latest.id}`,
      ruleId: "crawler_high_page_failure_ratio",
      severity: failedRatio >= 50 ? "critical" : "warning",
      category: "ingestion",
      title: `${failedRatio}% page failure ratio in the latest crawl`,
      detail: `${latest.failed} page attempt(s) failed while ${latest.fetched} were fetched. A high ratio may reflect robots/network/source-shape problems and should be investigated before promotion.` ,
      evidence: [`fetched = ${latest.fetched}`, `failed = ${latest.failed}`, `failedRatio = ${failedRatio}%`],
      evidenceIds: ["crawler:latest", "crawler:latest-failure-rate"],
      recommendation: "Sample failed URLs/reasons and distinguish source restrictions from extraction defects before widening crawl policy.",
      href: "/admin/catalogue-crawler",
      affectedCount: latest.failed,
      confidence: "high"
    }, { dataQualityImpact: 9, urgency: failedRatio >= 50 ? 9 : 7, effort: 5 });
  }

  if (["succeeded", "partial"].includes(latest.status.toLowerCase()) && latest.fetched >= 10 && latest.extracted === 0) {
    add({
      id: `crawler-zero-products-${latest.id}`,
      ruleId: "crawler_zero_products_extracted",
      severity: "warning",
      category: "data_quality",
      title: `Latest ${latest.sourceName} crawl fetched pages but extracted no products`,
      detail: `${latest.fetched} page(s) were fetched successfully enough to be counted, yet no products were extracted. This is a strong extraction-boundary anomaly but not proof that the source has no products.`,
      evidence: [`fetched = ${latest.fetched}`, "extracted = 0"],
      evidenceIds: ["crawler:latest"],
      recommendation: "Inspect representative fetched pages and extractor/source-shape evidence before concluding the supplier catalogue is empty.",
      href: "/admin/catalogue-crawler",
      confidence: "high"
    }, { dataQualityImpact: 10, vendorImpact: 8, urgency: 8, effort: 5 });
  }

  if (comparable && latestTerminal && latest.fetched >= 10 && comparable.fetched >= 10 && extractionDropPct >= 50 && comparable.extracted >= 5) {
    evidence.push({
      id: "crawler:extraction-comparison",
      kind: "derived",
      label: "Extraction-rate comparison",
      detail: `Latest extraction rate is ${(latestExtractionRate * 100).toFixed(1)}% versus ${(comparableExtractionRate! * 100).toFixed(1)}% for the previous comparable ${latest.sourceName}/${latest.profileCode} crawl; relative decline ${extractionDropPct}%.`,
      metric: extractionDropPct,
      sourceTool: "getCatalogueCrawlerIntelligence"
    });
    add({
      id: `crawler-extraction-drop-${latest.id}`,
      ruleId: "crawler_possible_source_drift",
      severity: extractionDropPct >= 80 ? "critical" : "warning",
      category: "data_quality",
      title: `Product extraction rate dropped ${extractionDropPct}% versus the previous comparable crawl`,
      detail: "This pattern is consistent with possible source-template/content-shape drift or extractor regression. The comparison does not establish causality; traffic mix and catalogue changes can also alter extraction rate.",
      evidence: [`latestExtractionRate = ${(latestExtractionRate * 100).toFixed(1)}%`, `previousExtractionRate = ${(comparableExtractionRate! * 100).toFixed(1)}%`, `relativeDrop = ${extractionDropPct}%`],
      evidenceIds: ["crawler:latest", "crawler:extraction-comparison"],
      recommendation: "Compare representative pages from the two crawl runs before modifying extractors or source policies.",
      href: "/admin/catalogue-crawler",
      confidence: "medium"
    }, { dataQualityImpact: 10, vendorImpact: 7, urgency: extractionDropPct >= 80 ? 9 : 7, effort: 6 });
  }

  if (latest.extracted >= 10 && reviewRatio >= 50) {
    add({
      id: `crawler-review-backlog-${latest.id}`,
      ruleId: "crawler_review_heavy_extraction",
      severity: reviewRatio >= 80 ? "warning" : "opportunity",
      category: "data_quality",
      title: `${reviewRatio}% of extracted products require review`,
      detail: `${latest.review} of ${latest.extracted} extracted product(s) are not clean enough for direct PIM progression. This is a source-quality/review-load signal, not a publication failure.`,
      evidence: [`extracted = ${latest.extracted}`, `review = ${latest.review}`, `reviewRatio = ${reviewRatio}%`],
      evidenceIds: ["crawler:latest-review-rate"],
      recommendation: "Group review reasons before changing extraction rules; prioritize repeated evidence gaps with the largest product impact.",
      href: "/admin/catalogue-crawler",
      affectedCount: latest.review,
      confidence: "high"
    }, { dataQualityImpact: 8, vendorImpact: 5, urgency: 5, effort: 6 });
  }

  if (["succeeded", "partial"].includes(latest.status.toLowerCase()) && latest.extracted > 0 && latest.promoted === 0) {
    add({
      id: `crawler-unpromoted-${latest.id}`,
      ruleId: "crawler_completed_not_promoted",
      severity: "opportunity",
      category: "workflow",
      title: `${latest.extracted} extracted product(s) are ready for the PIM hand-off decision`,
      detail: "The crawl completed with extracted product evidence but none has been promoted into Supplier PIM. Promotion remains a separate governed step and does not publish products directly.",
      evidence: [`status = ${latest.status}`, `extracted = ${latest.extracted}`, "promoted = 0"],
      evidenceIds: ["crawler:latest"],
      recommendation: "Review crawl quality/review counts, then use the existing Import products to PIM workflow if the evidence is acceptable.",
      href: "/admin/catalogue-crawler",
      affectedCount: latest.extracted,
      confidence: "high"
    }, { dataQualityImpact: 5, vendorImpact: 7, urgency: 4, effort: 3, reversibility: 8 });
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const mergedRecommendations = [...recommendations, ...(base.recommendations ?? []).filter((existing) => !recommendations.some((item) => item.id === existing.id))].slice(0, 5);
  return {
    ...base,
    summary: `${latest.sourceName}: latest crawl ${latest.status}; ${latest.fetched} fetched, ${latest.failed} failed, ${latest.extracted} extracted, ${latest.review} needing review and ${latest.promoted} promoted. ${findings.length ? `${findings.length} deterministic crawler finding(s) need attention.` : "No high-signal crawler anomaly crossed the current checks."}`,
    facts: [
      `Queue: ${dashboard.health.queuedReady} ready · ${dashboard.health.queuedDelayed} delayed · ${dashboard.health.running} running.`,
      `Worker leases: ${dashboard.health.expiredLeases} expired · ${dashboard.health.cancellationRequested} cancellation requested.`,
      `Latest: ${latest.sourceName} · ${latest.crawlMode} · ${latest.status}.`,
      `Pages: ${latest.fetched} fetched · ${latest.skipped} skipped · ${latest.failed} failed · ${latest.discovered} discovered.`,
      `Products: ${latest.extracted} extracted · ${latest.review} review · ${latest.promoted} promoted.`
    ],
    evidence: [...evidence, ...(base.evidence ?? [])].slice(0, 30),
    structuredFacts: [...structuredFacts, ...(base.structuredFacts ?? [])].slice(0, 20),
    findings: mergeFindings(base.findings, findings),
    recommendations: mergedRecommendations
  };
}
