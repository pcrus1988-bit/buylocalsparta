import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cardStyleUrl = new URL("../src/components/CatalogProductCard.module.css", import.meta.url);
const gridStyleUrl = new URL("../src/app/premium-mobile-acceptance.css", import.meta.url);

test("catalogue cards stay within responsive grid tracks", async () => {
  const css = await readFile(cardStyleUrl, "utf8");
  const cardRule = css.match(/\\.visualCard\\s*\\{([^}]+)\\}/)?.[1] ?? "";

  // A fixed minimum height plus a 4:5 aspect ratio can transfer a minimum
  // width to the grid item and make four-column catalogue cards overlap.
  assert.match(cardRule, /width:\\s*100%\\s*;/);
  assert.match(cardRule, /max-width:\\s*100%\\s*;/);
  assert.match(cardRule, /min-width:\\s*0\\s*;/);
  assert.match(cardRule, /min-height:\\s*0\\s*;/);
  assert.match(cardRule, /aspect-ratio:\\s*4\\s*\\/\\s*5\\s*;/);
  assert.doesNotMatch(cardRule, /min-height:\\s*380px/);
});

test("shop layout has nonzero gutters between product cards", async () => {
  const css = await readFile(gridStyleUrl, "utf8");
  assert.match(css, /\\.catalog-results\\s*>\\s*\\.catalog-product-grid\\s*\\{\\s*column-gap:\\s*clamp\\(14px, 1\\.2vw, 20px\\);\\s*row-gap:/);
  assert.match(css, /@media\\s*\\(max-width:\\s*640px\\)\\s*\\{\\s*\\.catalog-results\\s*>\\s*\\.catalog-product-grid\\s*\\{\\s*column-gap:\\s*10px;\\s*row-gap:\\s*12px;/);
});
