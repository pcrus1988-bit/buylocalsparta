import test from "node:test";
import assert from "node:assert/strict";
import { resolveCensusHubFromPoint } from "./hub-gemi-assignment.ts";

test("Volos merchant point belongs to the Volos HUB", () => {
  const location = resolveCensusHubFromPoint({
    latitude: 39.361, longitude: 22.9422, landmass: "mainland"
  });
  assert.equal(location?.hub.id, "KM-HUB-042");
  assert.equal(location?.status, "assigned");
  assert.ok((location?.distanceKm ?? Infinity) < 1);
});

test("Sparta compatibility keeps census routing in the Sparta HUB", () => {
  const location = resolveCensusHubFromPoint({
    latitude: 37.0745, longitude: 22.4303, landmass: "mainland"
  });
  assert.equal(location?.hub.id, "KM-HUB-015");
  assert.equal(location?.status, "assigned");
});

test("unverified landmass cannot assign a registry merchant", () => {
  assert.equal(resolveCensusHubFromPoint({ latitude: 37.7467, longitude: 23.4275 }), undefined);
});

test("verified island overrides a nearby mainland market", () => {
  const location = resolveCensusHubFromPoint({
    latitude: 37.7467, longitude: 23.4275, islandHubId: "KM-HUB-005"
  });
  assert.equal(location?.hub.id, "KM-HUB-005");
  assert.equal(location?.status, "assigned");
});

test("island distance cannot masquerade as mainland coverage", () => {
  assert.equal(resolveCensusHubFromPoint({
    latitude: 37.7467, longitude: 23.4275, landmass: "island"
  }), undefined);
});

test("outside radius is not a publishable assignment", () => {
  const location = resolveCensusHubFromPoint({
    latitude: 34.4, longitude: 20.0, landmass: "mainland"
  });
  assert.equal(location?.status, "outside_coverage");
  assert.ok((location?.distanceKm ?? 0) > 25);
});

test("invalid geographic coordinates fail closed", () => {
  assert.equal(resolveCensusHubFromPoint({ latitude: NaN, longitude: 20, landmass: "mainland" }), undefined);
  assert.equal(resolveCensusHubFromPoint({ latitude: 0, longitude: 0, landmass: "mainland" }), undefined);
});

test("equal distance matches are stable across executions", () => {
  const point = { latitude: 39.361, longitude: 22.9422, landmass: "mainland" as const };
  assert.deepEqual(resolveCensusHubFromPoint(point), resolveCensusHubFromPoint(point));
});

test("WHOLE_ISLAND never overrides the verified 25km boundary", () => {
  const remote = resolveCensusHubFromPoint({
    latitude: 39.361, longitude: 22.9422, islandHubId: "KM-HUB-005",
    landmass: "island"
  });
  assert.equal(remote?.status, "outside_coverage");
  assert.equal(remote?.hub.id, "KM-HUB-005");
});

test("conflicting mainland/island geography cannot be assigned", () => {
  assert.equal(resolveCensusHubFromPoint({
    latitude: 37.7467, longitude: 23.4275,
    landmass: "mainland", islandHubId: "KM-HUB-005"
  }), undefined);
});

test("verified WHOLE_ISLAND centre is still eligible", () => {
  const verified = resolveCensusHubFromPoint({
    latitude: 36.149, longitude: 22.989,
    landmass: "island", islandHubId: "KM-HUB-007"
  });
  assert.equal(verified?.status, "assigned");
  assert.equal(verified?.hub.id, "KM-HUB-007");
});
