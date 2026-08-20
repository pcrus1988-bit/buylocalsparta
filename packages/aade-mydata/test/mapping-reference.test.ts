import assert from "node:assert/strict";
import test from "node:test";
import { checkAadeSaleMappingReference } from "../src/mapping-reference.ts";

const expectedMappings = [
  ["b2b","goods","domestic","sale","1.1","category1_1","E3_561_001"],
  ["b2b","goods","eu","sale","1.2","category1_1","E3_561_005"],
  ["b2b","goods","third_country","sale","1.3","category1_1","E3_561_006"],
  ["b2b","services","domestic","sale","2.1","category1_3","E3_561_001"],
  ["b2b","services","eu","sale","2.2","category1_3","E3_561_005"],
  ["b2b","services","third_country","sale","2.3","category1_3","E3_561_006"],
  ["b2b","services","domestic","platform_service","2.1","category1_3","E3_561_001"],
  ["b2c","goods","domestic","sale","11.1","category1_1","E3_561_003"],
  ["b2c","services","domestic","sale","11.2","category1_3","E3_561_003"]
] as const;

test("approved KONTA MOY sale-flow combinations match the advisory reference", () => {
  for (const [customerKind,itemKind,geography,direction,invoiceType,incomeCategory,e3Code] of expectedMappings) {
    const result = checkAadeSaleMappingReference({ customerKind,itemKind,geography,direction,invoiceType,incomeCategory,e3Code });
    assert.equal(result.status, "match");
  }
});

test("a semantically wrong but otherwise plausible classification is reported as drift", () => {
  const result = checkAadeSaleMappingReference({
    customerKind: "b2c",
    itemKind: "goods",
    geography: "domestic",
    direction: "sale",
    invoiceType: "11.2",
    incomeCategory: "category1_3",
    e3Code: "E3_561_003"
  });
  assert.equal(result.status, "drift");
  assert.equal(result.expected?.invoiceType, "11.1");
  assert.match(result.message, /Accountant approval still controls production use/);
});

test("credit notes are deliberately left to their correlation/accounting workflow", () => {
  const result = checkAadeSaleMappingReference({
    customerKind: "b2b",
    itemKind: "mixed",
    geography: "domestic",
    direction: "credit",
    invoiceType: "5.1"
  });
  assert.equal(result.status, "not_covered");
});
