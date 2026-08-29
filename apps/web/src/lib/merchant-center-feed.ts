export type MerchantCenterAvailability = "in_stock" | "out_of_stock" | "preorder" | "backorder";

export type MerchantCenterFeedProduct = Readonly<{
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  priceMinor: number;
  availability: MerchantCenterAvailability;
  brand?: string;
  gtin?: string;
  mpn?: string;
  productType?: string;
}>;

export type MerchantCenterFeedInput = Readonly<{
  title: string;
  link: string;
  description: string;
  products: readonly MerchantCenterFeedProduct[];
}>;

const INVALID_XML_10_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu;
const GOOGLE_GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function cleanXmlText(value: string): string {
  return value.replace(INVALID_XML_10_CONTROL, "").trim();
}

function truncateCodePoints(value: string, max: number): string {
  const points = Array.from(cleanXmlText(value));
  return points.length <= max ? points.join("") : points.slice(0, max).join("").trimEnd();
}

export function escapeMerchantCenterXml(value: string): string {
  return cleanXmlText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Merchant Center requires GTINs to have a valid supported length and check digit.
 * Bad supplier/import identifiers are omitted rather than exported as authoritative
 * product identity.
 */
export function validMerchantCenterGtin(raw: string | undefined): string | undefined {
  const gtin = raw?.trim();
  if (!gtin || !/^\d+$/u.test(gtin) || !GOOGLE_GTIN_LENGTHS.has(gtin.length)) return undefined;
  const digits = [...gtin].map(Number);
  const checkDigit = digits.pop();
  if (checkDigit === undefined) return undefined;
  let sum = 0;
  for (let index = digits.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === checkDigit ? gtin : undefined;
}

function optionalTag(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? `      <${name}>${escapeMerchantCenterXml(normalized)}</${name}>\n` : "";
}

function productXml(product: MerchantCenterFeedProduct): string {
  const gtin = validMerchantCenterGtin(product.gtin);
  const title = truncateCodePoints(product.title, 150);
  const description = truncateCodePoints(product.description, 5_000);
  const price = Number.isSafeInteger(product.priceMinor) && product.priceMinor > 0
    ? `${(product.priceMinor / 100).toFixed(2)} EUR`
    : "";
  if (!product.id.trim() || !title || !description || !product.link.trim() || !product.imageLink.trim() || !price) {
    throw new Error(`Merchant Center feed product ${product.id || "<missing-id>"} is missing a required field`);
  }

  return [
    "    <item>",
    `      <g:id>${escapeMerchantCenterXml(product.id)}</g:id>`,
    `      <title>${escapeMerchantCenterXml(title)}</title>`,
    `      <link>${escapeMerchantCenterXml(product.link)}</link>`,
    `      <description>${escapeMerchantCenterXml(description)}</description>`,
    `      <g:image_link>${escapeMerchantCenterXml(product.imageLink)}</g:image_link>`,
    `      <g:availability>${product.availability}</g:availability>`,
    `      <g:price>${price}</g:price>`,
    "      <g:condition>new</g:condition>",
    optionalTag("g:brand", product.brand).trimEnd(),
    gtin ? `      <g:gtin>${gtin}</g:gtin>` : "",
    optionalTag("g:mpn", product.mpn).trimEnd(),
    optionalTag("g:product_type", product.productType).trimEnd(),
    "    </item>"
  ].filter(Boolean).join("\n");
}

/**
 * Google Merchant Center RSS 2.0 primary product data source.
 * Keep this builder pure: commerce admission, price selection and index governance
 * happen before products reach it.
 */
export function buildMerchantCenterRss(input: MerchantCenterFeedInput): string {
  const channelTitle = truncateCodePoints(input.title, 200);
  const channelDescription = truncateCodePoints(input.description, 500);
  if (!channelTitle || !input.link.trim() || !channelDescription) throw new Error("Merchant Center feed channel metadata is incomplete");

  const items = [...input.products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(productXml)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${escapeMerchantCenterXml(channelTitle)}</title>\n    <link>${escapeMerchantCenterXml(input.link)}</link>\n    <description>${escapeMerchantCenterXml(channelDescription)}</description>\n${items ? `${items}\n` : ""}  </channel>\n</rss>\n`;
}
