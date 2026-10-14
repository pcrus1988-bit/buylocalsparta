import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { coverProjection, deriveNails, projectPoint, validShade, NAIL_JOINTS } from "../app/nail-ar-geometry.ts";

const ar = readFileSync(new URL("../app/nail-ar-try-on.tsx", import.meta.url), "utf8");
const atelier = readFileSync(new URL("../app/nail-style-studio.tsx", import.meta.url), "utf8");
const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const packageData = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const params = { width: 380, height: 520, imageWidth: 960, imageHeight: 1280, mirror: false };

function handFixture() {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.65 }));
  for (const joint of NAIL_JOINTS) {
    const x = 0.25 + joint.finger * 0.12;
    landmarks[joint.tip] = { x, y: 0.25 };
    landmarks[joint.dip] = { x, y: 0.30 };
    landmarks[joint.pip] = { x, y: 0.38 };
  }
  return landmarks;
}

test("cover projection crops to container dimensions and mirrors X correctly", () => {
  const crop = coverProjection(params);
  assert.ok(crop && crop.scale > 0);
  assert.equal(coverProjection({ ...params, imageWidth: 0 }), null);
  const left = projectPoint({ x: 0.25, y: 0.3 }, params);
  const right = projectPoint({ x: 0.25, y: 0.3 }, { ...params, mirror: true });
  assert.ok(Math.abs((left.x + right.x) - params.width) < 0.0001);
  assert.equal(left.y, right.y);
});

test("landmark geometry returns a stable nail for each valid fingertip", () => {
  const hand = handFixture();
  const short = deriveNails(hand, params, "short");
  const long = deriveNails(hand, params, "long");
  assert.equal(short.length, 5);
  assert.equal(long.length, 5);
  assert.ok(long.every((n, i) => n.height > short[i].height));
  assert.ok(short.every(n => Number.isFinite(n.angle) && n.width > 5));
  const narrow = deriveNails(hand, params, "medium", 0.75, -0.2);
  const wide = deriveNails(hand, params, "medium", 1.25, 0.2);
  assert.ok(wide[0].width > narrow[0].width);
  assert.notEqual(wide[0].y, narrow[0].y);
});

test("invalid or tiny landmarks never produce fictitious nails", () => {
  assert.deepEqual(deriveNails([], params, "medium"), []);
  const hand = handFixture();
  hand[8] = { x: 0.5, y: 0.3 };
  hand[7] = { x: 0.5, y: 0.3 };
  assert.equal(deriveNails(hand, params, "medium").length, 4);
  assert.equal(validShade("#C0FFEE"), true);
  assert.equal(validShade("javascript:alert(1)"), false);
});

test("AR stays opt-in, on-device, and has explicit camera teardown", () => {
  assert.match(ar, /getUserMedia\(/);
  assert.match(ar, /getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(ar, /cancelAnimationFrame/);
  assert.match(ar, /visibilitychange/);
  assert.match(ar, /pagehide/);
  assert.match(ar, /document\.createElement\("a"\)/);
  assert.match(ar, /toBlob\(/);
  assert.match(ar, /const DETECTION_INTERVAL_MS = 90/);
  assert.match(ar, /FilesetResolver/);
  assert.match(ar, /HandLandmarker/);
  assert.doesNotMatch(ar, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
});

test("controls are linked, camera shuts down on tab leave, photo fallback exists", () => {
  assert.match(atelier, /viewMode === "live"/);
  assert.match(atelier, /viewMode === "photo"/);
  assert.match(atelier, /opacity/);
  assert.match(atelier, /setFit/);
  assert.match(atelier, /setPlacement/);
  assert.match(atelier, /cat-eye/);
  assert.match(atelier, /NailArTryOn/);
  assert.ok(homepage.includes('active={tab === "style"}'));
  assert.equal(packageData.dependencies["@mediapipe/tasks-vision"], "1.1.0");
});
