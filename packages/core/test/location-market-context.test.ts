import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCATION_COOKIE_NAME,
  resolveLocationSelection,
  resolveOperationalHub
} from "../../../apps/web/src/lib/market-context.ts";

test("location cookie contract stays aligned with /choose-location", () => {
  assert.equal(LOCATION_COOKIE_NAME, "km_locality");
});

test("missing or blank locality remains explicitly unselected", () => {
  assert.deepEqual(resolveLocationSelection(), { state: "unselected" });
  assert.deepEqual(resolveLocationSelection(null), { state: "unselected" });
  assert.deepEqual(resolveLocationSelection("   "), { state: "unselected" });
});

test("Sparta cookie resolves to the authoritative KM-HUB-015 entry", () => {
  const selection = resolveLocationSelection("sparti");
  assert.equal(selection.state, "selected");
  if (selection.state !== "selected") return;
  assert.equal(selection.hub.id, "KM-HUB-015");
  assert.equal(selection.hub.slug, "sparti");
  assert.equal(selection.hub.isSpartaLegacy, true);
  assert.equal(selection.hub.isLive, true);
  assert.equal(selection.gatewaySlug, "sparti");
});

test("Kalamata resolves through the same 131-HUB master without inventing a market id", () => {
  const selection = resolveLocationSelection("kalamata");
  assert.equal(selection.state, "selected");
  if (selection.state !== "selected") return;
  assert.equal(selection.hub.id, "KM-HUB-019");
  assert.equal(selection.hub.slug, "kalamata");
  assert.equal(selection.hub.isLive, false);
});

test("encoded cookie values are decoded and normalized for surrounding whitespace", () => {
  const selection = resolveLocationSelection("sparti%20");
  assert.equal(selection.state, "selected");
  if (selection.state !== "selected") return;
  assert.equal(selection.hub.id, "KM-HUB-015");
});

test("unknown and malformed locality cookies are invalid instead of falling back", () => {
  assert.deepEqual(resolveLocationSelection("not-a-hub"), {
    state: "invalid",
    rawValue: "not-a-hub"
  });
  assert.deepEqual(resolveLocationSelection("%E0%A4%A"), {
    state: "invalid",
    rawValue: "%E0%A4%A"
  });
});

test("operational resolution has no implicit Sparta fallback", () => {
  const selection = resolveLocationSelection();
  assert.equal(resolveOperationalHub(selection), null);
});

test("legacy Sparta fallback is explicit and only applies to an unselected visitor", () => {
  const fallback = resolveOperationalHub(resolveLocationSelection(), {
    allowLegacySpartaFallback: true
  });
  assert.ok(fallback);
  assert.equal(fallback.source, "legacy-sparta-fallback");
  assert.equal(fallback.hub.id, "KM-HUB-015");
  assert.equal(fallback.hub.slug, "sparti");

  const invalid = resolveOperationalHub(resolveLocationSelection("tampered-hub"), {
    allowLegacySpartaFallback: true
  });
  assert.equal(invalid, null);
});

test("an explicit HUB selection always wins over the legacy fallback option", () => {
  const selected = resolveOperationalHub(resolveLocationSelection("kalamata"), {
    allowLegacySpartaFallback: true
  });
  assert.ok(selected);
  assert.equal(selected.source, "selected");
  assert.equal(selected.hub.id, "KM-HUB-019");
});
