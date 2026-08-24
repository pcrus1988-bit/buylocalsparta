import test from "node:test";
import assert from "node:assert/strict";
import { extractRetailVisibleProductCandidate } from "../src/ingestion/retail-visible-extraction.ts";

test("extracts Greek retailer product code, comma-decimal price and visible specifications", () => {
  const html = `<!doctype html><html><head><title>Asus Zenbook UX3405CA | Shop</title></head><body>
    <main>
      <h1>Asus Zenbook UX3405CA-OLED-PZ412X Laptop 14&quot; OLED Αφής</h1>
      <div>1.549,00 €</div>
      <button>Προσθήκη</button>
      <div>Κωδικός Πλαίσιο 4661567</div>
      <section><h2>Περιγραφή</h2><p>Πανίσχυρος επεξεργαστής Intel Core Ultra 9, 32GB RAM και οθόνη OLED για απαιτητική καθημερινή χρήση.</p></section>
      <section><h2>Χαρακτηριστικά</h2>
        <div>Οθόνη:</div><div>14&quot; OLED Αφής 2880 x 1800</div>
        <div>Επεξεργαστής:</div><div>Intel Core Ultra 9 285H 5.4 GHz</div>
        <div>Μνήμη:</div><div>32 GB LPDDR5X</div>
        <div>Χωρητικότητα:</div><div>1 TB</div>
      </section>
      <img class="product-gallery" src="https://res.example.test/product-4661567-1.jpg" alt="Asus Zenbook UX3405CA-OLED-PZ412X Laptop 14 OLED Αφής">
    </main>
  </body></html>`;
  const candidate = extractRetailVisibleProductCandidate(html, "https://shop.example/product/pc/laptops/asus-zenbook_4661567");
  assert.ok(candidate);
  assert.equal(candidate.sku, "4661567");
  assert.equal(candidate.brand, "Asus");
  assert.equal(candidate.prices?.[0]?.amountMinor, 154900);
  assert.equal(candidate.prices?.[0]?.currency, "EUR");
  assert.equal(candidate.attributes["οθόνη"], '14" OLED Αφής 2880 x 1800');
  assert.equal(candidate.attributes["επεξεργαστής"], "Intel Core Ultra 9 285H 5.4 GHz");
  assert.equal(candidate.attributes["μνήμη"], "32 GB LPDDR5X");
  assert.equal(candidate.attributes["χωρητικότητα"], "1 TB");
  assert.match(candidate.description ?? "", /Πανίσχυρος επεξεργαστής/);
});

test("does not turn a retailer collection page into one fake product", () => {
  const html = `<!doctype html><html><body>
    <h1>Laptops</h1><div>488 προϊόντα</div>
    <article><h2>Asus Laptop</h2><div>1.549,00 €</div><div>Κωδ. Πλαίσιο 4661567</div></article>
    <article><h2>HP Laptop</h2><div>899,00 €</div><div>Κωδ. Πλαίσιο 5276756</div></article>
  </body></html>`;
  const candidate = extractRetailVisibleProductCandidate(html, "https://shop.example/list/pc/laptops");
  assert.equal(candidate, undefined);
});
