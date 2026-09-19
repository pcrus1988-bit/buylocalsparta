import assert from "node:assert/strict";
import test from "node:test";
import {
  colorMatchPercent,
  deltaE2000,
  hexToLab,
  inferColorFinish,
  inferColorProductType,
  nearestColorName,
  normalizeHex,
  resolveCatalogColor
} from "./color-finder.ts";

test("normalizes short and full HEX colours", () => {
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex("b52e2e"), "#B52E2E");
  assert.equal(normalizeHex("nope"), undefined);
});

test("same colour has zero perceptual distance", () => {
  const color = hexToLab("#B52E2E");
  assert.ok(Math.abs(deltaE2000(color, color)) < 1e-9);
  assert.equal(colorMatchPercent(0), 100);
});

test("canonicalizes common nail shade vocabulary without treating a search colour as product evidence", () => {
  assert.equal(resolveCatalogColor({ color: "Pearly Pink Bubble" })?.hex, "#D9859B");
  assert.equal(resolveCatalogColor({ title: "Dior Vernis 900 Black Rivoli" })?.hex, "#19191B");
  assert.equal(inferColorFinish("Pearly Pink Bubble"), "pearly");
});


test("names selected colours by the nearest curated shade", () => {
  assert.equal(nearestColorName("#19191B").label, "Black");
  assert.equal(nearestColorName("#F2EEE8").label, "White");
  assert.ok(nearestColorName("#B52E2E").deltaE >= 0);
});


test("match percentage is monotonic and the 49 percent floor maps to a meaningful perceptual distance", () => {
  assert.equal(colorMatchPercent(0), 100);
  assert.equal(colorMatchPercent(18), 50);
  assert.equal(colorMatchPercent(18.5), 49);
  assert.ok(colorMatchPercent(8) > colorMatchPercent(14));
  assert.ok(colorMatchPercent(14) > colorMatchPercent(22));
});

test("infers nail product type and finish independently", () => {
  assert.equal(inferColorProductType("Semi permanent gel polish"), "gel");
  assert.equal(inferColorProductType("Classic nail lacquer"), "regular");
  assert.equal(inferColorFinish("EN850 Pearly Pink Bubble"), "pearly");
});
