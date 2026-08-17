import test from "node:test";
import assert from "node:assert/strict";
import { FairnessGovernanceService } from "../src/index.ts";

test("vendor can open an explainable fairness appeal and platform can resolve it", () => {
  const service = new FairnessGovernanceService();
  const appeal = service.submitAppeal({ marketId: "sparta", vendorId: "vendor-a", canonicalVariantId: "cv-a", submittedBy: "user-vendor", reason: "My eligible exposure appears materially below the documented fair share.", now: 1 });
  assert.equal(appeal.status, "open");
  assert.equal(service.appealsForVendor("vendor-b").length, 0);
  const reviewing = service.reviewAppeal({ appealId: appeal.id, actorId: "admin", status: "under_review", now: 2 });
  assert.equal(reviewing.status, "under_review");
  const closed = service.reviewAppeal({ appealId: appeal.id, actorId: "admin", status: "resolved", resolution: "Exposure history checked and assignment pool corrected.", now: 3 });
  assert.equal(closed.status, "resolved");
  assert.equal(closed.resolvedBy, "admin");
});

test("fairness anomaly detection respects minimum sample and deduplicates open anomalies", () => {
  const service = new FairnessGovernanceService();
  assert.equal(service.detectExposureAnomalies({ marketId: "sparta", canonicalVariantId: "cv-a", exposures: { a: 40, b: 30, c: 30 }, now: 1 }).length, 0);
  const first = service.detectExposureAnomalies({ marketId: "sparta", canonicalVariantId: "cv-a", exposures: { a: 150, b: 40, c: 40 }, now: 2 });
  assert.ok(first.length >= 1);
  const count = service.anomalies().length;
  service.detectExposureAnomalies({ marketId: "sparta", canonicalVariantId: "cv-a", exposures: { a: 160, b: 45, c: 45 }, now: 3 });
  assert.equal(service.anomalies().length, count);
  const anomaly = service.anomalies()[0];
  const acknowledged = service.acknowledgeAnomaly({ anomalyId: anomaly.id, actorId: "ops", now: 4 });
  assert.equal(acknowledged.status, "acknowledged");
  const resolved = service.resolveAnomaly({ anomalyId: anomaly.id, actorId: "ops", now: 5 });
  assert.equal(resolved.status, "resolved");
});


test("fairness anomaly monitoring rejects incomplete or invalid target-share schedules", () => {
  const service = new FairnessGovernanceService();
  assert.throws(() => service.detectExposureAnomalies({
    marketId: "sparta", canonicalVariantId: "cv-a", exposures: { a: 100, b: 100 }, targetShares: { a: 0.5 }, now: 1
  }), /cover every eligible vendor/);
  assert.throws(() => service.detectExposureAnomalies({
    marketId: "sparta", canonicalVariantId: "cv-a", exposures: { a: 100, b: 100 }, targetShares: { a: 0.7, b: 0.7 }, now: 1
  }), /sum to 1/);
});
