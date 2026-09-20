import assert from "node:assert/strict";
import test from "node:test";
import {
  isSymphonyaTesterProduct,
  resolveSymphonyaCommercePolicy,
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
  });
});

test("recognizes the explicit tester marker from normalized supplier titles", () => {
  assert.equal(isSymphonyaTesterProduct("Supplier fallback title", {
    name: "Gallinee Serum 30 ml *Tester",
  }), true);
});
