export const SYMPHONYA_TESTER_BAZAAR_SOURCE = "supplier_tester" as const;
export const SYMPHONYA_SAMPLE_BAZAAR_SOURCE = "supplier_sample" as const;

export type SymphonyaCommercePolicy = Readonly<{
  commerceChannel: "normal" | "bazaar";
  condition: "new" | "used";
  bazaarSource: null | typeof SYMPHONYA_TESTER_BAZAAR_SOURCE | typeof SYMPHONYA_SAMPLE_BAZAAR_SOURCE;
  supplierTester: boolean;
  supplierSample: boolean;
}>;

const TESTER_MARKER = /\*\s*tester\b/i;
const SAMPLE_MARKER = /\*\s*sample\b/i;

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function supplierTexts(
  title: string,
  payload: Readonly<Record<string, unknown>> = {},
): readonly string[] {
  return [title, optionalText(payload.name), optionalText(payload.title)]
    .filter((value): value is string => Boolean(value));
}

export function isSymphonyaTesterProduct(
  title: string,
  payload: Readonly<Record<string, unknown>> = {},
): boolean {
  return supplierTexts(title, payload).some((value) => TESTER_MARKER.test(value));
}

export function isSymphonyaSampleProduct(
  title: string,
  payload: Readonly<Record<string, unknown>> = {},
): boolean {
  return supplierTexts(title, payload).some((value) => SAMPLE_MARKER.test(value));
}

export function resolveSymphonyaCommercePolicy(
  title: string,
  payload: Readonly<Record<string, unknown>> = {},
): SymphonyaCommercePolicy {
  if (isSymphonyaTesterProduct(title, payload)) {
    return {
      commerceChannel: "bazaar",
      condition: "used",
      bazaarSource: SYMPHONYA_TESTER_BAZAAR_SOURCE,
      supplierTester: true,
      supplierSample: false,
    };
  }

  if (isSymphonyaSampleProduct(title, payload)) {
    return {
      commerceChannel: "bazaar",
      condition: "new",
      bazaarSource: SYMPHONYA_SAMPLE_BAZAAR_SOURCE,
      supplierTester: false,
      supplierSample: true,
    };
  }

  return {
    commerceChannel: "normal",
    condition: "new",
    bazaarSource: null,
    supplierTester: false,
    supplierSample: false,
  };
}
