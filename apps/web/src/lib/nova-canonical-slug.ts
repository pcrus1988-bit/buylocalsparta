import { createHash } from "node:crypto";

function readableIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,16) || "id";
}

export function canonicalNovaSlug(
  title: string,
  externalProductId: string,
  externalVariantId: string
): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,64) || "nova-product";
  const product = readableIdentityPart(externalProductId);
  const variant = readableIdentityPart(externalVariantId);
  const identityHash = createHash("sha256")
    .update(JSON.stringify([externalProductId,externalVariantId]),"utf8")
    .digest("hex")
    .slice(0,20);
  return `${base}-${product}-${variant}-${identityHash}`.slice(0,128);
}
