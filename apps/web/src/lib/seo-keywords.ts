import type { SeoEntityReference } from "./seo-entity-policy";

export const SEO_META_KEYWORD_LIMIT = 12;

const MARKET_CORE = [
  "ΚΟΝΤΑ ΜΟΥ",
  "KONTA MOU",
  "τοπική αγορά Σπάρτη",
  "local marketplace Sparta Greece"
] as const;

const STATIC_SEARCH_INTENTS: Readonly<Record<string, readonly string[]>> = {
  "/": [
    "αγορές στη Σπάρτη",
    "προϊόντα Σπάρτη",
    "καταστήματα Σπάρτη",
    "τοπικές επιχειρήσεις Λακωνία",
    "online shop Σπάρτη",
    "αγορά προϊόντων online Σπάρτη",
    "πού θα βρω προϊόντα στη Σπάρτη",
    "πού να αγοράσω στη Σπάρτη"
  ],
  "/shop": [
    "προϊόντα Σπάρτη",
    "αγορά προϊόντων online",
    "τοπικά προϊόντα Σπάρτη",
    "online κατάστημα Σπάρτη",
    "διαθέσιμα προϊόντα Λακωνία",
    "buy local Sparta"
  ],
  "/shops": [
    "καταστήματα Σπάρτη",
    "τοπικές επιχειρήσεις Σπάρτη",
    "εμπορικά καταστήματα Λακωνία",
    "επιχειρήσεις κοντά μου Σπάρτη",
    "shops in Sparta Greece"
  ],
  "/shops/map": [
    "χάρτης καταστημάτων Σπάρτη",
    "καταστήματα κοντά μου",
    "τοπικές επιχειρήσεις Λακωνία",
    "shopping map Sparta Greece"
  ],
  "/advice": [
    "συμβουλή αγοράς Σπάρτη",
    "τοπικός επαγγελματίας Σπάρτη",
    "βοήθεια επιλογής προϊόντος",
    "human shopping advice Greece"
  ],
  "/ask-local": [
    "Ask Local Σπάρτη",
    "βρες προϊόν Σπάρτη",
    "αναζήτηση προϊόντος τοπικά",
    "ρώτησε τοπικό κατάστημα",
    "local product search Greece"
  ],
  "/gift-cards": [
    "δωροκάρτα Σπάρτη",
    "δώρο από τοπικά καταστήματα",
    "gift card Sparta Greece",
    "τοπική αγορά Λακωνία"
  ],
  "/how-it-works": [
    "πώς λειτουργεί το ΚΟΝΤΑ ΜΟΥ",
    "αγορά από τοπικά καταστήματα",
    "ένα checkout πολλά καταστήματα",
    "local marketplace Greece"
  ],
  "/fairness": [
    "δίκαιη προβολή καταστημάτων",
    "δίκαιη ανάθεση παραγγελιών",
    "fair local marketplace",
    "τοπικό εμπόριο Σπάρτη"
  ],
  "/delivery-pickup": [
    "τοπική παράδοση Σπάρτη",
    "παραλαβή από κατάστημα Σπάρτη",
    "αποστολή προϊόντων Λακωνία",
    "local delivery Sparta Greece"
  ],
  "/payments-security": [
    "ασφαλείς online πληρωμές",
    "ασφάλεια αγορών marketplace",
    "ενιαίο checkout καταστημάτων",
    "secure local shopping Greece"
  ],
  "/returns-refunds": [
    "επιστροφές προϊόντων",
    "επιστροφή χρημάτων online αγορά",
    "αλλαγή προϊόντος Σπάρτη",
    "marketplace refunds Greece"
  ],
  "/privacy-controls": [
    "ρυθμίσεις ιδιωτικότητας",
    "έλεγχος προσωπικών δεδομένων",
    "privacy controls marketplace",
    "δικαιώματα δεδομένων Ελλάδα"
  ],
  "/privacy": [
    "πολιτική απορρήτου ΚΟΝΤΑ ΜΟΥ",
    "προστασία προσωπικών δεδομένων",
    "GDPR marketplace Greece",
    "ιδιωτικότητα online αγορών"
  ],
  "/cookies": [
    "πολιτική cookies ΚΟΝΤΑ ΜΟΥ",
    "συγκατάθεση cookies",
    "cookie settings marketplace",
    "privacy online αγορών"
  ],
  "/accessibility": [
    "προσβασιμότητα ηλεκτρονικού εμπορίου",
    "WCAG 2.2 AA Ελλάδα",
    "προσβάσιμες online αγορές",
    "accessible marketplace Greece"
  ],
  "/about": [
    "ΚΟΝΤΑ ΜΟΥ πλατφόρμα",
    "ψηφιακή τοπική αγορά",
    "marketplace μικρών επιχειρήσεων",
    "local commerce platform Greece",
    "ηλεκτρονικό εμπόριο Λακωνία"
  ],
  "/help": [
    "βοήθεια ΚΟΝΤΑ ΜΟΥ",
    "υποστήριξη online αγορών",
    "βοήθεια παραγγελίας Σπάρτη",
    "marketplace customer support Greece"
  ],
  "/join": [
    "marketplace για καταστήματα",
    "e-shop για μικρές επιχειρήσεις",
    "online πωλήσεις Ελλάδα",
    "ψηφιακό κατάστημα Ελλάδα",
    "local commerce platform Greece"
  ],
  "/join/requirements": [
    "προϋποθέσεις συνεργασίας ΚΟΝΤΑ ΜΟΥ",
    "ένταξη καταστήματος σε marketplace",
    "ψηφιακή ετοιμότητα καταστήματος",
    "merchant onboarding Greece"
  ],
  "/sitemap": [
    "χάρτης ιστοτόπου ΚΟΝΤΑ ΜΟΥ",
    "σελίδες ΚΟΝΤΑ ΜΟΥ",
    "προϊόντα και καταστήματα Σπάρτη",
    "KONTA MOU site map"
  ]
};

const ENTITY_SEARCH_INTENTS: Readonly<Record<Exclude<SeoEntityReference["kind"], "static">, readonly string[]>> = {
  category: ["κατηγορία προϊόντων Σπάρτη", "τοπικά προϊόντα Λακωνία", "buy local Sparta"],
  product: ["αγορά προϊόντος Σπάρτη", "τοπική διαθεσιμότητα προϊόντος", "προϊόντα Λακωνία"],
  partner_vendor: ["κατάστημα Σπάρτη", "τοπική επιχείρηση Σπάρτη", "shops in Sparta Greece"],
  research_vendor: ["επιχείρηση Σπάρτη", "τοπικό κατάστημα Λακωνία", "business in Sparta Greece"]
};

function normalizedPhrase(value: string | undefined): string | undefined {
  const phrase = value?.replace(/[\n\r,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!phrase || phrase.length < 2 || /[<>]/.test(phrase)) return undefined;
  if (phrase.length <= 80) return phrase;
  const candidate = phrase.slice(0, 81);
  const boundary = candidate.lastIndexOf(" ");
  return (boundary >= 48 ? candidate.slice(0, boundary) : phrase.slice(0, 80)).trim();
}

/**
 * Meta-keyword tags are a secondary discovery hint only: Google explicitly does
 * not use them for ranking. Keep them concise, truthful and aligned with the same
 * regional/entity intent already present in visible copy, titles and descriptions.
 */
export function seoMetaKeywords(input: {
  reference: SeoEntityReference;
  contextual?: readonly (string | undefined)[];
}): string[] {
  const family = input.reference.kind === "static"
    ? STATIC_SEARCH_INTENTS[input.reference.id] ?? []
    : ENTITY_SEARCH_INTENTS[input.reference.kind];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...MARKET_CORE, ...(input.contextual ?? []), ...family]) {
    const phrase = normalizedPhrase(raw);
    if (!phrase) continue;
    const key = phrase.toLocaleLowerCase("el-GR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(phrase);
    if (result.length === SEO_META_KEYWORD_LIMIT) break;
  }
  return result;
}
