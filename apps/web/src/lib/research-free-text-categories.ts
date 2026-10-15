/** Read-only, explainable thematic tags for Greek retailer open-text answers.
 * Tags are exploratory filters, NOT survey codes or official statistical results.
 * Multi-label by design; unmatched answers are retained under "other".
 * Patterns operate on de-accented lowercase Greek/Latin text in JS and SQL.
 */
export const RESEARCH_FREE_TEXT_CATEGORIES = [
  { key: "costs", label: "Κόστος λειτουργίας / φορολογία", pattern: "κοστ|εξοδ|ενοικ|μισθωμ|ενεργει|ρευμα|ηλεκτρικ|φορο|φπα|εισφορ|τελ(η|ος)|ακριβει|τιμολογ" },
  { key: "bureaucracy", label: "Γραφειοκρατία / θεσμικό πλαίσιο", pattern: "γραφειοκρατ|δημοσι|κρατικ|νομοθε|νομοσχε|ρυθμισ|αδειοδο|ελεγκτικ|διαδικασι|κανονισμ|υπηρεσι(ε|α)" },
  { key: "demand", label: "Πελάτες / ζήτηση / αγοραστική δύναμη", pattern: "πελατ|καταναλωτ|αγοραστικ|ζητησ|πωλησ|τζιρ|αγορεσ|πληθωρισμ|εισοδημ|κινησ(η|ης)|εμπορικ(η|ο) κινησ" },
  { key: "staff", label: "Προσωπικό / ανθρώπινο δυναμικό", pattern: "προσωπικ|υπαλληλ|εργαζομεν|εργατικ|προσληψ|στελεχ|ανθρωπιν(ο|ου) δυναμικ|εκπαιδευσ|μισθοδοσ" },
  { key: "competition", label: "Ανταγωνισμός / μεγάλες πλατφόρμες", pattern: "ανταγωνισμ|πολυεθνικ|μεγαλ(ε|η) αλυσιδ|αλυσιδ(ε|ω)ν|skroutz|amazon|temu|shein|marketplace|πλατφορμ" },
  { key: "digital", label: "Ψηφιακό εμπόριο / προβολή", pattern: "ψηφιακ|ηλεκτρονικ|e-?shop|online|internet|ιστοσελιδ|τεχνολογ|διαδικτυ|διαφημισ|προβολ|social|marketing|seo|eshop" },
  { key: "logistics", label: "Προμηθευτές / αποθήκη / μεταφορές", pattern: "προμηθευτ|εφοδιασ|αποθεμ|αποθηκ|μεταφορ|αποστολ|courier|logistics|παραδοσ|διανομ|εμπορευμα|τροφοδοσ" },
  { key: "infrastructure", label: "Τοπικές υποδομές / προσβασιμότητα", pattern: "parking|παρκινγκ|σταθμευσ|πεζοδρομ|δρομ(ο|ων)|συγκοινων|προσβασιμ|κυκλοφορι|τοπικ(η|ης) αγορ|αστικ(ο|ου) κεντρ" },
  { key: "finance", label: "Ρευστότητα / χρηματοδότηση / πληρωμές", pattern: "ρευστοτ|χρηματοδοτ|κεφαλαι|τραπεζ|δανει|πιστωσ|πιστωτικ|επιταγ|πληρωμ|οφειλ|χρε(ο|ω)σ|pos" }
] as const;

export type ResearchFreeTextCategory = typeof RESEARCH_FREE_TEXT_CATEGORIES[number]["key"] | "other";
export const RESEARCH_FREE_TEXT_OTHER = { key: "other", label: "Λοιπά / χωρίς αυτόματη αντιστοίχιση" } as const;

export function normalizeResearchFreeText(value: string): string {
  return value.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function categorizeResearchFreeText(value: string): ResearchFreeTextCategory[] {
  const text = normalizeResearchFreeText(value);
  const matches = RESEARCH_FREE_TEXT_CATEGORIES
    .filter(category => new RegExp(category.pattern, "u").test(text))
    .map(category => category.key);
  return matches.length > 0 ? matches : ["other"];
}
