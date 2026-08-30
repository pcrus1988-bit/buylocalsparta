import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminOpenIcecatIngestionStatus } from "../admin-open-icecat-ingestion";
import { prioritizeRecommendations, type RecommendationCandidate } from "./recommendations";
import type {
  AdminAssistantEvidence,
  AdminAssistantFact,
  AdminAssistantFinding,
  AdminAssistantSnapshot
} from "./types";

const MINUTE = 60_000;
const STALL_AFTER_MS = 45 * MINUTE;

function pct(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function terminal(status: string): boolean {
  return ["completed", "failed", "cancelled"].includes(status.toLowerCase());
}

function mergeFindings(base: readonly AdminAssistantFinding[], extra: readonly AdminAssistantFinding[]): readonly AdminAssistantFinding[] {
  const rank = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  const byId = new Map<string, AdminAssistantFinding>();
  for (const item of [...extra, ...base]) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

export async function openIcecatIngestionIntelligence(
  principal: SessionPrincipal,
  base: AdminAssistantSnapshot
): Promise<AdminAssistantSnapshot> {
  const status = await adminOpenIcecatIngestionStatus(principal).catch(() => undefined);
  if (!status) return base;
  const latest = status.runs[0];
  const detail = status.detail;
  const now = Date.now();
  const evidence: AdminAssistantEvidence[] = [];
  const structuredFacts: AdminAssistantFact[] = [];
  const findings: AdminAssistantFinding[] = [];
  const candidates: RecommendationCandidate[] = [];

  if (!latest) {
    return {
      ...base,
      summary: "Files & Icecat: no Open Icecat bulk ingestion run has been recorded yet.",
      facts: ["No Open Icecat bulk ingestion run is available in the current production persistence."],
      evidence: [{ id: "icecat:no-run", kind: "kontamou", label: "Bulk ingestion", detail: "No Open Icecat bulk run has been recorded.", metric: 0, sourceTool: "getOpenIcecatIngestionStatus" }],
      structuredFacts: [{ id: "fact:icecat-runs", label: "Recorded runs", value: "0", evidenceIds: ["icecat:no-run"] }]
    };
  }

  const rejectedRatio = pct(latest.rejected, latest.checkpoint);
  const filteredRatio = pct(latest.filtered, latest.checkpoint);
  const minutesSinceUpdate = Math.max(0, Math.floor((now - latest.updatedAt) / MINUTE));
  const stalled = !terminal(latest.status) && now - latest.updatedAt >= STALL_AFTER_MS;

  evidence.push(
    { id: "icecat:status", kind: "kontamou", label: "Bulk status", detail: `${latest.sourceName} ${latest.importKind} run is ${latest.status}.`, metric: latest.status, sourceTool: "getOpenIcecatIngestionStatus", observedAt: latest.updatedAt },
    { id: "icecat:checkpoint", kind: "kontamou", label: "Durable checkpoint", detail: `${latest.checkpoint.toLocaleString("el-GR")} terminal source rows have been durably checkpointed.`, metric: latest.checkpoint, sourceTool: "getOpenIcecatIngestionStatus", observedAt: latest.updatedAt },
    { id: "icecat:persisted", kind: "kontamou", label: "Staged index writes", detail: `${latest.persisted.toLocaleString("el-GR")} rows were staged; ${latest.removed.toLocaleString("el-GR")} removal events were processed.`, metric: latest.persisted, sourceTool: "getOpenIcecatIngestionStatus" },
    { id: "icecat:rejected", kind: "derived", label: "Rejected source rows", detail: `${latest.rejected.toLocaleString("el-GR")} rows were rejected (${rejectedRatio}% of checkpointed rows).`, metric: rejectedRatio, sourceTool: "getOpenIcecatIngestionStatus" },
    { id: "icecat:filtered", kind: "derived", label: "Filtered source rows", detail: `${latest.filtered.toLocaleString("el-GR")} rows were intentionally filtered (${filteredRatio}% of checkpointed rows).`, metric: filteredRatio, sourceTool: "getOpenIcecatIngestionStatus" },
    { id: "icecat:freshness", kind: "derived", label: "Checkpoint freshness", detail: `The latest persisted ingestion state was updated ${minutesSinceUpdate.toLocaleString("el-GR")} minute(s) ago.`, metric: minutesSinceUpdate, sourceTool: "getOpenIcecatIngestionStatus", observedAt: latest.updatedAt }
  );
  structuredFacts.push(
    { id: "fact:icecat-status", label: "Latest bulk run", value: latest.status, evidenceIds: ["icecat:status"] },
    { id: "fact:icecat-checkpoint", label: "Durable checkpoint", value: latest.checkpoint.toLocaleString("el-GR"), evidenceIds: ["icecat:checkpoint"] },
    { id: "fact:icecat-rejected", label: "Rejected", value: `${latest.rejected.toLocaleString("el-GR")} · ${rejectedRatio}%`, evidenceIds: ["icecat:rejected"] }
  );

  if (latest.status.toLowerCase() === "failed") {
    const finding: AdminAssistantFinding = {
      id: "icecat-bulk-run-failed",
      ruleId: "ingestion_failed",
      severity: "critical",
      category: "ingestion",
      title: "Latest Open Icecat bulk run failed",
      detail: latest.lastError ? `The durable runner recorded: ${latest.lastError}` : "The latest bulk run is marked failed.",
      evidence: [`status = ${latest.status}`, ...(latest.lastError ? [`lastError = ${latest.lastError}`] : [])],
      evidenceIds: ["icecat:status", "icecat:checkpoint"],
      recommendation: "Inspect the recorded failure and resume from the durable checkpoint; do not reset or replay already committed source rows.",
      href: "/admin/catalogue-intake/import",
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { dataQualityImpact: 9, urgency: 10, effort: 5, reversibility: 7 } });
  } else if (stalled) {
    const finding: AdminAssistantFinding = {
      id: "icecat-bulk-run-stalled",
      ruleId: "ingestion_stalled",
      severity: "warning",
      category: "ingestion",
      title: `Open Icecat bulk ingestion has not advanced for ${minutesSinceUpdate} minutes`,
      detail: `The run is still ${latest.status}, but the durable checkpoint has not been updated within the ${STALL_AFTER_MS / MINUTE}-minute operational freshness window.`,
      evidence: [`status = ${latest.status}`, `minutesSinceUpdate = ${minutesSinceUpdate}`, `checkpoint = ${latest.checkpoint}`],
      evidenceIds: ["icecat:status", "icecat:checkpoint", "icecat:freshness"],
      recommendation: "Check the ingestion worker/runtime before starting another run. Resume from the existing durable checkpoint if recovery is required.",
      href: "/admin/catalogue-intake/import",
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { dataQualityImpact: 8, urgency: 9, effort: 5 } });
  }

  if (latest.checkpoint >= 100 && rejectedRatio >= 10) {
    const critical = rejectedRatio >= 40;
    const finding: AdminAssistantFinding = {
      id: "icecat-systematic-rejection",
      ruleId: "ingestion_systematic_rejection",
      severity: critical ? "critical" : "warning",
      category: "data_quality",
      title: `${rejectedRatio}% of checkpointed Open Icecat rows are being rejected`,
      detail: `${latest.rejected.toLocaleString("el-GR")} of ${latest.checkpoint.toLocaleString("el-GR")} terminal source rows were rejected. This can indicate source-format drift, parser assumptions or identifier-quality problems rather than a normal filtered population.`,
      evidence: [`rejected = ${latest.rejected}`, `checkpoint = ${latest.checkpoint}`, `rejectedRatio = ${rejectedRatio}%`],
      evidenceIds: ["icecat:rejected", "icecat:checkpoint"],
      recommendation: "Sample rejected-row reasons before changing parser or mapping logic; distinguish malformed rows from intentionally filtered rows.",
      href: "/admin/catalogue-intake/import",
      affectedCount: latest.rejected,
      confidence: "high"
    };
    findings.push(finding);
    candidates.push({ finding, dimensions: { dataQualityImpact: 10, seoImpact: 5, urgency: critical ? 10 : 7, effort: 6 } });
  }

  if (detail) {
    const queueRemaining = detail.pending + detail.processing + detail.retry;
    const captured = detail.ready + detail.needsEnrichment;
    const readyRatio = pct(detail.ready, captured);
    const enrichmentRatio = pct(detail.needsEnrichment, captured);
    const failedRatio = pct(detail.failed, Math.max(1, detail.activeIndexProducts));
    const retryRatio = pct(detail.retry, Math.max(1, queueRemaining));

    evidence.push(
      { id: "icecat:detail-active", kind: "kontamou", label: "Active provider index", detail: `${detail.activeIndexProducts.toLocaleString("el-GR")} active Open Icecat index products are eligible for downstream detail evaluation.`, metric: detail.activeIndexProducts, sourceTool: "getOpenIcecatIngestionStatus" },
      { id: "icecat:detail-queue", kind: "derived", label: "Detail queue remaining", detail: `${queueRemaining.toLocaleString("el-GR")} detail work item(s) remain pending, processing or retrying.`, metric: queueRemaining, sourceTool: "getOpenIcecatIngestionStatus" },
      { id: "icecat:detail-ready", kind: "derived", label: "Greek-ready evidence", detail: `${detail.ready.toLocaleString("el-GR")} captured detail record(s) pass the source-level Greek quality gate (${readyRatio}% of captured detail evidence).`, metric: readyRatio, sourceTool: "getOpenIcecatIngestionStatus" },
      { id: "icecat:detail-enrichment", kind: "derived", label: "Needs enrichment", detail: `${detail.needsEnrichment.toLocaleString("el-GR")} captured detail record(s) still need enrichment (${enrichmentRatio}% of captured detail evidence).`, metric: enrichmentRatio, sourceTool: "getOpenIcecatIngestionStatus" },
      { id: "icecat:detail-failed", kind: "derived", label: "Detail failures", detail: `${detail.failed.toLocaleString("el-GR")} detail item(s) failed (${failedRatio}% of active index products).`, metric: failedRatio, sourceTool: "getOpenIcecatIngestionStatus" },
      { id: "icecat:detail-no-gtin", kind: "kontamou", label: "No usable GTIN", detail: `${detail.unqueueableWithoutGtin.toLocaleString("el-GR")} active index product(s) cannot enter the current detail queue because they lack a usable GTIN.`, metric: detail.unqueueableWithoutGtin, sourceTool: "getOpenIcecatIngestionStatus" }
    );
    structuredFacts.push(
      { id: "fact:icecat-detail-queue", label: "Detail queue remaining", value: queueRemaining.toLocaleString("el-GR"), evidenceIds: ["icecat:detail-queue"] },
      { id: "fact:icecat-ready", label: "Greek ready", value: detail.ready.toLocaleString("el-GR"), evidenceIds: ["icecat:detail-ready"] },
      { id: "fact:icecat-enrichment", label: "Needs enrichment", value: detail.needsEnrichment.toLocaleString("el-GR"), evidenceIds: ["icecat:detail-enrichment"] }
    );

    if (detail.failed > 0) {
      const critical = failedRatio >= 10 && detail.failed >= 100;
      const finding: AdminAssistantFinding = {
        id: "icecat-detail-failures",
        ruleId: "ingestion_detail_failures",
        severity: critical ? "critical" : "warning",
        category: "ingestion",
        title: `${detail.failed.toLocaleString("el-GR")} Open Icecat detail item(s) failed`,
        detail: `Failed detail enrichment represents ${failedRatio}% of active index products. These failures remain source-evidence problems and must not be bypassed into canonical publication.`,
        evidence: [`failed = ${detail.failed}`, `activeIndexProducts = ${detail.activeIndexProducts}`, `failedRatio = ${failedRatio}%`],
        evidenceIds: ["icecat:detail-failed", "icecat:detail-active"],
        recommendation: "Inspect failure categories and retry policy; keep failed evidence outside canonical promotion until a successful governed detail result exists.",
        href: "/admin/catalogue-intake/import",
        affectedCount: detail.failed,
        confidence: "high"
      };
      findings.push(finding);
      candidates.push({ finding, dimensions: { dataQualityImpact: 9, seoImpact: 4, urgency: critical ? 9 : 6, effort: 5 } });
    }

    if (detail.retry > 0 && retryRatio >= 20) {
      const finding: AdminAssistantFinding = {
        id: "icecat-detail-retry-backlog",
        ruleId: "ingestion_retry_backlog",
        severity: "warning",
        category: "ingestion",
        title: `${retryRatio}% of remaining detail work is in retry`,
        detail: `${detail.retry.toLocaleString("el-GR")} of ${queueRemaining.toLocaleString("el-GR")} active detail work items are currently retrying.`,
        evidence: [`retry = ${detail.retry}`, `queueRemaining = ${queueRemaining}`, `retryRatio = ${retryRatio}%`],
        evidenceIds: ["icecat:detail-queue"],
        recommendation: "Check whether retries share a provider/API or data-shape cause before increasing worker throughput.",
        href: "/admin/catalogue-intake/import",
        affectedCount: detail.retry,
        confidence: "high"
      };
      findings.push(finding);
      candidates.push({ finding, dimensions: { dataQualityImpact: 6, urgency: 6, effort: 5 } });
    }

    if (captured >= 50 && enrichmentRatio >= 20) {
      const finding: AdminAssistantFinding = {
        id: "icecat-greek-enrichment-gap",
        ruleId: "icecat_greek_quality_incomplete",
        severity: "opportunity",
        category: "data_quality",
        title: `${detail.needsEnrichment.toLocaleString("el-GR")} captured Icecat records still miss the Greek quality boundary`,
        detail: `${enrichmentRatio}% of captured detail evidence remains in needs-enrichment. “Ready” is intentionally source-level only and does not imply canonical publication, vendor assignment, price, stock or public visibility.`,
        evidence: [`ready = ${detail.ready}`, `needsEnrichment = ${detail.needsEnrichment}`, `enrichmentRatio = ${enrichmentRatio}%`],
        evidenceIds: ["icecat:detail-ready", "icecat:detail-enrichment"],
        recommendation: "Prioritize the most repeated missing Greek fields/specification mappings while preserving provenance and the existing ≥90% quality gate.",
        href: "/admin/catalogue-intake/import",
        affectedCount: detail.needsEnrichment,
        confidence: "high"
      };
      findings.push(finding);
      candidates.push({ finding, dimensions: { dataQualityImpact: 8, seoImpact: 7, customerImpact: 5, urgency: 4, effort: 6 } });
    }

    if (detail.unqueueableWithoutGtin > 0) {
      const finding: AdminAssistantFinding = {
        id: "icecat-no-gtin",
        ruleId: "icecat_unqueueable_without_gtin",
        severity: "opportunity",
        category: "data_quality",
        title: `${detail.unqueueableWithoutGtin.toLocaleString("el-GR")} Icecat index product(s) cannot enter detail enrichment without a usable GTIN`,
        detail: "The current detail pipeline intentionally requires a usable GTIN for provider-detail lookup. These rows need separate identity evidence rather than a bypass of the queue contract.",
        evidence: [`unqueueableWithoutGtin = ${detail.unqueueableWithoutGtin}`],
        evidenceIds: ["icecat:detail-no-gtin"],
        recommendation: "Segment these rows for identifier recovery or alternate trusted-source matching instead of weakening the detail lookup identity boundary.",
        href: "/admin/catalogue-intake/import",
        affectedCount: detail.unqueueableWithoutGtin,
        confidence: "high"
      };
      findings.push(finding);
      candidates.push({ finding, dimensions: { dataQualityImpact: 7, seoImpact: 4, urgency: 3, effort: 7 } });
    }
  }

  const recommendations = prioritizeRecommendations(candidates, 5);
  const summary = `${latest.sourceName}: ${latest.status} · checkpoint ${latest.checkpoint.toLocaleString("el-GR")} · ${latest.persisted.toLocaleString("el-GR")} staged · ${latest.rejected.toLocaleString("el-GR")} rejected (${rejectedRatio}%).${detail ? ` Detail: ${detail.ready.toLocaleString("el-GR")} Greek-ready · ${detail.needsEnrichment.toLocaleString("el-GR")} need enrichment · ${detail.failed.toLocaleString("el-GR")} failed.` : ""}`;

  return {
    ...base,
    summary,
    facts: [
      `Latest Open Icecat run is ${latest.status}; durable checkpoint is ${latest.checkpoint.toLocaleString("el-GR")} source rows.`,
      `${latest.persisted.toLocaleString("el-GR")} rows were staged, ${latest.rejected.toLocaleString("el-GR")} rejected and ${latest.filtered.toLocaleString("el-GR")} filtered.`,
      ...(detail ? [`Detail queue: ${detail.pending + detail.processing + detail.retry} active work items · ${detail.ready} Greek-ready · ${detail.needsEnrichment} need enrichment · ${detail.failed} failed.`] : [])
    ],
    evidence,
    structuredFacts,
    findings: mergeFindings(base.findings, findings),
    recommendations
  };
}
