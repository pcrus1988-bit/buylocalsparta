import type { AadeInvoiceType, AadeIncomeClassificationCategory } from "./catalog.ts";

export type AadeSaleMappingReferenceInput = Readonly<{
  customerKind: string;
  itemKind: string;
  geography: string;
  direction: string;
  invoiceType: string;
  incomeCategory?: string;
  e3Code?: string;
}>;

export type AadeSaleMappingReferenceExpected = Readonly<{
  invoiceType: AadeInvoiceType;
  incomeCategory: AadeIncomeClassificationCategory;
  e3Code: string;
}>;

export type AadeSaleMappingReferenceResult = Readonly<{
  status: "match" | "drift" | "not_covered";
  expected?: AadeSaleMappingReferenceExpected;
  message: string;
}>;

type ReferenceKey = `${string}|${string}|${string}|${string}`;

const SALE_MAPPING_REFERENCE: Readonly<Record<ReferenceKey, AadeSaleMappingReferenceExpected>> = {
  "b2b|goods|domestic|sale": { invoiceType: "1.1", incomeCategory: "category1_1", e3Code: "E3_561_001" },
  "b2b|goods|eu|sale": { invoiceType: "1.2", incomeCategory: "category1_1", e3Code: "E3_561_005" },
  "b2b|goods|third_country|sale": { invoiceType: "1.3", incomeCategory: "category1_1", e3Code: "E3_561_006" },
  "b2b|services|domestic|sale": { invoiceType: "2.1", incomeCategory: "category1_3", e3Code: "E3_561_001" },
  "b2b|services|eu|sale": { invoiceType: "2.2", incomeCategory: "category1_3", e3Code: "E3_561_005" },
  "b2b|services|third_country|sale": { invoiceType: "2.3", incomeCategory: "category1_3", e3Code: "E3_561_006" },
  "b2b|services|domestic|platform_service": { invoiceType: "2.1", incomeCategory: "category1_3", e3Code: "E3_561_001" },
  "b2c|goods|domestic|sale": { invoiceType: "11.1", incomeCategory: "category1_1", e3Code: "E3_561_003" },
  "b2c|services|domestic|sale": { invoiceType: "11.2", incomeCategory: "category1_3", e3Code: "E3_561_003" }
};

export function checkAadeSaleMappingReference(input: AadeSaleMappingReferenceInput): AadeSaleMappingReferenceResult {
  const key = referenceKey(input);
  const expected = SALE_MAPPING_REFERENCE[key];
  if (!expected) {
    return {
      status: "not_covered",
      message: "No automatic reference is applied to this mapping; accountant approval remains authoritative."
    };
  }

  const actual = {
    invoiceType: input.invoiceType.trim(),
    incomeCategory: input.incomeCategory?.trim() ?? "",
    e3Code: input.e3Code?.trim() ?? ""
  };
  const matches = actual.invoiceType === expected.invoiceType
    && actual.incomeCategory === expected.incomeCategory
    && actual.e3Code === expected.e3Code;

  if (matches) {
    return {
      status: "match",
      expected,
      message: `Matches reference ${expected.invoiceType}/${expected.incomeCategory}/${expected.e3Code}.`
    };
  }

  return {
    status: "drift",
    expected,
    message: `Reference expects ${expected.invoiceType}/${expected.incomeCategory}/${expected.e3Code}; configured mapping is ${actual.invoiceType || "—"}/${actual.incomeCategory || "—"}/${actual.e3Code || "—"}. Accountant approval still controls production use.`
  };
}

export function aadeSaleMappingReferenceFor(input: Pick<AadeSaleMappingReferenceInput, "customerKind" | "itemKind" | "geography" | "direction">): AadeSaleMappingReferenceExpected | undefined {
  return SALE_MAPPING_REFERENCE[referenceKey(input)];
}

function referenceKey(input: Pick<AadeSaleMappingReferenceInput, "customerKind" | "itemKind" | "geography" | "direction">): ReferenceKey {
  return `${input.customerKind.trim().toLowerCase()}|${input.itemKind.trim().toLowerCase()}|${input.geography.trim().toLowerCase()}|${input.direction.trim().toLowerCase()}` as ReferenceKey;
}
