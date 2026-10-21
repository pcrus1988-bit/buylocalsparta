import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = file => readFileSync(new URL(file, import.meta.url), "utf8");
const hero = src("../app/premium-hero.tsx");
const css = src("../app/color-theatre.css");
const page = src("../app/page.tsx");
const layout = src("../app/layout.tsx");

test("first viewport is an interactive instrument and not an inert landing page", () => {
  assert.match(hero, /const \[selected, setSelected\] = useState\(0\)/);
  assert.match(hero, /setSelected\(index\)/);
  assert.match(hero, /aria-pressed=\{selected === index\}/);
  assert.match(hero, /nyxi-lacquer-sculpture/);
  assert.match(hero, /nyxi-instrument-cta/);
  assert.match(hero, /onPalettePick\?\.\(active\.color\)/);
  assert.match(hero, /onOpen\("style"\)/);
  assert.match(page, /onPalettePick=\{setSampledShade\}/);
  assert.match(page, /<NailStyleStudio sampledShade=\{sampledShade\}/);
});

test("we label the visual specimen as illustration, not real product photography", () => {
  assert.match(hero, /DIGITAL COLOR STUDY/);
  assert.match(hero, /NOT A PRODUCT MATCH/);
  assert.match(hero, /Photo: Bansah Photography \/ Unsplash/);
  assert.match(hero, /rel="noopener noreferrer"/);
  assert.doesNotMatch(hero, /guaranteed|clinical|100% accurate/i);
});

test("responsive visual has focus treatments, accessible palette and motion safeguards", () => {
  assert.match(hero, /role="group" aria-label="Δοκίμασε μια χρωματική κατεύθυνση"/);
  assert.match(hero, /aria-live="polite"/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /@media\(max-width:355px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(layout, /import '\.\/color-theatre\.css';/);
  assert.match(layout, /width: 'device-width'/);
});

test("color choices are real CSS values with distinct named stories", () => {
  for (const color of ["#8C173B", "#D49AA7", "#563C3C", "#9986C0", "#E4CDBD"]) {
    assert.ok(hero.includes(color), "Missing color " + color);
  }
});
