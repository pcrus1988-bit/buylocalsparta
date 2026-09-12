import assert from "node:assert/strict";
import test from "node:test";
import {
  dropshipFamilyGroupKey,
  projectDropshipFamilies
} from "../src/lib/dropship-family-projection.ts";

type Row = Readonly<{
  id: string;
  familyId: string | null;
  supplierId: string;
  externalProductId: string;
  priceMinor: number;
  availableToSell: number;
  sizes: readonly string[];
}>;

const row = (overrides: Partial<Row> & Pick<Row, "id">): Row => ({
  id: overrides.id,
  familyId: overrides.familyId ?? "family-a",
  supplierId: overrides.supplierId ?? "nova",
  externalProductId: overrides.externalProductId ?? "10314594",
  priceMinor: overrides.priceMinor ?? 20000,
  availableToSell: overrides.availableToSell ?? 1,
  sizes: overrides.sizes ?? []
});

test("family-less Nova children use supplier parent identity instead of canonical variant id", () => {
  const first = row({ id: "variant-eu39", familyId: null });
  const second = row({ id: "variant-eu40", familyId: null });

  assert.equal(dropshipFamilyGroupKey(first), "source:nova:10314594");
  assert.equal(dropshipFamilyGroupKey(second), "source:nova:10314594");
});

test("a sibling-only size match keeps one family and selects the matching child", () => {
  const records = [
    row({ id: "variant-eu39", priceMinor: 19000, availableToSell: 2, sizes: ["EU39"] }),
    row({ id: "variant-eu40", priceMinor: 20500, availableToSell: 3, sizes: ["EU40"] })
  ];

  const projected = projectDropshipFamilies(records, new Set(["variant-eu40"]));

  assert.equal(projected.length, 1);
  assert.equal(projected[0]?.representative.id, "variant-eu40");
  assert.equal(projected[0]?.availableToSell, 5);
  assert.deepEqual(projected[0]?.sizes, ["EU39", "EU40"]);
});

test("different suppliers never collapse merely because external product ids match", () => {
  const records = [
    row({ id: "nova-child", familyId: null, supplierId: "nova", externalProductId: "same" }),
    row({ id: "other-child", familyId: null, supplierId: "other", externalProductId: "same" })
  ];

  const projected = projectDropshipFamilies(records, new Set(records.map((record) => record.id)));

  assert.equal(projected.length, 2);
  assert.notEqual(projected[0]?.key, projected[1]?.key);
});

test("non-matching families are omitted even when they are sellable", () => {
  const records = [
    row({ id: "family-a-child", familyId: "family-a" }),
    row({ id: "family-b-child", familyId: "family-b", externalProductId: "other" })
  ];

  const projected = projectDropshipFamilies(records, new Set(["family-a-child"]));

  assert.deepEqual(projected.map((entry) => entry.key), ["family:family-a"]);
});
