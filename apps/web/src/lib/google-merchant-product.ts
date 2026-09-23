export type GoogleMerchantCandidate = Readonly<{
  canonicalPublicId: string;
  slug: string;
  title: string;
  description?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  brand?: string | null;
  color?: string | null;
  condition?: string | null;
  priceMinor: number | string;
  contentLanguage?: "el" | "en";
}>;

export type GoogleMerchantProductInput = Readonly<{
  offerId: string;
  contentLanguage: "el" | "en";
  feedLabel: "GR";
  productAttributes: Readonly<{
    title: string;
    description: string;
    link: string;
    imageLink: string;
    availability: "IN_STOCK";
    price: Readonly<{ amountMicros: string; currencyCode: "EUR" }>;
    condition: "NEW" | "USED" | "REFURBISHED";
    brand?: string;
    gtins?: readonly string[];
    mpn?: string;
    color?: string;
  }>;
}>;

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function positiveMinor(value: number | string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error("Google Merchant product price is not an integer minor-unit amount.");
  }
  if (parsed <= 0n) throw new Error("Google Merchant product price must be positive.");
  return parsed;
}

/** Validates the GS1 check digit before we send a GTIN to Google. */
export function validGtin(value: unknown): string | undefined {
  const gtin = String(value ?? "").replace(/\s+/g, "");
  if (![8, 12, 13, 14].includes(gtin.length) || !/^\d+$/.test(gtin)) return undefined;

  // Google rejects restricted/internal circulation and coupon ranges even when
  // their GS1 check digit is mathematically valid.
  if (gtin.startsWith("2") || gtin.startsWith("02") || gtin.startsWith("04")) return undefined;
  if (gtin.startsWith("99") || /^(981|982|983|984)/.test(gtin)) return undefined;
  // GTIN-14 indicator 9 is reserved for variable-measure/bulk trade items and
  // is not valid for the individual retail products KONTA MOY publishes.
  if (gtin.length === 14 && gtin.startsWith("9")) return undefined;

  const body = gtin.slice(0, -1).split("").reverse();
  const sum = body.reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(gtin.at(-1)) ? gtin : undefined;
}

function merchantCondition(value: unknown): "NEW" | "USED" | "REFURBISHED" {
  const normalized = String(value ?? "new").trim().toLowerCase();
  if (normalized === "used") return "USED";
  if (normalized === "refurbished" || normalized === "refurb") return "REFURBISHED";
  return "NEW";
}

function canonicalProductLink(origin: string, candidate: GoogleMerchantCandidate): string {
  const base = new URL(origin);
  const key = cleanText(candidate.slug, 160) || cleanText(candidate.canonicalPublicId, 160);
  if (!key) throw new Error("Google Merchant product route identity is empty.");
  return new URL(`/product/${encodeURIComponent(key)}`, base).toString();
}

export function buildGoogleMerchantProductInput(
  candidate: GoogleMerchantCandidate,
  imageLink: string,
  origin = "https://kontamou.site"
): GoogleMerchantProductInput {
  const offerId = cleanText(candidate.canonicalPublicId, 50);
  if (!offerId) throw new Error("Google Merchant offerId is empty.");

  const title = cleanText(candidate.title, 150);
  if (!title) throw new Error(`Google Merchant product ${offerId} has no title.`);
  const description = cleanText(candidate.description, 5000) || title;
  const image = new URL(imageLink);
  if (image.protocol !== "https:") throw new Error(`Google Merchant product ${offerId} image must use HTTPS.`);

  const brand = cleanText(candidate.brand, 70) || undefined;
  const mpn = cleanText(candidate.mpn, 70) || undefined;
  const color = cleanText(candidate.color, 100) || undefined;
  const gtin = validGtin(candidate.gtin);
  const amountMicros = (positiveMinor(candidate.priceMinor) * 10_000n).toString();

  return {
    offerId,
    contentLanguage: candidate.contentLanguage ?? "el",
    feedLabel: "GR",
    productAttributes: {
      title,
      description,
      link: canonicalProductLink(origin, candidate),
      imageLink: image.toString(),
      availability: "IN_STOCK",
      price: { amountMicros, currencyCode: "EUR" },
      condition: merchantCondition(candidate.condition),
      ...(brand ? { brand } : {}),
      ...(gtin ? { gtins: [gtin] } : {}),
      ...(mpn ? { mpn } : {}),
      ...(color ? { color } : {})
    }
  };
}

/**
 * Merchant API accepts an unpadded RFC 4648 base64url product-input segment.
 * We always encode it so cleanup also remains safe if a future offer id contains
 * Merchant API or URL-reserved characters.
 */
export function googleMerchantProductInputSegment(contentLanguage: string, feedLabel: string, offerId: string): string {
  const raw = `${contentLanguage}~${feedLabel}~${offerId}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}
