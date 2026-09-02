import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPEN_ICECAT_CONTROL,
  openIcecatControlForStorage,
  openIcecatControlFromMetadata
} from "../src/index.ts";

test("Open Icecat controls use safe defaults when source metadata has no live override", () => {
  const settings = openIcecatControlFromMetadata({});
  assert.deepEqual(settings, DEFAULT_OPEN_ICECAT_CONTROL);
});

test("Open Icecat controls apply a governed metadata revision", () => {
  const settings = openIcecatControlFromMetadata({
    icecat_control: {
      indexEnabled: false,
      detailEnabled: true,
      indexIntervalMs: 3_600_000,
      detailBatchSize: 2,
      detailLeaseSeconds: 120,
      detailRequestTimeoutMs: 10_000,
      detailRateDelayMs: 500,
      minimumGreekScore: 0.95,
      revision: "2026-09-02T20:00:00.000Z"
    }
  });
  assert.equal(settings.indexEnabled, false);
  assert.equal(settings.indexIntervalMs, 3_600_000);
  assert.equal(settings.detailBatchSize, 2);
  assert.equal(settings.minimumGreekScore, 0.95);
  assert.equal(settings.revision, "2026-09-02T20:00:00.000Z");
});

test("Open Icecat storage validation rejects a lease shorter than the active batch request budget", () => {
  assert.throws(() => openIcecatControlForStorage({
    ...DEFAULT_OPEN_ICECAT_CONTROL,
    detailBatchSize: 50,
    detailRequestTimeoutMs: 60_000,
    detailRateDelayMs: 60_000,
    detailLeaseSeconds: 30
  }, "rev-1"), /detailLeaseSeconds must be at least/);
});

test("Open Icecat storage validation rejects unsafe Greek quality thresholds", () => {
  assert.throws(() => openIcecatControlForStorage({
    ...DEFAULT_OPEN_ICECAT_CONTROL,
    minimumGreekScore: 0.5
  }, "rev-2"), /minimumGreekScore/);
});
