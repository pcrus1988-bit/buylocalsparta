import { id } from "../common/ids.ts";

export type FairnessAppealStatus = "open" | "under_review" | "resolved" | "rejected";

export type FairnessAppeal = Readonly<{
  id: string;
  marketId: string;
  vendorId: string;
  canonicalVariantId?: string;
  submittedBy?: string;
  reason: string;
  status: FairnessAppealStatus;
  resolution?: string;
  resolvedBy?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}>;

export type FairnessAnomalyStatus = "open" | "acknowledged" | "resolved";

export type FairnessAnomaly = Readonly<{
  id: string;
  marketId: string;
  canonicalVariantId: string;
  vendorId: string;
  metric: "qualified_exposure_share";
  targetShare: number;
  actualShare: number;
  deviation: number;
  sampleSize: number;
  threshold: number;
  status: FairnessAnomalyStatus;
  details: Readonly<Record<string, unknown>>;
  detectedAt: number;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedBy?: string;
  resolvedAt?: number;
}>;

function assertShare(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${field} must be between 0 and 1`);
}

export class FairnessGovernanceService {
  readonly #appeals = new Map<string, FairnessAppeal>();
  readonly #anomalies = new Map<string, FairnessAnomaly>();
  readonly #openAnomalyIndex = new Map<string, string>();

  submitAppeal(input: {
    marketId: string;
    vendorId: string;
    canonicalVariantId?: string;
    submittedBy?: string;
    reason: string;
    now: number;
  }): FairnessAppeal {
    const reason = input.reason.trim();
    if (reason.length < 10) throw new Error("Fairness appeal reason must contain at least 10 characters");
    const appeal: FairnessAppeal = Object.freeze({
      id: id("fap"),
      marketId: input.marketId,
      vendorId: input.vendorId,
      canonicalVariantId: input.canonicalVariantId,
      submittedBy: input.submittedBy,
      reason,
      status: "open",
      createdAt: input.now,
      updatedAt: input.now
    });
    this.#appeals.set(appeal.id, appeal);
    return appeal;
  }

  reviewAppeal(input: {
    appealId: string;
    actorId: string;
    status: Exclude<FairnessAppealStatus, "open">;
    resolution?: string;
    now: number;
  }): FairnessAppeal {
    const existing = this.#appeals.get(input.appealId);
    if (!existing) throw new Error("Fairness appeal not found");
    if (existing.status === "resolved" || existing.status === "rejected") throw new Error("Fairness appeal is already closed");
    const terminal = input.status === "resolved" || input.status === "rejected";
    const resolution = input.resolution?.trim();
    if (terminal && (!resolution || resolution.length < 5)) throw new Error("Closed fairness appeals require a resolution");
    const updated: FairnessAppeal = Object.freeze({
      ...existing,
      status: input.status,
      resolution,
      resolvedBy: terminal ? input.actorId : undefined,
      resolvedAt: terminal ? input.now : undefined,
      updatedAt: input.now
    });
    this.#appeals.set(updated.id, updated);
    return updated;
  }

  detectExposureAnomalies(input: {
    marketId: string;
    canonicalVariantId: string;
    exposures: Readonly<Record<string, number>>;
    targetShares?: Readonly<Record<string, number>>;
    minimumSampleSize?: number;
    threshold?: number;
    now: number;
  }): readonly FairnessAnomaly[] {
    const minimumSampleSize = input.minimumSampleSize ?? 200;
    const threshold = input.threshold ?? 0.05;
    assertShare(threshold, "threshold");
    const vendors = Object.keys(input.exposures).sort();
    if (vendors.length < 2) return [];
    const sampleSize = vendors.reduce((sum, vendorId) => {
      const value = input.exposures[vendorId] ?? 0;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("Exposure counts must be non-negative safe integers");
      return sum + value;
    }, 0);
    if (sampleSize < minimumSampleSize) return [];

    const equalTarget = 1 / vendors.length;
    if (input.targetShares) {
      const missing = vendors.filter((vendorId) => input.targetShares?.[vendorId] === undefined);
      if (missing.length) throw new Error(`Target shares must cover every eligible vendor; missing: ${missing.join(", ")}`);
      const targetTotal = vendors.reduce((sum, vendorId) => {
        const share = input.targetShares![vendorId]!;
        assertShare(share, "targetShare");
        return sum + share;
      }, 0);
      if (Math.abs(targetTotal - 1) > 1e-6) throw new Error("Target shares must sum to 1");
    }
    const created: FairnessAnomaly[] = [];
    for (const vendorId of vendors) {
      const targetShare = input.targetShares?.[vendorId] ?? equalTarget;
      assertShare(targetShare, "targetShare");
      const actualShare = (input.exposures[vendorId] ?? 0) / sampleSize;
      const deviation = actualShare - targetShare;
      const key = `${input.marketId}:${input.canonicalVariantId}:${vendorId}:qualified_exposure_share`;
      if (Math.abs(deviation) <= threshold) continue;

      const existingId = this.#openAnomalyIndex.get(key);
      if (existingId) {
        const existing = this.#anomalies.get(existingId)!;
        const refreshed: FairnessAnomaly = Object.freeze({
          ...existing,
          targetShare,
          actualShare,
          deviation,
          sampleSize,
          threshold,
          details: { exposures: { ...input.exposures }, targetShares: input.targetShares ? { ...input.targetShares } : undefined }
        });
        this.#anomalies.set(existingId, refreshed);
        created.push(refreshed);
        continue;
      }

      const anomaly: FairnessAnomaly = Object.freeze({
        id: id("fan"),
        marketId: input.marketId,
        canonicalVariantId: input.canonicalVariantId,
        vendorId,
        metric: "qualified_exposure_share",
        targetShare,
        actualShare,
        deviation,
        sampleSize,
        threshold,
        status: "open",
        details: { exposures: { ...input.exposures }, targetShares: input.targetShares ? { ...input.targetShares } : undefined },
        detectedAt: input.now
      });
      this.#anomalies.set(anomaly.id, anomaly);
      this.#openAnomalyIndex.set(key, anomaly.id);
      created.push(anomaly);
    }
    return created;
  }

  acknowledgeAnomaly(input: { anomalyId: string; actorId: string; now: number }): FairnessAnomaly {
    const existing = this.#requiredAnomaly(input.anomalyId);
    if (existing.status === "resolved") throw new Error("Resolved fairness anomaly cannot be acknowledged");
    const updated = Object.freeze({ ...existing, status: "acknowledged" as const, acknowledgedBy: input.actorId, acknowledgedAt: input.now });
    this.#anomalies.set(updated.id, updated);
    return updated;
  }

  resolveAnomaly(input: { anomalyId: string; actorId: string; now: number }): FairnessAnomaly {
    const existing = this.#requiredAnomaly(input.anomalyId);
    if (existing.status === "resolved") return existing;
    const updated = Object.freeze({ ...existing, status: "resolved" as const, resolvedBy: input.actorId, resolvedAt: input.now });
    this.#anomalies.set(updated.id, updated);
    const key = `${updated.marketId}:${updated.canonicalVariantId}:${updated.vendorId}:${updated.metric}`;
    this.#openAnomalyIndex.delete(key);
    return updated;
  }

  appealsForVendor(vendorId: string): readonly FairnessAppeal[] {
    return [...this.#appeals.values()].filter((appeal) => appeal.vendorId === vendorId).sort((a, b) => b.createdAt - a.createdAt);
  }

  appeals(): readonly FairnessAppeal[] {
    return [...this.#appeals.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  anomaliesForVendor(vendorId: string): readonly FairnessAnomaly[] {
    return [...this.#anomalies.values()].filter((anomaly) => anomaly.vendorId === vendorId).sort((a, b) => b.detectedAt - a.detectedAt);
  }

  anomalies(): readonly FairnessAnomaly[] {
    return [...this.#anomalies.values()].sort((a, b) => b.detectedAt - a.detectedAt);
  }

  #requiredAnomaly(id: string): FairnessAnomaly {
    const anomaly = this.#anomalies.get(id);
    if (!anomaly) throw new Error("Fairness anomaly not found");
    return anomaly;
  }
}
