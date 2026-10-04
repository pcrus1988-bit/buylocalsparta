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
import { resolveColorFinderContext } from "./color-finder-context.ts";

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

test("canonicalizes catalogue colours from both explicit attributes and product titles", () => {
  assert.equal(resolveCatalogColor({ color: "Pearly Pink Bubble" })?.hex, "#D998A8");
  assert.equal(resolveCatalogColor({ title: "Dior Vernis 900 Black Rivoli" })?.familyKey, "black");
  assert.equal(resolveCatalogColor({ title: "Beige Polyester Athletic Sneakers" })?.familyKey, "beige");
  assert.equal(resolveCatalogColor({ title: "Sensai Lipstick 03 Shakuyaku Red" })?.familyKey, "red");
  assert.equal(resolveCatalogColor({ title: "Koleston 8/97 Light Blonde Chestnut Pearl" })?.hex, "#7A4B37");
  assert.equal(inferColorFinish("Pearly Pink Bubble"), "pearly");
});


test("names selected colours by the nearest curated shade", () => {
  assert.equal(nearestColorName("#19191B").label, "Black");
  assert.equal(nearestColorName("#F2EEE8").label, "Off White");
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


test("does not confuse home fragrance with eye makeup", () => {
  const context = resolveColorFinderContext("candles-home-fragrance", "Κεριά & αρωματικά χώρου");
  assert.equal(context.key, "home");
  assert.equal(context.studioLabel, "HOME COLOR STUDIO");
});

test("keeps genuine eye makeup categories in Eye Studio", () => {
  assert.equal(resolveColorFinderContext("eye-makeup", "Μακιγιάζ ματιών").key, "eyes");
  assert.equal(resolveColorFinderContext("beauty-eyes", "Σκιές ματιών").studioLabel, "EYE STUDIO");
});


test("prefers an explicit HEX over a named approximation", () => {
  const resolved = resolveCatalogColor({ color: "Rosewood", title: "Shade #A14F63" });
  assert.equal(resolved?.hex, "#A14F63");
  assert.equal(resolved?.precision, "exact");
});

test("keeps Studio shades attached to the same canonical storefront family", () => {
  const resolved = resolveCatalogColor({ color: "Cobalt Blue" });
  assert.equal(resolved?.shadeKey, "cobalt");
  assert.equal(resolved?.familyKey, "royal-blue");
  assert.equal(resolved?.precision, "reference");
});


test("reported Shoe Studio shade stays above the visible-match floor", () => {
  const target = hexToLab("#6875E9");
  const canonicalBlue = hexToLab("#2F6DA8");
  const match = colorMatchPercent(deltaE2000(target, canonicalBlue));
  assert.ok(match >= 49);
});
