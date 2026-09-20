import assert from "node:assert/strict";
import test from "node:test";
import {
  isSymphonyaSampleProduct,
  isSymphonyaTesterProduct,
  resolveSymphonyaCommercePolicy,
  SYMPHONYA_SAMPLE_BAZAAR_SOURCE,
  SYMPHONYA_TESTER_BAZAAR_SOURCE,
} from "./symphonya-commerce-policy.ts";

test("routes explicit Symphonya *Tester inventory to BAZAAR even when supplier condition says new", () => {
  const payload = {
    condition: { name: "new" },
    categoryDetails: { cat: "Fragrance", scat: "Perfumes" },
  };
  assert.equal(isSymphonyaTesterProduct("Versace, Eros, 100 ml *Tester", payload), true);
  assert.deepEqual(resolveSymphonyaCommercePolicy("Versace, Eros, 100 ml *Tester", payload), {
    commerceChannel: "bazaar",
    condition: "used",
    bazaarSource: SYMPHONYA_TESTER_BAZAAR_SOURCE,
    supplierTester: true,
    supplierSample: false,
  });
});

test("routes explicit Symphonya *Sample inventory to BAZAAR as new small-format stock", () => {
  const payload = {
    condition: { name: "new" },
    categoryDetails: { cat: "Fragrance", scat: "Perfumes" },
  };
  assert.equal(isSymphonyaSampleProduct("Kajol, Dahab, Eau De Parfum, Unisex, 3 ml *Sample", payload), true);
  assert.deepEqual(resolveSymphonyaCommercePolicy("Kajol, Dahab, Eau De Parfum, Unisex, 3 ml *Sample", payload), {
    commerceChannel: "bazaar",
    condition: "new",
    bazaarSource: SYMPHONYA_SAMPLE_BAZAAR_SOURCE,
    supplierTester: false,
    supplierSample: true,
  });
});

test("Tester takes precedence if a supplier title contains both markers", () => {
  assert.deepEqual(resolveSymphonyaCommercePolicy("Example 2 ml *Sample *Tester"), {
    commerceChannel: "bazaar",
    condition: "used",
    bazaarSource: SYMPHONYA_TESTER_BAZAAR_SOURCE,
    supplierTester: true,
    supplierSample: false,
  });
});

test("keeps ordinary Symphonya stock in the normal/new channel", () => {
  assert.deepEqual(resolveSymphonyaCommercePolicy("Versace, Eros, 100 ml", {
    condition: { name: "new" },
    categoryDetails: { cat: "Fragrance" },
  }), {
    commerceChannel: "normal",
    condition: "new",
    bazaarSource: null,
    supplierTester: false,
    supplierSample: false,
  });
});

test("recognizes explicit markers from normalized supplier titles", () => {
  assert.equal(isSymphonyaTesterProduct("Supplier fallback title", {
    name: "Gallinee Serum 30 ml *Tester",
  }), true);
  assert.equal(isSymphonyaSampleProduct("Supplier fallback title", {
    name: "Gallinee Serum 3 ml *Sample",
  }), true);
});
