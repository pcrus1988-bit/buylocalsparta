import { createHash } from "node:crypto";

function slugPart(value: string, maxLength: number): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function neutralTitlePart(title: string): string {
  const neutral = slugPart(title, 72)
    .split("-")
    .filter((part) => part !== "symphonya")
    .join("-")
    .replace(/^-+|-+$/g, "");
  return neutral || "product";
}

/**
 * Public product slugs describe the product and never expose the upstream supplier.
 * A short deterministic identity suffix keeps variants collision-safe without
 * changing the canonical product ID used by commerce.
 */
export function canonicalSymphonyaSlug(
  title: string,
  externalProductId: string,
  externalVariantId: string
): string {
  const base = neutralTitlePart(title);
  const product = slugPart(externalProductId, 20) || "product";
  const variant = slugPart(externalVariantId, 20) || "variant";
  const identityHash = createHash("sha256")
    .update(`${externalProductId}\u001f${externalVariantId}`, "utf8")
    .digest("hex")
    .slice(0, 12);

  const parts = variant === product
    ? [base, product, identityHash]
    : [base, product, variant, identityHash];

  return parts.join("-").slice(0, 128);
}
