export const SYMPHONYA_TESTER_BAZAAR_SOURCE = "supplier_tester" as const;

export type SymphonyaCommercePolicy = Readonly<{
  commerceChannel: "normal" | "bazaar";
  condition: "new" | "used";
  bazaarSource: null | typeof SYMPHONYA_TESTER_BAZAAR_SOURCE;
  supplierTester: boolean;
}>;

const TESTER_MARKER = /\*\s*tester\b/i;

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isSymphonyaTesterProduct(
  title: string,
  payload: Readonly<Record<string, unknown>> = {},
): boolean {
  return [title, optionalText(payload.name), optionalText(payload.title)]
    .some((value) => Boolean(value && TESTER_MARKER.test(value)));
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
    };
  }

  return {
    commerceChannel: "normal",
    condition: "new",
    bazaarSource: null,
    supplierTester: false,
  };
}
