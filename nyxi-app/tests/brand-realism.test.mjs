import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AVAILABLE_POLISHES, AVAILABLE_BRANDS, findBrandPolish, validManufacturerProfile } from "../app/brand-polishes.ts";
import { brandMaterial, creativeMaterial } from "../app/nail-material-renderer.ts";
import { smoothLandmarks, handTrackingUsable } from "../app/nail-tracking.ts";
import { ambientFromRgb } from "../app/nail-ar-geometry.ts";

const atelier = readFileSync(new URL("../app/nail-style-studio.tsx", import.meta.url), "utf8");
const camera = readFileSync(new URL("../app/nail-ar-try-on.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../app/nail-ar-geometry.ts", import.meta.url), "utf8");

test("pilot brand catalogue requires official source and labels color as uncalibrated", () => {
  assert.ok(AVAILABLE_POLISHES.length >= 4);
  assert.ok(AVAILABLE_BRANDS.includes("OPI") && AVAILABLE_BRANDS.includes("essie"));
  assert.ok(AVAILABLE_POLISHES.every(p => p.evidence.calibratedColor === false));
  assert.ok(AVAILABLE_POLISHES.every(p => validManufacturerProfile(p)));
  assert.equal(findBrandPolish("unknown"), null);
  assert.equal(validManufacturerProfile({ ...AVAILABLE_POLISHES[0], evidence: { ...AVAILABLE_POLISHES[0].evidence, sourceUrl: "https://evil.example/catalog" } }), false);
});

test("brand profiles cannot acquire unverified chrome, magnetic or glitter effects", () => {
  const sheer = findBrandPolish("opi-nl-bubble-bath");
  assert.ok(sheer);
  const physical = brandMaterial(sheer);
  assert.equal(physical.kind, "sheer");
  assert.equal(physical.chrome, 0);
  assert.equal(physical.magnetic, 0);
  assert.equal(physical.glitter, 0);
  assert.ok(physical.coverage < 0.5);
  const creative = creativeMaterial("cat-eye", 0.95);
  assert.ok(creative.magnetic > 0 && creative.source === "creative");
});

test("unreliable tracking is suppressed and valid motion is smoothed without extrapolating", () => {
  const prev = Array.from({ length: 21 }, () => ({ x: 0.3, y: 0.4 }));
  const incoming = prev.map(p => ({ x: p.x + 0.008, y: p.y + 0.008 }));
  const result = smoothLandmarks(prev, incoming);
  assert.ok(result[0].x > prev[0].x && result[0].x < incoming[0].x);
  assert.equal(smoothLandmarks(prev, []).length, 0);
  assert.equal(handTrackingUsable(prev), false);
  const pose = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.5 }));
  pose[0] = {x:0.4,y:0.94}; pose[9] = {x:0.41,y:0.47};
  pose[5] = {x:0.25,y:0.52}; pose[17] = {x:0.7,y:0.5};
  assert.equal(handTrackingUsable(pose), true);
});

test("brand and creative modes remain exclusive in UI and material renderer", () => {
  assert.ok(atelier.includes('polishMode === "brand"'));
  assert.ok(atelier.includes('polishMode === "creative"'));
  assert.ok(atelier.includes("profile ? brandMaterial(profile) : creativeMaterial(finish, opacity)"));
  assert.ok(atelier.includes("profile.evidence.sourceUrl"));
  assert.ok(atelier.includes("εκτίμηση"));
  assert.ok(atelier.includes("branded={polishMode === \"brand\"}"));
  assert.ok(camera.includes('!branded &&'));
  assert.ok(renderer.includes('material.kind !== "matte"'));
  assert.ok(renderer.includes("material.magnetic > 0"));
  assert.ok(camera.includes("handTrackingUsable"));
});

test("polish highlight strength follows local lighting instead of always glowing", () => {
  assert.ok(ambientFromRgb(20, 20, 20) < ambientFromRgb(200, 200, 200));
  assert.ok(ambientFromRgb(255, 255, 255) <= 0.95);
  assert.ok(ambientFromRgb(NaN, 0, 0) < 1);
});
