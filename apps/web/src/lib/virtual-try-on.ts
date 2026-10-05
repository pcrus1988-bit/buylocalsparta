import { createHash } from "node:crypto";

export type VirtualTryOnCategory = "tops" | "bottoms" | "one-pieces";

export const TRYON_MODEL_PROVIDER = "fashn-vton" as const;
export const TRYON_MODEL_VERSION = "1.5" as const;
export const TRYON_PREVIEW_TTL_MS = 5 * 60 * 1000;
export const TRYON_REFERENCE_MAX_BYTES = 15 * 1024 * 1024;
export const TRYON_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^a-z0-9α-ω]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveVirtualTryOnCategory(input: Readonly<{
  title?: string;
  categoryCode?: string;
  categoryLabel?: string;
}>): VirtualTryOnCategory | undefined {
  const text = normalized([input.title, input.categoryCode, input.categoryLabel].filter(Boolean).join(" "));
  if (!text) return undefined;

  // Explicit exclusions win over loose apparel words.
  if (/(shoe|sneaker|boot|sandal|heel|loafer|trainer|footwear|παπουτσ|υποδημ|τσαντ|bag|handbag|backpack|belt|ζων|hat|καπελ|jewel|κοσμη|watch|ρολο|beauty|makeup|καλλυν|lipstick|nail|αρωμ|fragrance|swimwear|μαγιο|lingerie|εσωρουχ)/u.test(text)) return undefined;

  if (/(dress|gown|jumpsuit|romper|overall|one piece|one-piece|φορεμ|ολοσωμ)/u.test(text)) return "one-pieces";
  if (/(trouser|pants|jeans|denim|shorts|skirt|legging|jogger|παντελον|τζιν|σορτ|φουστ|κολαν)/u.test(text)) return "bottoms";
  if (/(shirt|t shirt|t-shirt|tee|blouse|top|sweater|sweatshirt|hoodie|cardigan|jacket|coat|blazer|vest|polo|πουκαμισ|μπλουζ|τοπ|φουτερ|ζακετ|σακακ|μπουφαν|παλτο|γιλεκ)/u.test(text)) return "tops";
  return undefined;
}

export function virtualTryOnCacheKey(input: Readonly<{
  userId: string;
  profileVersion: number;
  canonicalVariantId: string;
  garmentFingerprint: string;
  category: VirtualTryOnCategory;
  modelVersion?: string;
}>): string {
  const modelVersion = input.modelVersion?.trim() || TRYON_MODEL_VERSION;
  return createHash("sha256")
    .update([
      "konta-mou-vton",
      input.userId.trim(),
      String(input.profileVersion),
      input.canonicalVariantId.trim(),
      input.garmentFingerprint.trim(),
      input.category,
      modelVersion
    ].join("\n"))
    .digest("hex");
}

export function privateTryOnUserKey(userId: string): string {
  return createHash("sha256").update(`konta-mou-tryon-user\n${userId.trim()}`).digest("hex").slice(0, 32);
}
