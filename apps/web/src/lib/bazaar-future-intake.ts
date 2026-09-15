import {
  buildBazaarSecondLifeMaterializationPlan,
  type BazaarCondition,
  type BazaarSecondLifeMaterializationPlan,
} from "./bazaar-second-life-policy";

export const FUTURE_BAZAAR_INTAKE_SOURCES = [
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated",
] as const;

export type FutureBazaarIntakeSource = (typeof FUTURE_BAZAAR_INTAKE_SOURCES)[number];

const FUTURE_SOURCE_SET = new Set<string>(FUTURE_BAZAAR_INTAKE_SOURCES);

export function isFutureBazaarIntakeSource(value: unknown): value is FutureBazaarIntakeSource {
  return typeof value === "string" && FUTURE_SOURCE_SET.has(value);
}

export function defaultFutureBazaarCondition(source: FutureBazaarIntakeSource): BazaarCondition {
  return source === "admin_curated" ? "used" : "open_box";
}

/**
 * Creates the identity/provenance contract for non-return internal second-life
 * stock. Supplier Preloved / Preowned-Defect and customer returns are rejected
 * here deliberately: they have their own ingestion paths and must never be
 * canonical-merged through a generic future-stock intake.
 */
export function buildFutureBazaarIntakePlan(input: {
  source: unknown;
  provenanceRef: string;
  baseSlug: string;
  baseVendorSku: string;
  originalCanonicalId: string;
  originalOfferId?: string;
  condition?: BazaarCondition;
  metadata?: Record<string, unknown>;
}): BazaarSecondLifeMaterializationPlan {
  if (!isFutureBazaarIntakeSource(input.source)) {
    throw new Error("Future BAZAAR intake requires open-box, display-stock, damaged-packaging, or curated source");
  }

  const condition = input.condition ?? defaultFutureBazaarCondition(input.source);
  if (condition === "preloved" || condition === "preowned_defect") {
    throw new Error("Supplier BAZAAR conditions cannot be used for internal second-life intake");
  }

  return buildBazaarSecondLifeMaterializationPlan({
    source: input.source,
    condition,
    provenanceRef: input.provenanceRef,
    baseSlug: input.baseSlug,
    baseVendorSku: input.baseVendorSku,
    originalCanonicalId: input.originalCanonicalId,
    originalOfferId: input.originalOfferId,
    metadata: {
      ...(input.metadata ?? {}),
      intakeChannel: "bazaar",
      intakeSource: input.source,
    },
  });
}
