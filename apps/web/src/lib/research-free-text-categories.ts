/** Read-only, explainable thematic tags for Greek retailer open-text answers.
 * Tags are exploratory, multi-label filters, NOT validated statistical codes or official results.
 * Multi-label by design; unmatched answers are retained under "other".
 * Patterns operate on de-accented lowercase Greek/Latin text in JS and SQL. New thematic codes are additive; historical publications require editorial reapproval.
 */
export const RESEARCH_FREE_TEXT_TAXONOMY_VERSION = "q18-themes-v2.2026-10-24";
export const RESEARCH_FREE_TEXT_CATEGORIES = [
  { key: "costs", label: "Λειτουργικό κόστος / ανατιμήσεις", pattern: "κοστ|εξοδ|δαπαν|ακριβει|ανατιμησ|τιμολογ|παγια|λειτουργικ(ο|α) κοστ|υψηλ(ε|ο) τιμ" },
  { key: "taxes", label: "Φορολογία / εισφορές", pattern: "φορο|φπα|εφορι|ενφια|τεκμηρι|ασφαλιστικ(ε|η|ων) εισφορ|εισφορ|τελων|φορολογ" },
  { key: "energy", label: "Ενέργεια / καύσιμα", pattern: "ενεργει|ρευμ|ηλεκτρικ|κιλοβατ|καυσιμ|θερμανσ|φυσικ(ο|ου) αερι" },
  { key: "rent", label: "Ενοίκια / επαγγελματική στέγη", pattern: "ενοικ|μισθωτηρ|επαγγελματικ(ο|η) χωρ|στεγαστικ|ακινητ|μισθωσ(η|εις)" },
  { key: "bureaucracy", label: "Γραφειοκρατία / νομοθεσία", pattern: "γραφειοκρατ|νομοθε|νομοσχε|ρυθμισ|αδειοδο|ελεγκτικ|κανονισμ|φορε(α|ι) δημοσι|δημοσι(α|εσ) υπηρεσι|δικαιολογητικ|διαδικασι|προσ(τ|τιμ)" },
  { key: "demand", label: "Ζήτηση / αγοραστική δύναμη", pattern: "πελατ|καταναλωτ|αγοραστικ|ζητησ|πωλησ|τζιρ|αγορεσ|πληθωρισμ|εισοδημ|κινησ(η|ης)|εμπορικ(η|ο) κινησ|δουλει(α|εσ) στο μαγαζ" },
  { key: "staff", label: "Προσωπικό / στελέχωση", pattern: "προσωπικ|υπαλληλ|εργαζομεν|εργατικ|προσληψ|στελεχ|ανθρωπιν(ο|ου) δυναμικ|μισθοδοσ|ελλειψ(η|εις) ανθρωπ|εκπαιδευσ(η|εις) προσωπικ" },
  { key: "competition", label: "Ανταγωνισμός / μεγάλες πλατφόρμες", pattern: "ανταγωνισμ|πολυεθνικ|αλυσιδ|skroutz|amazon|temu|shein|marketplace|πλατφορμ|αθεμιτ|αφανι(σ|ζ)|χαμηλ(ο|η) τιμολογ" },
  { key: "digital", label: "Ψηφιακό εμπόριο / προβολή", pattern: "ψηφιακ|ηλεκτρονικ|e-?shop|online|internet|ιστοσελιδ|τεχνολογ|διαδικτυ|διαφημισ|προβολ|social|marketing|seo|eshop|ιντερνετ|ψηφιοποι" },
  { key: "logistics", label: "Προμήθειες / μεταφορές / αποθέματα", pattern: "προμηθευτ|προμηθει|εφοδιασ|αποθεμ|αποθηκ|μεταφορ|αποστολ|courier|logistics|παραδοσ|διανομ|εμπορευμα|τροφοδοσ|χονδρικ" },
  { key: "infrastructure", label: "Τοπική αγορά / υποδομές", pattern: "parking|παρκινγκ|σταθμευσ|πεζοδρομ|συγκοινων|προσβασιμ|κυκλοφορι|τοπικ(η|ης) αγορ|αστικ(ο|ου) κεντρ|οδοποι|δημοτικ(α|εσ) τελ|πεζοδρομησ" },
  { key: "finance", label: "Ρευστότητα / τράπεζες / οφειλές", pattern: "ρευστοτ|χρηματοδοτ|κεφαλαι|τραπεζ|δανει|πιστωσ|πιστωτικ|επιταγ|πληρωμ|οφειλ|χρε(ο|ω)σ|pos|χρηματοπιστωτ|διακανονισμ" },
  { key: "tourism", label: "Τουρισμός / εποχικότητα", pattern: "τουρισ|σεζον|εποχικ|επισκεπτ|τουριστικ|ξενοδοχ|καλοκαιριν(η|ο) περιοδ|χειμεριν(η|ο) περιοδ|διακοπ(ε|ω)ν" },
  { key: "survival", label: "Επιβίωση / προσωπικό εισόδημα", pattern: "επιβιωσ|βιοπορισ|βγα(ζ|λ)ω( | τα )|προσωπικ(ο|ου) εισοδημ|να πληρωθ|να παρω( κι εγω)? (ενα|τον) μισθο|λουκετ|κλεισ(ω|ουμε) το μαγαζ|δεν βγαιν|δεν μεν|απογοητευ|αγωνια" },
  { key: "cooperation", label: "Συνεργασία / στήριξη τοπικών επιχειρήσεων", pattern: "συνεργασ|συλλογικ|δικτυωσ|επιμελητηρ|στηριξ|στηριζ|τοπικ(α|η|ο) προιον|ελληνικ(α|η) παραγωγ|μικρ(ε|ω|ο) επιχειρησ|συνεταιρισμ|συμπραξ" },
  { key: "safety", label: "Ασφάλεια / παραβατικότητα", pattern: "κλοπ|παραβατικ|εγκληματ|βανδαλισμ|ληστει|διαρρηξ|απατ|αστυνομευσ" },
  { key: "outlook", label: "Προοπτικές / προτάσεις / αλλαγές", pattern: "προοπτικ|μελλον|προτειν|προτασ|αναγκη αλλαγ|επιθυμ|ελπι|μεταρρυθμ|επενδυσ|αναπτυξ|βελτιωσ|καινοτομ|λυση στο προβλημ" }
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
