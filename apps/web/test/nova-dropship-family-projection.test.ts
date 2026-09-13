import assert from "node:assert/strict";
import test from "node:test";
import { projectDropshipFamilies } from "../src/lib/dropship-family-projection.ts";

type Record = Readonly<{
  id: string;
  familyId: string | null;
  supplierId: string;
  externalProductId: string;
  priceMinor: number;
  availableToSell: number;
  sizes: readonly string[];
}>;

function record(overrides: Partial<Record> & Pick<Record, "id">): Record {
  return {
    id: overrides.id,
    familyId: overrides.familyId ?? null,
    supplierId: overrides.supplierId ?? "supplier-1",
    externalProductId: overrides.externalProductId ?? "product-1",
    priceMinor: overrides.priceMinor ?? 10000,
    availableToSell: overrides.availableToSell ?? 1,
    sizes: overrides.sizes ?? []
  };
}

test("family-less sibling inherits the single observed source-parent family for storefront dedupe", () => {
  const rows = [
    record({ id: "variant-s", familyId: "family-1", sizes: ["S"], availableToSell: 2 }),
    record({ id: "variant-m", familyId: null, sizes: ["M"], availableToSell: 3 })
  ];

  const projections = projectDropshipFamilies(rows, new Set(rows.map((row) => row.id)));

  assert.equal(projections.length, 1);
  assert.equal(projections[0]?.key, "family:family-1");
  assert.deepEqual(projections[0]?.sizes, ["S", "M"]);
  assert.equal(projections[0]?.availableToSell, 5);
});

test("conflicting family assignments are not silently collapsed through source identity", () => {
  const rows = [
    record({ id: "variant-a", familyId: "family-a" }),
    record({ id: "variant-b", familyId: "family-b" }),
    record({ id: "variant-unresolved", familyId: null })
  ];

  const projections = projectDropshipFamilies(rows, new Set(rows.map((row) => row.id)));

  assert.equal(projections.length, 3);
  assert.deepEqual(new Set(projections.map((projection) => projection.key)), new Set([
    "family:family-a",
    "family:family-b",
    "source:supplier-1:product-1"
  ]));
});
