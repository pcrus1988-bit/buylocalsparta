export type CommerceChannel = "normal" | "bazaar";

export type BazaarAwareCondition = "new" | "preloved" | "preowned_defect" | "open_box";

export type BazaarSource =
  | "supplier_preloved"
  | "supplier_preowned_defect"
  | "customer_return"
  | "open_box"
  | "display_stock"
  | "damaged_packaging"
  | "admin_curated";

export type CommerceClassification = Readonly<{
  condition: BazaarAwareCondition;
  commerceChannel: CommerceChannel;
  bazaarSource: BazaarSource | null;
}>;

const NORMAL_NEW: CommerceClassification = {
  condition: "new",
  commerceChannel: "normal",
  bazaarSource: null
};

/**
 * BrandsGateway/NOVA supplier condition routing.
 *
 * Known second-life conditions are fail-closed into the BAZAAR channel. Unknown
 * or missing supplier conditions retain the historical new/normal staging path;
 * they are never silently promoted into BAZAAR without supplier evidence.
 */
export function classifyNovaSupplierCondition(payload: Readonly<Record<string, unknown>>): CommerceClassification {
  const label = conditionLabel(payload.condition);
  if (!label) return NORMAL_NEW;

  const normalized = label.normalize("NFKC").trim().toLowerCase().replace(/[–—]/g, "-");
  if (normalized.includes("preloved") || normalized.includes("pre-loved")) {
    return { condition: "preloved", commerceChannel: "bazaar", bazaarSource: "supplier_preloved" };
  }
  if (
    normalized.includes("preowned")
    || normalized.includes("pre-owned")
    || normalized.includes("defect")
    || normalized.includes("damaged")
  ) {
    return { condition: "preowned_defect", commerceChannel: "bazaar", bazaarSource: "supplier_preowned_defect" };
  }
  if (normalized.includes("new with tags") || normalized === "new") return NORMAL_NEW;

  return NORMAL_NEW;
}

export function isBazaarClassification(classification: CommerceClassification): boolean {
  return classification.commerceChannel === "bazaar";
}

function conditionLabel(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  for (const candidate of [row.name, row.label, row.value, row.title]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}
