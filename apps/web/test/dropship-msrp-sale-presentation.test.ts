import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicPriceBadgeLabel, publicSavingsPercent } from "../src/lib/public-price-presentation.ts";

const msrpProjectionUrl = new URL("../src/lib/public-offer-msrp.ts", import.meta.url);
const cardUrl = new URL("../src/components/CatalogProductCard.tsx", import.meta.url);
const detailPriceUrl = new URL("../src/components/PublicPriceComparison.tsx", import.meta.url);

test("dropship offers can expose valid MSRP without weakening local offer visibility policy", async () => {
  const source = await readFile(msrpProjectionUrl, "utf8");

  assert.match(source, /vo\.show_msrp=true/);
  assert.match(source, /OR EXISTS \(/);
  assert.match(source, /FROM dropship_supplier_offers dso/);
  assert.match(source, /JOIN dropship_suppliers ds ON ds\.id=dso\.supplier_id/);
  assert.match(source, /dso\.active=true/);
  assert.match(source, /ds\.active=true/);
  assert.match(source, /vo\.msrp_minor>vo\.customer_price_minor/);
});

test("MSRP savings math matches the BAZAAR convention", () => {
  assert.equal(publicSavingsPercent(150000, 78990), 47.3);
  assert.equal(publicSavingsPercent(160000, 118490), 25.9);
  assert.equal(publicSavingsPercent(10000, 10000), undefined);
  assert.equal(publicSavingsPercent(9000, 10000), undefined);
});

test("dropship cards use a prominent saving badge and reserve SALE for explicit promotions", async () => {
  const source = await readFile(cardUrl, "utf8");

  assert.match(source, /supplierFulfilled \|\| highlightKind === "sale"/);
  assert.match(source, /data-price-highlight-kind=\{highlightKind\}/);
  assert.match(source, /background: highlightKind === "sale" \? "var\(--terracotta, #aa664f\)" : "#111"/);
  assert.match(source, /publicPriceBadgeLabel\(highlightKind, savingLabel\)/);
  assert.equal(publicPriceBadgeLabel("msrp-savings", "47"), "−47%");
  assert.equal(publicPriceBadgeLabel("sale", "47"), "SALE · −47%");
});

test("product detail calls out the saving against MSRP and has a future explicit SALE state", async () => {
  const source = await readFile(detailPriceUrl, "utf8");

  assert.match(source, /Κερδίζεις \{savingLabel\}% έναντι ΠΛΤ/);
  assert.match(source, /highlightKind = "msrp-savings"/);
  assert.match(source, /highlightKind === "sale"/);
  assert.match(source, /publicPriceBadgeLabel\("sale", savingLabel\)/);
});
