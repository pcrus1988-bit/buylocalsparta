export const BAZAAR_SOURCES = [
  "supplier_preloved",
  "supplier_preowned_defect",
  "customer_return",
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated",
] as const;

export type BazaarSource = (typeof BAZAAR_SOURCES)[number];

export const INTERNAL_SECOND_LIFE_SOURCES = [
  "customer_return",
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated",
] as const satisfies readonly BazaarSource[];

export type InternalSecondLifeSource = (typeof INTERNAL_SECOND_LIFE_SOURCES)[number];

export const BAZAAR_CONDITIONS = [
  "refurbished",
  "used",
  "preloved",
  "preowned_defect",
  "open_box",
] as const;

export type BazaarCondition = (typeof BAZAAR_CONDITIONS)[number];

const BAZAAR_SOURCE_SET = new Set<string>(BAZAAR_SOURCES);
const INTERNAL_SECOND_LIFE_SOURCE_SET = new Set<string>(INTERNAL_SECOND_LIFE_SOURCES);
const BAZAAR_CONDITION_SET = new Set<string>(BAZAAR_CONDITIONS);

export function isBazaarSource(value: unknown): value is BazaarSource {
  return typeof value === "string" && BAZAAR_SOURCE_SET.has(value);
}

export function isInternalSecondLifeSource(value: unknown): value is InternalSecondLifeSource {
  return typeof value === "string" && INTERNAL_SECOND_LIFE_SOURCE_SET.has(value);
}

export function isBazaarCondition(value: unknown): value is BazaarCondition {
  return typeof value === "string" && BAZAAR_CONDITION_SET.has(value);
}

export function assertBazaarSecondLifeMaterialization(input: {
  source: unknown;
  condition: unknown;
}): asserts input is { source: InternalSecondLifeSource; condition: BazaarCondition } {
  if (!isInternalSecondLifeSource(input.source)) {
    throw new Error("Invalid internal BAZAAR second-life source");
  }
  if (!isBazaarCondition(input.condition)) {
    throw new Error("Invalid BAZAAR second-life condition");
  }
}

/**
 * Stable namespace used by future second-life ingestion flows when deriving
 * canonical / offer identities. The source is part of the identity so an
 * open-box item can never silently reuse a customer-return/display-stock
 * canonical even when both originate from the same normal product.
 */
export function bazaarSecondLifeIdentityNamespace(input: {
  source: InternalSecondLifeSource;
  provenanceRef: string;
}): string {
  const provenanceRef = input.provenanceRef.trim();
  if (!provenanceRef) throw new Error("BAZAAR second-life provenance reference is required");
  return `${input.source}:${provenanceRef}`;
}
