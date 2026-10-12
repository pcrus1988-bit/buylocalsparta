import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studio = readFileSync(new URL("../app/photo-color-studio.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("photo color analysis is browser-only, with no photo upload", () => {
  assert.match(studio, /"use client"/);
  assert.match(studio, /createImageBitmap\(file\)/);
  assert.match(studio, /getImageData\(/);
  assert.doesNotMatch(studio, /fetch\(|XMLHttpRequest|FormData|sendBeacon/);
});

test("accept only constrained image types and image size", () => {
  assert.match(studio, /image\/jpeg/);
  assert.match(studio, /image\/png/);
  assert.match(studio, /image\/webp/);
  assert.match(studio, /MAX_IMAGE_BYTES\s*=\s*8\s*\*\s*1024\s*\*\s*1024/);
});

test("local shade suggestions do not imply catalogue matches", () => {
  assert.match(studio, /function nearbyShades\(/);
  assert.match(studio, /αντιστοιχίες εμπορικών προϊόντων/);
  assert.doesNotMatch(studio, /kontamou|shop\/|product\/|add.to.cart/i);
});

test("standalone homepage keeps reviewed-only research and conservative care", () => {
  assert.ok(home.includes("<PhotoColorStudio onColorPick={setSampledShade} />"));
  assert.ok(home.includes("/api/search"));
  assert.ok(home.includes("no_approved_evidence"));
  const guide = readFileSync(new URL("../app/guided-care.tsx", import.meta.url), "utf8");
  assert.ok(guide.includes("Δεν προτείνουμε θεραπεία"));
  assert.ok(guide.includes("warningSigns"));
  assert.ok(home.includes("<GuidedCare />"));
  assert.ok(home.includes("<NailStyleStudio sampledShade={sampledShade} active={tab === \"style\"} />"));
  assert.match(layout, /index:\s*false/);
});

test("mobile and reduced-motion layouts are supported", () => {
  assert.match(stylesheet, /max-width:760px/);
  assert.match(stylesheet, /max-width:480px/);
  assert.match(stylesheet, /prefers-reduced-motion/);
});

test("color samples stay in memory and connect the two studios", () => {
  const atelier = readFileSync(new URL("../app/nail-style-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /onColorPick\?\.\(hexFromRgb\(picked\)\)/);
  assert.match(atelier, /sampledShade/);
  assert.doesNotMatch(atelier, /fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
