export type DropshipPublicFields = Readonly<{
  model: boolean;
  mpn: boolean;
  gtin: boolean;
  technicalAttributes: boolean;
  supplierSku: boolean;
}>;

export type DropshipPresentationConfig = Readonly<{
  version: 1;
  fields: DropshipPublicFields;
  productOverrides: Readonly<Record<string, DropshipPublicFields>>;
}>;

export const DEFAULT_DROPSHIP_PUBLIC_FIELDS: DropshipPublicFields = Object.freeze({
  model: true,
  mpn: true,
  gtin: true,
  technicalAttributes: true,
  supplierSku: false
});

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeDropshipPublicFields(value: unknown, fallback: DropshipPublicFields = DEFAULT_DROPSHIP_PUBLIC_FIELDS): DropshipPublicFields {
  const raw = objectValue(value);
  return {
    model: typeof raw.model === "boolean" ? raw.model : fallback.model,
    mpn: typeof raw.mpn === "boolean" ? raw.mpn : fallback.mpn,
    gtin: typeof raw.gtin === "boolean" ? raw.gtin : fallback.gtin,
    technicalAttributes: typeof raw.technicalAttributes === "boolean" ? raw.technicalAttributes : fallback.technicalAttributes,
    supplierSku: typeof raw.supplierSku === "boolean" ? raw.supplierSku : fallback.supplierSku
  };
}

export function parseDropshipPresentationConfig(value: unknown): DropshipPresentationConfig {
  const raw = objectValue(value);
  const fields = normalizeDropshipPublicFields(raw.fields);
  const overridesRaw = objectValue(raw.productOverrides);
  const productOverrides: Record<string, DropshipPublicFields> = {};
  for (const [offerId, override] of Object.entries(overridesRaw)) {
    const key = offerId.trim();
    if (!key || key.length > 160) continue;
    productOverrides[key] = normalizeDropshipPublicFields(override, fields);
  }
  return { version: 1, fields, productOverrides };
}

export function resolveDropshipPublicFields(config: DropshipPresentationConfig, offerId?: string | null): Readonly<{
  fields: DropshipPublicFields;
  overridden: boolean;
}> {
  const key = offerId?.trim();
  if (!key || !config.productOverrides[key]) return { fields: config.fields, overridden: false };
  return { fields: config.productOverrides[key], overridden: true };
}

export function assertDropshipPublicFields(value: unknown): DropshipPublicFields {
  const raw = objectValue(value);
  const keys = ["model", "mpn", "gtin", "technicalAttributes", "supplierSku"] as const;
  for (const key of keys) {
    if (typeof raw[key] !== "boolean") throw new Error(`Μη έγκυρη ρύθμιση public field: ${key}`);
  }
  return normalizeDropshipPublicFields(raw);
}
