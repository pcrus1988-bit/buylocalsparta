import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = file("../app/page.tsx");
const hero = file("../app/premium-hero.tsx");
const styles = file("../app/premium.css");
const layout = file("../app/layout.tsx");

test("premium hero routes users to the real studios rather than a mock experience", () => {
  assert.match(page, /<PremiumHero onOpen=\{destination =>/);
  assert.match(page, /setTab\(destination\)/);
  assert.match(page, /getElementById\("nyxi-tools"\)/);
  assert.match(hero, /onOpen\("color"\)/);
  assert.match(hero, /onOpen\("style"\)/);
  for (const key of ['tab !== "color"', 'tab !== "care"', 'tab !== "style"', 'tab !== "search"']) {
    assert.ok(page.includes(key), key + " is still available");
  }
});

test("editorial UI uses accessible headings and respects reduced motion and mobile", () => {
  assert.match(hero, /aria-labelledby="hero-title"/);
  assert.match(hero, /<h1 id="hero-title">/);
  assert.match(hero, /type="button"/);
  assert.match(page, /aria-pressed=\{tab === item\.value\}/);
  assert.match(styles, /@media\(max-width:520px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /:focus-visible/);
  assert.match(layout, /import '\.\/premium\.css';/);
});

test("public editorial changes preserve the evidence-led beta disclosures", () => {
  assert.match(page, /NEXT_PUBLIC_NYXI_SEARCH_ENABLED/);
  assert.match(page, /<PublicSourceAtlas/);
  assert.match(page, /<GuidedCare/);
  assert.match(page, /<NailStyleStudio/);
  assert.match(page, /BETA/);
  assert.doesNotMatch(hero, /guaranteed|clinically proven|100% accurate/i);
});
