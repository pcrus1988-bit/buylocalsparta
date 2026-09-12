import {
  validateCatalogueEnrichmentDraft,
  type BazaarPresentationOverlay,
  type CatalogueEnrichmentDraft,
  type VerifiedProductFacts
} from "./catalogue-enrichment";

export type CatalogueDraftValidationInput = Readonly<{
  facts: VerifiedProductFacts;
  draft: CatalogueEnrichmentDraft;
  sourceTitle: string | null;
  sourceDescription: string | null;
  bazaar: BazaarPresentationOverlay;
}>;

const INTERNAL_TERMS = [
  "nova",
  "brandsgateway",
  "dropship",
  "dropshipping",
  "externalproductid",
  "external product id",
  "externalvariantid",
  "external variant id",
  "supplier sku",
  "supplier id",
  "api id",
  "προμηθευτή",
  "προμηθευτης",
  "προμηθευτής"
];

const OPERATIONAL_TERMS = [
  "σε απόθεμα",
  "διαθέσιμο τώρα",
  "άμεσα διαθέσιμο",
  "δωρεάν αποστολή",
  "δωρεάν μεταφορικά",
  "χρόνος παράδοσης",
  "παράδοση σε",
  "shipping",
  "delivery",
  "in stock",
  "discount",
  "έκπτωση",
  "λιανική τιμή",
  "τιμή πώλησης"
];

/**
 * Second-pass deterministic policy after model generation.
 *
 * The model is a copywriter, never an authority. A draft is accepted only when
 * it survives both the fact-level validator and these merchandising boundaries.
 */
export function validateLuxuryCatalogueDraft(input: CatalogueDraftValidationInput): readonly string[] {
  const errors = [...validateCatalogueEnrichmentDraft(input.facts,input.draft)];
  const title = input.draft.titleEl.trim();
  const short = input.draft.shortDescriptionEl?.trim() ?? "";
  const description = input.draft.descriptionEl?.trim() ?? "";
  const generated = [title,short,description].filter(Boolean).join(" ");
  const lowered = normalize(generated);

  if (title.length < 8) errors.push("title_too_short");
  if (title.length > 140) errors.push("title_too_long");
  if (/\r|\n/.test(title)) errors.push("title_multiline");
  if (/^προϊόν$/i.test(title) || /^product$/i.test(title)) errors.push("generic_title");

  if (input.facts.brand && !includesNormalized(title,input.facts.brand)) errors.push("title_missing_verified_brand");
  if (input.facts.model && !includesNormalized(title,input.facts.model)) errors.push("title_missing_verified_model");

  const sourceRich = (input.sourceDescription?.length ?? 0) >= 80
    || factDensity(input.facts) >= 3;
  if (sourceRich && description.length < 80) errors.push("description_too_thin_for_evidence");
  if (description.length > 1800) errors.push("description_too_long");
  if (short.length > 280) errors.push("short_description_too_long");

  if (/<\/?[a-z][^>]*>/i.test(generated)) errors.push("html_not_allowed");
  if (/https?:\/\/|www\./i.test(generated)) errors.push("url_not_allowed");
  if (/```|^\s*[-*•]\s+/m.test(generated)) errors.push("markdown_not_allowed");
  if (/\p{Extended_Pictographic}/u.test(generated)) errors.push("emoji_not_allowed");

  for (const term of INTERNAL_TERMS) {
    if (lowered.includes(normalize(term))) errors.push(`internal_term:${term}`);
  }
  for (const term of OPERATIONAL_TERMS) {
    if (lowered.includes(normalize(term))) errors.push(`operational_claim:${term}`);
  }
  if (generated.includes("€")) errors.push("price_symbol_not_allowed");

  if (!/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊΐϋΰ]/u.test([short,description].join(" "))) {
    errors.push("greek_copy_missing");
  }

  if (input.bazaar.commerceChannel === "bazaar" && input.bazaar.supplierCondition) {
    const bazaarDisclosure = [
      "bazaar","preloved","pre-loved","preowned","pre-owned",
      "μεταχειρισ","προϊδιόκτη","δεύτερο χέρι","δεύτερης ζωής","κατάσταση"
    ].some((term) => lowered.includes(normalize(term)));
    if (!bazaarDisclosure) errors.push("bazaar_condition_not_disclosed");
  }

  return [...new Set(errors)];
}

export function sanitizeSupplierEvidenceText(value: unknown, maxLength = 6000): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const decoded = decodeBasicEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?\s*>/gi,"\n")
    .replace(/<\/p\s*>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .replace(/[\t\f\v ]+/g," ")
    .replace(/\n\s*\n+/g,"\n")
    .trim();
  return decoded ? decoded.slice(0,maxLength) : null;
}

function factDensity(facts: VerifiedProductFacts): number {
  return [
    facts.brand,
    facts.model,
    facts.productType,
    facts.color,
    facts.materials.length ? "materials" : null,
    Object.keys(facts.dimensions).length ? "dimensions" : null,
    facts.season,
    facts.gender,
    facts.condition,
    facts.features.length ? "features" : null
  ].filter(Boolean).length;
}

function includesNormalized(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("el-GR").replace(/[\s_-]+/g," ").trim();
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,digits: string) => {
      const code = Number(digits);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    });
}
