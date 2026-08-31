import type { PublicProductSuitability, PublicSuitableProduct } from "./public-product-suitability";

export type PublicProductRelationshipRole = "battery" | "charger" | "tool" | "related";

export type PublicRelationshipProduct = PublicSuitableProduct & Readonly<{
  isCurrent?: boolean;
  relationshipLabel: string;
}>;

export type PublicProductRelationshipGroup = Readonly<{
  key: string;
  title: string;
  description: string;
  products: readonly PublicRelationshipProduct[];
}>;

type SuitabilityWithRelationshipGroups = PublicProductSuitability & Readonly<{
  relationshipGroups?: readonly PublicProductRelationshipGroup[];
}>;

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/\s+/g, " ")
    .trim();
}

export function friendlyCompatibilityPlatformName(value: string): string {
  let result = value
    .replace(/\s+COMMON\s+BATTERY\s+FIT\s*$/i, "")
    .replace(/\s+COMMON\s+BATTERY\s+SYSTEM\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = result.split(" ").filter(Boolean);
  if (parts.length >= 2 && normalizedText(parts[0]) === normalizedText(parts[1])) {
    result = parts.slice(1).join(" ");
  }
  return result || value.trim();
}

export function productRelationshipRole(title: string): PublicProductRelationshipRole {
  const normalized = normalizedText(title);
  if (normalized.includes("μπαταρι") || /\bbattery\b/u.test(normalized)) return "battery";
  if (normalized.includes("φορτιστ") || normalized.includes("φοριστ") || /\bcharger\b/u.test(normalized)) return "charger";
  if (normalized.includes("εργαλει") || normalized.includes("μηχανη") || normalized.includes("πριον") || normalized.includes("ψαλιδ") || normalized.includes("φυσητη") || normalized.includes("χλοοκοπ") || /\btool\b/u.test(normalized)) return "tool";
  return "related";
}

export function relationshipGroupTitle(role: PublicProductRelationshipRole): string {
  if (role === "battery") return "Μπαταρίες στο ίδιο σύστημα";
  if (role === "charger") return "Φορτιστές στο ίδιο σύστημα";
  if (role === "tool") return "Εργαλεία στο ίδιο σύστημα";
  return "Προϊόντα στο ίδιο σύστημα";
}

export function relationshipGroupDescription(platformName: string): string {
  return `Κοινό σύστημα: ${friendlyCompatibilityPlatformName(platformName)}. Η ομαδοποίηση βασίζεται στη δηλωμένη πλατφόρμα του κατασκευαστή — όχι απλώς στην ίδια τάση.`;
}

export function relationshipGroupsFromSuitability(
  suitability: PublicProductSuitability | undefined,
): readonly PublicProductRelationshipGroup[] {
  return (suitability as SuitabilityWithRelationshipGroups | undefined)?.relationshipGroups ?? [];
}

export function withRelationshipGroups(
  suitability: PublicProductSuitability,
  relationshipGroups: readonly PublicProductRelationshipGroup[],
): PublicProductSuitability {
  if (!relationshipGroups.length) return suitability;
  return { ...suitability, relationshipGroups } as SuitabilityWithRelationshipGroups;
}
