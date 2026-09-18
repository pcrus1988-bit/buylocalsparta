import assert from "node:assert/strict";
import test from "node:test";

import { resolveNovaCategoryCode } from "../src/lib/nova-auto-publication-runtime";

function payload(level2: string, level3: string, gender = "Women") {
  return {
    categoryDetails: [
      { id: 71651, name: "Clothing" },
      { id: 1, name: level2 },
      { id: 2, name: level3 }
    ],
    gender: { id: 71576, name: gender },
    attributes: [
      { name: "Brand", option: "Dolce & Gabbana" },
      { name: "Color", option: "Black" }
    ]
  };
}

test("NOVA skirts and pants follow supplier categoryDetails instead of Brand substring evidence", () => {
  assert.equal(
    resolveNovaCategoryCode(payload("Skirts", "Mini"), "Multicolor Sequin MidWaist A-line Mini Skirt"),
    "fashion-womens-skirts"
  );
  assert.equal(
    resolveNovaCategoryCode(payload("Pants", "Dress Pants"), "Black High Waist Straight Dress Trouser Pants"),
    "fashion-womens-trousers-jeans"
  );
});

test("NOVA Brand attributes cannot falsely classify ordinary clothing as underwear", () => {
  assert.equal(
    resolveNovaCategoryCode(payload("Sweaters", "Cardigans"), "Wool Cardigan"),
    "fashion-womens-knitwear"
  );
  assert.equal(
    resolveNovaCategoryCode(payload("T-Shirts", "T-Shirts", "Men"), "Cotton T-Shirt"),
    "fashion-mens-tshirts-tops"
  );
});

test("NOVA exact clothing hierarchy keeps shorts separate and genuine underwear intact", () => {
  assert.equal(
    resolveNovaCategoryCode(payload("Shorts", "Bermuda"), "Tailored Bermuda Shorts"),
    "fashion-womens-shorts"
  );
  assert.equal(
    resolveNovaCategoryCode(payload("Underwear", "Bras"), "Lace Bra"),
    "womens-underwear"
  );
});
