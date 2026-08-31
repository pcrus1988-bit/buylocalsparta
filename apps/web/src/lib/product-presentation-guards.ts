const COMPATIBILITY_PRESENTATION_KEYS = new Set([
  "compatible_models",
  "compatible_model",
  "suitable_for",
  "suitable_for_model",
  "suitable_for_models",
  "supported_models",
  "works_with",
  "works_with_models",
  "designed_for",
  "explicit_fitment_models",
  "explicit_compatible_models",
  "explicit_compatible_models_all",
  "explicit_compatible_models_validated",
  "external_compatible_models",
  "platform_compatible_models",
  "reverse_compatible_accessories",
  "related_models",
  "compatible_brands",
  "compatible_brand",
  "suitable_for_brands",
  "supported_brands",
  "compatible_platforms",
  "compatible_platform",
  "suitable_for_platforms",
  "supported_platforms",
  "compatibility_type",
  "compatibility",
  "compatibility_note",
  "compatibility_notes",
  "compatibility_confidence",
  "compatibility_claims_json",
  "compatibility_relationship_json",
  "compatibility_interface_json",
  "compatibility_evidence_url",
  "compatibility_evidence_basis",
  "compatibility_discrepancy_flags",
  "unresolved_compatibility_tokens",
  "καταλληλο_για",
  "συμβατα_μοντελα",
  "συμβατες_μαρκες",
  "συμβατες_πλατφορμες"
]);

const NON_MANUAL_DOCUMENT_MARKERS = [
  "iso9001",
  "iso-9001",
  "iso_9001",
  "certificate",
  "certification",
  "certificat",
  "πιστοποι",
  "declaration-of-conformity",
  "declaration_of_conformity",
  "declarationofconformity",
  "declaration-conformity",
  "ce-declaration",
  "ce_declaration"
] as const;

export function normalizeProductPresentationKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function isCompatibilityPresentationKey(value: string): boolean {
  const key = normalizeProductPresentationKey(value);
  return COMPATIBILITY_PRESENTATION_KEYS.has(key)
    || key.startsWith("compatibility_")
    || key.startsWith("compatible_")
    || key.startsWith("explicit_compatible_")
    || key.startsWith("explicit_fitment_")
    || key.startsWith("platform_compatible_")
    || key.startsWith("external_compatible_")
    || key.startsWith("reverse_compatible_");
}

export function plausibleProductManualUrl(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    const searchable = decodeURIComponent(`${url.pathname} ${url.search}`).toLocaleLowerCase("el");
    if (NON_MANUAL_DOCUMENT_MARKERS.some((marker) => searchable.includes(marker))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
