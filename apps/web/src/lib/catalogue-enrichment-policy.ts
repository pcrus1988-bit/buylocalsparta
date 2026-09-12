import {
  validateCatalogueEnrichmentDraft,
  type BazaarPresentationOverlay,
  type CatalogueEnrichmentDraft,
  type VerifiedProductFacts
} from "./catalogue-enrichment";
import type { CatalogueResearchFact } from "./catalogue-enrichment-research-openai";

export type EvidenceCoverageReport = Readonly<{
  availableSignals: readonly string[];
  coveredSignals: readonly string[];
  missingSignals: readonly string[];
  requiredCoverage: number;
  shortRequiredCoverage: number;
  shortCoveredSignals: readonly string[];
  firstParagraphCoveredSignals: readonly string[];
  score: number;
  passed: boolean;
}>;

export type CatalogueDraftValidationInput = Readonly<{
  facts: VerifiedProductFacts;
  draft: CatalogueEnrichmentDraft;
  sourceTitle: string | null;
  sourceDescription: string | null;
  bazaar: BazaarPresentationOverlay;
  researchFacts?: readonly CatalogueResearchFact[];
}>;

type EvidenceSignal = Readonly<{
  key: string;
  label: string;
  aliases: readonly string[];
  requiredNumber?: string;
  requiredMaterial?: string;
}>;

const INTERNAL_TERMS = [
  "nova","brandsgateway","dropship","dropshipping","externalproductid","external product id",
  "externalvariantid","external variant id","supplier sku","supplier id","api id",
  "προμηθευτή","προμηθευτης","προμηθευτής"
];

const OPERATIONAL_TERMS = [
  "σε απόθεμα","διαθέσιμο τώρα","άμεσα διαθέσιμο","δωρεάν αποστολή","δωρεάν μεταφορικά",
  "χρόνος παράδοσης","παράδοση σε","shipping","delivery","in stock","out of stock","discount","έκπτωση",
  "λιανική τιμή","τιμή πώλησης"
];

const GENERIC_COPY_PATTERNS = [
  "σύγχρονη πρόταση",
  "καθαρή σχεδιαστική γραμμή",
  "καθαρές γραμμές",
  "σύγχρονη εκδοχή του συγκεκριμένου κομματιού",
  "λειτουργεί φυσικά τόσο σε καθημερινά όσο και σε πιο προσεγμένα σύνολα",
  "λειτουργεί ως ολοκληρωμένο στοιχείο",
  "μια προσεγμένη επιλογή",
  "χαρακτηριστική πρόταση",
  "η συγκεκριμένη εκδοχή ανήκει",
  "πρόκειται για γυναικεία επιλογή",
  "πρόκειται για ανδρική επιλογή",
  "εύκολη μετάβαση από το πρωί",
  "ταιριάζει σε κάθε περίσταση",
  "versatile wardrobe",
  "timeless essential"
];

const MATERIAL_ALIASES: Readonly<Record<string,readonly string[]>> = Object.freeze({
  cotton: ["cotton","βαμβακ"], polyester: ["polyester","πολυεστ"], viscose: ["viscose","βισκόζ","βισκοζ"],
  elastane: ["elastane","ελαστάν","ελασταν"], nylon: ["nylon","νάιλον","ναιλον"], polyamide: ["polyamide","πολυαμίδ","πολυαμιδ"],
  silk: ["silk","μετάξ","μεταξ"], wool: ["wool","μαλλ"], cashmere: ["cashmere","κασμίρ","κασμιρ"],
  leather: ["leather","δέρμα","δερμα"], acetate: ["acetate","οξική","οξικ"], plastic: ["plastic","πλαστικ"],
  metal: ["metal","μεταλλ"], rubber: ["rubber","καουτσούκ","καουτσουκ"], linen: ["linen","λινό","λινο"]
});

const KEYWORD_SIGNALS: readonly Readonly<{ key:string; source:RegExp; aliases:readonly string[] }>[] = [
  { key:"fit:oversize",source:/\b(?:oversize|oversized)\b/i,aliases:["oversize","φαρδιά γραμ","χαλαρή γραμ","χαλαρη γραμ"] },
  { key:"fit:slim",source:/\bslim(?:[- ]fit)?\b/i,aliases:["slim","στενή γραμ","στενη γραμ","εφαρμοστ"] },
  { key:"fit:regular",source:/\bregular fit\b/i,aliases:["regular fit","κανονική γραμ","κανονικη γραμ"] },
  { key:"fit:tailored",source:/\btailored (?:cut|fit)|\btailored\b/i,aliases:["tailored","ραμμένη γραμ","ραμμενη γραμ","ραπτική γραμ","ραπτικη γραμ"] },
  { key:"cut:tapered",source:/\btapered\b/i,aliases:["tapered","κωνική γραμ","κωνικη γραμ"] },
  { key:"cut:straight",source:/\bstraight[- ]leg|\bstraight leg\b/i,aliases:["straight leg","ίσια γραμ","ισια γραμ"] },
  { key:"fit:relaxed",source:/\brelaxed fit\b/i,aliases:["relaxed fit","χαλαρή γραμ","χαλαρη γραμ"] },
  { key:"neck:crew",source:/\bcrew ?neck\b/i,aliases:["crewneck","crew neck","στρογγυλή λαιμόκοψη","στρογγυλη λαιμοκοψη"] },
  { key:"neck:mock",source:/\bmock neck\b/i,aliases:["mock neck","ψηλός λαιμός","ψηλος λαιμος"] },
  { key:"collar:camp",source:/\bcamp collar\b/i,aliases:["camp collar","camp γιακά","camp γιακα"] },
  { key:"collar:lapel",source:/\blapels?\b|\blapel collar\b/i,aliases:["lapel","πέτο","πετο"] },
  { key:"closure:two-button",source:/\b(?:two|2)[- ]button (?:closure|fastening)\b/i,aliases:["two button","2 button","δύο κουμπ","δυο κουμπ"] },
  { key:"closure:zip",source:/\bzip(?:per)? (?:closure|fastening)|\bzip closure\b/i,aliases:["zip","φερμουάρ","φερμουαρ"] },
  { key:"closure:snap",source:/\bsnap closure\b/i,aliases:["snap","κουμπί σούστα","κουμπι σουστα"] },
  { key:"closure:magnet",source:/\bmagnet(?:ic)? closure\b/i,aliases:["magnetic","magnet","μαγνητικό κλείσιμο","μαγνητικο κλεισιμο"] },
  { key:"closure:buckle",source:/\bbuckle\b/i,aliases:["buckle","αγκράφα","αγκραφα"] },
  { key:"closure:lace-up",source:/\blace[- ]up\b/i,aliases:["lace up","κορδόν","κορδον"] },
  { key:"pocket:chest",source:/\bchest pocket\b/i,aliases:["chest pocket","τσέπη στο στήθος","τσεπη στο στηθος"] },
  { key:"pocket:welt",source:/\bwelt pockets?\b/i,aliases:["welt pocket","φιλέτο","φιλετο"] },
  { key:"pocket:internal",source:/\b(?:internal|interior) pockets?\b/i,aliases:["internal pocket","interior pocket","εσωτερική τσέπη","εσωτερικη τσεπη"] },
  { key:"construction:compartments",source:/\b(?:two|three|\d+) compartments?\b/i,aliases:["compartment","διαμέρισμ","διαμερισμ"] },
  { key:"eyewear:uv400",source:/\buv\s*400\b/i,aliases:["uv400","uv 400"] },
  { key:"eyewear:polarized",source:/\bpolari[sz]ed\b/i,aliases:["polarized","polarised","πολωτικ"] },
  { key:"eyewear:mirrored",source:/\bmirrored\b/i,aliases:["mirrored","καθρεφτ"] },
  { key:"eyewear:gradient",source:/\bgradient\b/i,aliases:["gradient","ντεγκραντέ","ντεγκραντε"] },
  { key:"eyewear:photochromic",source:/\bphotochrom(?:atic|ic)\b/i,aliases:["photochrom","φωτοχρωμ"] },
  { key:"eyewear:full-rim",source:/\bfull[- ]rim\b/i,aliases:["full rim","πλήρες πλαίσιο","πληρες πλαισιο"] },
  { key:"shape:square",source:/\bstyle\s*:?[\s\n]*square\b|\bsquare (?:frame|sunglasses|glasses)\b/i,aliases:["square","τετράγων","τετραγων"] },
  { key:"shape:aviator",source:/\baviator\b/i,aliases:["aviator","πιλότου","πιλοτου"] },
  { key:"shape:cat-eye",source:/\bcat ?eye\b/i,aliases:["cat eye","cat-eye","γατίσι","γατισ"] },
  { key:"shape:panto",source:/\bpanto\b/i,aliases:["panto"] },
  { key:"eyewear:spring-hinge",source:/\bspring hinge\s*:?[\s\n]*yes\b/i,aliases:["spring hinge","ελατηριωτ"] },
  { key:"included:branded-case",source:/\bbranded case\b/i,aliases:["branded case","επώνυμη θήκη","επωνυμη θηκη","θήκη","θηκη"] },
  { key:"print:graphic",source:/\bgraphic (?:print|motif)|\bfront graphic\b/i,aliases:["graphic","γραφικό","γραφικο"] },
  { key:"print:floral",source:/\bfloral (?:print|pattern)|\bfloral\b/i,aliases:["floral","λουλουδ","ανθ floral"] },
  { key:"print:herringbone",source:/\bherringbone\b/i,aliases:["herringbone","ψαροκόκαλο","ψαροκοκαλο"] },
  { key:"print:polka-dots",source:/\bpolka dots?\b/i,aliases:["polka dot","πουά","πουα"] },
  { key:"detail:distressed",source:/\bdistress(?:ed|ing)\b/i,aliases:["distress","φθαρμέν","φθαρμεν"] },
  { key:"detail:faded",source:/\bfaded\b|\bworn[- ]in\b/i,aliases:["faded","worn in","ξεθωριασ","φορεμέν","φορεμεν"] },
  { key:"bag:adjustable-strap",source:/\badjustable (?:shoulder )?strap\b/i,aliases:["adjustable strap","ρυθμιζόμεν","ρυθμιζομεν"] },
  { key:"bag:removable-strap",source:/\bremovable (?:shoulder )?strap\b/i,aliases:["removable strap","αφαιρούμεν","αφαιρουμεν"] },
  { key:"bag:top-handle",source:/\btop handle\b/i,aliases:["top handle","επάνω λαβ","επανω λαβ"] },
  { key:"bag:protective-feet",source:/\bprotective feet\b|\bmetallic feet\b/i,aliases:["protective feet","metallic feet","μεταλλικά ποδαράκια","μεταλλικα ποδαρακια"] },
  { key:"bag:flap",source:/\bfront flap\b|\bflap closure\b/i,aliases:["flap","καπάκι","καπακι"] },
  { key:"shoe:rubber-sole",source:/\brubber sole\b/i,aliases:["rubber sole","σόλα από καουτσούκ","σολα απο καουτσουκ"] },
  { key:"shoe:platform",source:/\bplatform\b/i,aliases:["platform","πλατφόρμ","πλατφορμ"] },
  { key:"shoe:wedge",source:/\bwedge\b/i,aliases:["wedge","σφήνα","σφηνα"] },
  { key:"shoe:studs",source:/\bstuds?\b/i,aliases:["stud","τρούκ","τρυκ"] },
  { key:"shoe:round-toe",source:/\bround toe\b/i,aliases:["round toe","στρογγυλή μύτη","στρογγυλη μυτη"] }
];

/** V4 quality gate: facts may come from supplier evidence or identity-verified web research,
 * but a draft is accepted only when it actually carries the important evidence into Greek copy. */
export function validateLuxuryCatalogueDraft(input: CatalogueDraftValidationInput): readonly string[] {
  const evidence = combinedEvidence(input);
  const sourceNormalized = normalize(evidence);
  const sourceNumbers = new Set(numericTokens(evidence));
  const errors = validateCatalogueEnrichmentDraft(input.facts,input.draft)
    .filter((error) => !evidenceAuthorizesBaseError(error,sourceNormalized,sourceNumbers));
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
  const researchedModel = input.researchFacts?.find((fact) => fact.category === "model" || fact.category === "line")?.value;
  if (!input.facts.model && researchedModel && !includesNormalized(title,researchedModel)) errors.push("title_missing_researched_model");

  const coverage = buildCatalogueEvidenceCoverage(input);
  if (coverage.availableSignals.length >= 6 && description.length < 220) errors.push("description_too_thin_for_rich_evidence");
  else if (coverage.availableSignals.length >= 3 && description.length < 140) errors.push("description_too_thin_for_evidence");
  else if (coverage.availableSignals.length >= 1 && description.length < 80) errors.push("description_too_thin_for_evidence");
  if (description.length > 1800) errors.push("description_too_long");
  if (short.length > 280) errors.push("short_description_too_long");

  for (const pattern of GENERIC_COPY_PATTERNS) {
    if (lowered.includes(normalize(pattern))) errors.push(`generic_copy:${pattern}`);
  }

  if (!coverage.passed) errors.push(`evidence_coverage:${coverage.coveredSignals.length}/${coverage.requiredCoverage}`);
  if (coverage.shortCoveredSignals.length < coverage.shortRequiredCoverage) {
    errors.push(`short_evidence_coverage:${coverage.shortCoveredSignals.length}/${coverage.shortRequiredCoverage}`);
  }
  if (coverage.availableSignals.length >= 2 && coverage.firstParagraphCoveredSignals.length === 0) {
    errors.push("important_evidence_missing_from_opening");
  }

  if (/<\/?[a-z][^>]*>/i.test(generated)) errors.push("html_not_allowed");
  if (/https?:\/\/|www\./i.test(generated)) errors.push("url_not_allowed");
  if (/```|^\s*[-*•]\s+/m.test(generated)) errors.push("markdown_not_allowed");
  if (/\p{Extended_Pictographic}/u.test(generated)) errors.push("emoji_not_allowed");
  for (const term of INTERNAL_TERMS) if (lowered.includes(normalize(term))) errors.push(`internal_term:${term}`);
  for (const term of OPERATIONAL_TERMS) if (lowered.includes(normalize(term))) errors.push(`operational_claim:${term}`);
  if (generated.includes("€")) errors.push("price_symbol_not_allowed");
  if (!/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊΐϋΰ]/u.test([short,description].join(" "))) errors.push("greek_copy_missing");

  if (input.bazaar.commerceChannel === "bazaar" && input.bazaar.supplierCondition) {
    const bazaarDisclosure = ["bazaar","preloved","pre-loved","preowned","pre-owned","μεταχειρισ","προϊδιόκτη","δεύτερο χέρι","δεύτερης ζωής","κατάσταση"]
      .some((term) => lowered.includes(normalize(term)));
    if (!bazaarDisclosure) errors.push("bazaar_condition_not_disclosed");
  }
  return [...new Set(errors)];
}

export function buildCatalogueEvidenceCoverage(input: CatalogueDraftValidationInput): EvidenceCoverageReport {
  const signals = extractEvidenceSignals(combinedEvidence(input));
  const generated = [input.draft.titleEl,input.draft.shortDescriptionEl,input.draft.descriptionEl].filter(Boolean).join(" ");
  const short = input.draft.shortDescriptionEl ?? "";
  const opening = (input.draft.descriptionEl ?? "").slice(0,220);
  const covered = signals.filter((signal) => signalCovered(signal,generated));
  const shortCovered = signals.filter((signal) => signalCovered(signal,short));
  const openingCovered = signals.filter((signal) => signalCovered(signal,opening));
  const requiredCoverage = signals.length >= 6 ? 4 : signals.length >= 3 ? 2 : signals.length >= 1 ? 1 : 0;
  const shortRequiredCoverage = signals.length >= 3 ? 2 : signals.length >= 1 ? 1 : 0;
  const score = signals.length ? Math.round((covered.length / signals.length) * 100) : 100;
  return {
    availableSignals: signals.map((signal) => signal.label),
    coveredSignals: covered.map((signal) => signal.label),
    missingSignals: signals.filter((signal) => !covered.includes(signal)).map((signal) => signal.label),
    requiredCoverage,
    shortRequiredCoverage,
    shortCoveredSignals: shortCovered.map((signal) => signal.label),
    firstParagraphCoveredSignals: openingCovered.map((signal) => signal.label),
    score,
    passed: covered.length >= requiredCoverage && shortCovered.length >= shortRequiredCoverage && (signals.length < 2 || openingCovered.length >= 1)
  };
}

export function sanitizeSupplierEvidenceText(value: unknown,maxLength = 6000): string | null {
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

function combinedEvidence(input: CatalogueDraftValidationInput): string {
  return [input.sourceTitle,input.sourceDescription,...(input.researchFacts ?? []).map((fact) => `${fact.category}: ${fact.value}`)]
    .filter(Boolean).join("\n");
}

function extractEvidenceSignals(evidence: string): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const push = (signal: EvidenceSignal) => { if (!signals.some((item) => item.key === signal.key)) signals.push(signal); };
  for (const match of evidence.matchAll(/\b(?:SS|AW|FW|PS|PF)\s?\d{2,4}\b/gi)) {
    const value = match[0].replace(/\s+/g,"").toUpperCase();
    push({ key:`season:${value}`,label:`season ${value}`,aliases:[value] });
  }
  for (const match of evidence.matchAll(/\b(\d{2,3}-\d{2,3}-\d{2,3})\b/g)) {
    push({ key:`size:${match[1]}`,label:`size ${match[1]}`,aliases:[match[1]] });
  }
  for (const match of evidence.matchAll(/(\d+(?:[.,]\d+)?)%\s*(cotton|polyester|viscose|elastane|nylon|polyamide|silk|wool|cashmere|leather|acetate|plastic|metal|rubber|linen)\b/gi)) {
    const number = match[1].replace(",",".");
    const material = match[2].toLowerCase();
    push({ key:`composition:${number}:${material}`,label:`${number}% ${material}`,aliases:MATERIAL_ALIASES[material] ?? [material],requiredNumber:number,requiredMaterial:material });
  }
  for (const definition of KEYWORD_SIGNALS) {
    if (definition.source.test(evidence)) push({ key:definition.key,label:definition.key,aliases:definition.aliases });
  }
  const lensWidth = evidence.match(/lenses? width\s*:?[\s\n]*(\d{2,3})/i);
  if (lensWidth) push({ key:`lens-width:${lensWidth[1]}`,label:`lens width ${lensWidth[1]}`,aliases:[lensWidth[1]],requiredNumber:lensWidth[1] });
  const bridge = evidence.match(/bridge width\s*:?[\s\n]*(\d{2,3})/i);
  if (bridge) push({ key:`bridge:${bridge[1]}`,label:`bridge ${bridge[1]}`,aliases:[bridge[1]],requiredNumber:bridge[1] });
  const temples = evidence.match(/temples? length\s*:?[\s\n]*(\d{2,3})/i);
  if (temples) push({ key:`temple:${temples[1]}`,label:`temple ${temples[1]}`,aliases:[temples[1]],requiredNumber:temples[1] });
  const modelCode = evidence.match(/\b([A-Z]{2,}[A-Z0-9-]*\d{2,}[A-Z0-9-]*)\b/);
  if (modelCode && !/^(?:SS|AW|FW|UV)\d/i.test(modelCode[1])) {
    push({ key:`model-code:${modelCode[1]}`,label:`model ${modelCode[1]}`,aliases:[modelCode[1]] });
  }
  return signals.slice(0,18);
}

function signalCovered(signal: EvidenceSignal,generated: string): boolean {
  const normalized = normalize(generated);
  if (signal.requiredNumber && !numericTokens(generated).includes(signal.requiredNumber)) return false;
  if (signal.requiredMaterial) {
    const aliases = MATERIAL_ALIASES[signal.requiredMaterial] ?? [signal.requiredMaterial];
    return aliases.some((alias) => normalized.includes(normalize(alias)));
  }
  return signal.aliases.some((alias) => normalized.includes(normalize(alias)));
}

function evidenceAuthorizesBaseError(error: string,evidenceNormalized: string,evidenceNumbers: ReadonlySet<string>): boolean {
  if (error.startsWith("unsupported_number:")) return evidenceNumbers.has(error.slice("unsupported_number:".length));
  if (error.startsWith("unsupported_material:")) {
    const material = error.slice("unsupported_material:".length);
    return Boolean(material) && evidenceNormalized.includes(normalize(material));
  }
  return false;
}

function includesNormalized(haystack: string,needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function numericTokens(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)?/g)?.map((token) => token.replace(",",".")) ?? [];
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("el-GR").replace(/[\s_-]+/g," ").trim();
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,digits: string) => {
      const code = Number(digits);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    });
}
