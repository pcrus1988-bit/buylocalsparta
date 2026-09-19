export function resolveSymphonyaCategoryCode(payloadValue: unknown, sourceTitle = ""): string | null {
  const payload = record(payloadValue);
  const details = record(payload.categoryDetails);
  const cat = normalize(optionalText(details.cat) ?? "");
  const scat = normalize(optionalText(details.scat) ?? "");
  const sscat = normalize(optionalText(details.sscat) ?? "");
  const title = normalize(sourceTitle);
  const evidence = `${cat} ${scat} ${sscat} ${title}`;

  if (cat === "fragrance") return "fragrance";
  if (cat === "room scents") return "candles-home-fragrance";

  if (cat === "makeup") {
    if (scat === "lips") return "lip-makeup";
    if (scat === "eyes" || scat === "eyebrows") return "eye-makeup";
    if (scat === "nails") return "nail-care-colour";
    if (scat === "face" || scat === "cheeks") return "face-makeup";
    if (scat.includes("brush") || scat.includes("applicator") || scat === "tools & accessories") return "beauty-tools-accessories";
    return null;
  }

  if (cat === "skin") {
    if (scat.includes("cleansing") || scat.includes("exfoliating")) return "facial-cleansers";
    if (scat.includes("face shaving")) return "grooming-care";
    if (containsAny(evidence, ["sun care", "sunscreen", "spf"])) return "sun-care";
    if (containsAny(evidence, ["serum", "treatment", "mask", "eye care", "toning", "calming"])) return "serums-treatments";
    if (containsAny(evidence, ["cream", "lotion", "gel", "emulsion", "balm", "moistur"])) return "face-moisturisers";
    return "serums-treatments";
  }

  if (cat === "hair") {
    if (scat === "hair accessories") return "hair-accessories";
    if (scat === "hair styling") return "hair-styling-products";
    if (scat === "hair colouring") return "hair-treatments";
    if (scat === "beard grooming") return "grooming-care";
    if (scat === "hairdressing tools" || scat === "electrical" || scat === "salon supplies") return "beauty-tools-accessories";
    if (containsAny(evidence, ["shampoo", "conditioner"])) return "shampoo-conditioner";
    if (scat === "hair care" || scat === "hair care sets") return "hair-treatments";
    return null;
  }

  if (cat === "body") {
    if (scat === "sun & tan" || containsAny(evidence, ["sunscreen", "sun protection", "spf"])) return "sun-care";
    if (containsAny(evidence, ["shaving", "beard", "after-shave", "aftershave"])) return "grooming-care";
    return "bath-body-care";
  }

  if (cat === "fashion") {
    const gender = normalize(optionalText(record(payload.gender).name) ?? "");
    if (scat === "fashion accessories" && containsAny(evidence, ["sunglasses", "sun glasses"])) return "sunglasses";
    if (scat === "fashion accessories" && containsAny(evidence, ["wallet", "cardholder", "card holder"])) return "wallets-cardholders";
    if (scat === "bags & backpacks") {
      if (containsAny(evidence, ["backpack", "rucksack"])) return "backpacks";
      if (gender === "male" || gender === "men" || gender === "for men") return "mens-bags";
      if (gender === "female" || gender === "women" || gender === "for women") return "handbags";
      return "unisex-bags";
    }
  }

  if (cat === "home" && scat === "kitchen" && containsAny(evidence, ["glass", "goblet", "tumbler"])) {
    return "tableware-glassware";
  }

  if (cat === "toys" && containsAny(evidence, ["construction set", "building set", "building blocks"])) {
    return "construction-toys";
  }

  if (containsAny(evidence, ["perfume", "eau de parfum", "eau de toilette", "parfum"])) return "fragrance";
  return null;
}

function containsAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[_/\\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
