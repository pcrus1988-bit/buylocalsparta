import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const hero = source("../app/premium-hero.tsx");
const cover = source("../app/editorial-v2.css");
const page = source("../app/page.tsx");
const layout = source("../app/layout.tsx");

test("hero is a licensed editorial photo, not artificial product packaging", () => {
  assert.match(hero, /images\.unsplash\.com\/photo-1638668518908-7014917e4507/);
  assert.match(hero, /Bansah Photography \/ Unsplash/);
  assert.match(hero, /<picture>/);
  assert.match(hero, /fetchPriority="high"/);
  assert.doesNotMatch(hero, /polish-bottle|polish-composition|art-orbit/);
});

test("hero is real navigation and all original tools remain accessible", () => {
  assert.match(hero, /onOpen\("color"\)/);
  assert.match(hero, /onOpen\("style"\)/);
  assert.match(page, /setTab\(destination\)/);
  for (const tab of ['tab !== "color"', 'tab !== "care"', 'tab !== "style"', 'tab !== "search"']) {
    assert.ok(page.includes(tab), "Missing working tab: " + tab);
  }
  assert.match(page, /<PublicSourceAtlas/);
  assert.match(page, /<NailStyleStudio/);
  assert.match(page, /<PhotoColorStudio/);
  assert.match(page, /<GuidedCare/);
});

test("editorial layout offers mobile-first handling, accessible type and reduced motion", () => {
  assert.match(hero, /aria-labelledby="hero-title"/);
  assert.match(hero, /<h1 id="hero-title">/);
  assert.match(cover, /@media\(max-width:480px\)/);
  assert.match(cover, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(cover, /:focus-visible|\.nyxi-cover-primary:hover/);
  assert.match(layout, /import '\.\/editorial-v2\.css';/);
  assert.match(hero, /rel="noopener noreferrer"/);
});
