/** Curated, dated, public-source series. Do not silently join different indicator definitions. */
export type ExternalPoint = Readonly<{ period: string; year: number; value: number }>;
export type ExternalSeries = Readonly<{ id: string; label: string; points: readonly ExternalPoint[] }>;
export type ExternalGroup = Readonly<{
  id: string;
  title: string;
  subtitle: string;
  unit: "index" | "balance" | "percent";
  frequency: "annual" | "month-of-year";
  comparison: "direct" | "trend-only" | "descriptive";
  sourceIds: readonly string[];
  series: readonly ExternalSeries[];
  caution: string;
}>;
export type ExternalStudy = Readonly<{
  id: string;
  issuer: string;
  title: string;
  year: number;
  kind: "sentiment" | "survey" | "statistical";
  url: string;
  detail: string;
}>;
const annual = (values: readonly number[], start = 2022): ExternalPoint[] =>
  values.map((value, offset) => ({ period: String(start + offset), year: start + offset, value }));
const months = (values: readonly number[], year: number): ExternalPoint[] =>
  values.map((value, offset) => ({ period: String(offset + 1).padStart(2, "0"), year, value }));

export const EXTERNAL_STUDIES: readonly ExternalStudy[] = [
  { id: "iobe-2026", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2026", year: 2026, kind: "sentiment", url: "https://iobe.gr/wp-content/uploads/2026/10/BCS_02102026_REP_GR.pdf", detail: "Πίνακας 1, σελ. 4: ετήσιο και μηνιαίο οικονομικό κλίμα. Πίνακας 4, σελ. 10: λιανικό εμπόριο." },
  { id: "iobe-2025", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2025", year: 2025, kind: "sentiment", url: "https://iobe.gr/wp-content/uploads/2025/10/BCS_01102025_REP_G%CE%A1.pdf", detail: "Πίνακας 4, σελ. 10: επιχειρηματικές προσδοκίες λιανικού εμπορίου." },
  { id: "iobe-2024", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2024", year: 2024, kind: "sentiment", url: "https://iobe.gr/wp-content/uploads/2025/06/BCS_01102024_REP_G%CE%A1.pdf", detail: "Πίνακας 4, σελ. 10: επιχειρηματικές προσδοκίες λιανικού εμπορίου." },
  { id: "iobe-2023", issuer: "ΙΟΒΕ · DG ECFIN", title: "Έρευνα οικονομικής συγκυρίας, Σεπτέμβριος 2023", year: 2023, kind: "sentiment", url: "https://iobe.gr/docs/situation/BCS_03102023_REP_GR.pdf", detail: "Λιανικό εμπόριο: δείκτης Σεπτεμβρίου 2023. Ιστορικό αντίγραφο, ενδέχεται να αλλάξει ο σύνδεσμος." },
  { id: "bog-2025", issuer: "Τράπεζα της Ελλάδος · ΙΟΒΕ / EC", title: "Note on the Greek Economy, 05/09/2025", year: 2025, kind: "sentiment", url: "https://www.bankofgreece.gr/Publications/Note_on_the_Greek_economy_05_09_2025.pdf", detail: "Πίνακας 6, σελ. 62: ετήσιοι δείκτες ισοζυγίων 2022–2024, εποχικά διορθωμένοι." },
  { id: "ielka-2025", issuer: "ΙΕΛΚΑ", title: "Τιμές σούπερ μάρκετ, Σεπτέμβριος 2025", year: 2025, kind: "statistical", url: "https://www.ese.gr/meiomenos-plithorismos-supermarket-septemvrio-2025/", detail: "Μεταβολή Σεπτεμβρίου 2025 έναντι Σεπτεμβρίου 2024, οργανωμένο λιανεμπόριο τροφίμων." },
  { id: "ielka-2026", issuer: "ΙΕΛΚΑ", title: "Τιμές σούπερ μάρκετ, Σεπτέμβριος 2026", year: 2026, kind: "statistical", url: "https://www.ese.gr/ekseliksi-timon-supermarket-septemvrios-2026/", detail: "Μεταβολή Σεπτεμβρίου 2026 έναντι Σεπτεμβρίου 2025, ίδιο ειδικό κανάλι." },
  { id: "esee-2026", issuer: "ΕΣΕΕ · ΙΝΕΜΥ", title: "Κίνηση καταστημάτων, εορτές 2025–2026", year: 2026, kind: "survey", url: "https://www.esee.gr/", detail: "Δειγματοληπτική έρευνα σε εμπορικές επιχειρήσεις. Αναφορά στις αυτοδηλωμένες πωλήσεις, όχι στον συνολικό τζίρο." },
  { id: "elstat-2026", issuer: "ΕΛΣΤΑΤ", title: "Δείκτες κύκλου εργασιών και όγκου λιανικού εμπορίου", year: 2026, kind: "statistical", url: "https://www.statistics.gr/el/statistics/-/publication/DKT39/2026-M06", detail: "Επίσημες χρονοσειρές όγκου και κύκλου εργασιών. Δεν ταυτίζονται με δείκτες γνώμης." },
  { id: "ec-data", issuer: "Ευρωπαϊκή Επιτροπή · DG ECFIN", title: "Χρονοσειρές ερευνών επιχειρήσεων και καταναλωτών", year: 2026, kind: "sentiment", url: "https://economy-finance.ec.europa.eu/economic-forecast-and-surveys/business-and-consumer-surveys/download-business-and-consumer-survey-data/time-series_en", detail: "Εναρμονισμένες χρονοσειρές, με επισήμανση για εποχική διόρθωση και μεταγενέστερες αναθεωρήσεις." }
];

export const EXTERNAL_GROUPS: readonly ExternalGroup[] = [
  {
    id: "annual-esi",
    title: "Οικονομικό κλίμα · ετήσιο",
    subtitle: "Ελλάδα, ΕΕ-27 και Ευρωζώνη · 2022–2025",
    unit: "index", frequency: "annual", comparison: "direct", sourceIds: ["iobe-2026", "ec-data"],
    caution: "Ίδιος εναρμονισμένος δείκτης και ίδια έκδοση δεδομένων (Οκτώβριος 2026). Το 2026 δεν είναι ολοκληρωμένο έτος και δεν παρουσιάζεται ως ετήσιος μέσος.",
    series: [
      { id: "esi-gr", label: "Ελλάδα", points: annual([104.9, 107.2, 107.6, 107.4]) },
      { id: "esi-eu", label: "ΕΕ-27", points: annual([101.8, 95.6, 96.3, 95.8]) },
      { id: "esi-ea", label: "Ευρωζώνη", points: annual([102.3, 96.4, 95.9, 95.6]) }
    ]
  },
  {
    id: "monthly-esi",
    title: "Οικονομικό κλίμα · σύγκριση ίδιων μηνών",
    subtitle: "Επικάλυψη 2025 και 2026 · επιλέξτε έτος και περιοχή",
    unit: "index", frequency: "month-of-year", comparison: "direct", sourceIds: ["iobe-2026", "ec-data"],
    caution: "Η επικάλυψη συγκρίνει τον ίδιο ημερολογιακό μήνα διαφορετικών ετών. Για το 2026 υπάρχουν στοιχεία μόνο έως τον Σεπτέμβριο· δεν υπολογίζεται μέσος όρος ολόκληρου έτους.",
    series: [
      { id: "mesi-gr25", label: "Ελλάδα · 2025", points: months([108.0,106.3,107.2,106.9,106.6,105.7,108.6,109.7,105.9,107.2,105.7,106.9],2025) },
      { id: "mesi-gr26", label: "Ελλάδα · 2026", points: months([105.1,107.6,106.8,105.8,107.3,107.8,107.2,106.9,107.6],2026) },
      { id: "mesi-eu25", label: "ΕΕ-27 · 2025", points: months([95.9,96.9,95.8,94.7,95.6,94.7,95.9,95.8,96.3,97.2,97.4,97.3],2025) },
      { id: "mesi-eu26", label: "ΕΕ-27 · 2026", points: months([98.9,98.2,96.6,93.8,94.2,95.7,97.3,98.3,97.9],2026) },
      { id: "mesi-ea25", label: "Ευρωζώνη · 2025", points: months([95.5,96.5,95.6,94.3,95.4,94.4,96.0,95.6,96.1,97.3,97.5,97.2],2025) },
      { id: "mesi-ea26", label: "Ευρωζώνη · 2026", points: months([99.1,98.3,96.8,93.7,94.3,95.6,97.1,98.4,97.9],2026) }
    ]
  },
  {
    id: "annual-balances",
    title: "Προσδοκίες ανά τομέα · ετήσιοι μέσοι",
    subtitle: "Ισοζύγια λιανεμπορίου, καταναλωτών, υπηρεσιών · 2022–2024",
    unit: "balance", frequency: "annual", comparison: "trend-only", sourceIds: ["bog-2025", "ec-data"],
    caution: "Οι τρεις σειρές είναι ισοζύγια αλλά μετρούν διαφορετικές έννοιες και πληθυσμούς. Η κοινή παράθεση δείχνει πορεία, όχι ισοδύναμη ένταση ή αιτιώδη σχέση.",
    series: [
      { id: "balance-retail", label: "Εμπιστοσύνη λιανεμπορίου", points: annual([5.3,21.3,12.6]) },
      { id: "balance-consumer", label: "Καταναλωτική εμπιστοσύνη", points: annual([-50.7,-40.0,-46.0]) },
      { id: "balance-services", label: "Εμπιστοσύνη υπηρεσιών", points: annual([26.4,31.5,39.7]) }
    ]
  },
  {
    id: "retail-september",
    title: "Επιχειρηματικές προσδοκίες λιανεμπορίου",
    subtitle: "Ίδιος μήνας κάθε έτους · Σεπτέμβριος 2023–2026",
    unit: "index", frequency: "annual", comparison: "direct", sourceIds: ["iobe-2023","iobe-2024","iobe-2025","iobe-2026"],
    caution: "Εθνικός δείκτης ΙΟΒΕ με βάση 2000–2010=100. Δεν είναι ο δείκτης εμπιστοσύνης λιανεμπορίου της ΕΕ σε μορφή ισοζυγίου. Οι ιστορικές εκδόσεις μπορεί να αναθεωρηθούν.",
    series: [{ id: "retail-sep", label: "Ελλάδα · Σεπτέμβριος", points: annual([124.3,97.5,97.8,116.0],2023) }]
  },
  {
    id: "retail-monthly",
    title: "Λιανεμπόριο · επικάλυψη μηνών",
    subtitle: "Εθνικός δείκτης προσδοκιών ΙΟΒΕ · 2025 vs 2026",
    unit: "index", frequency: "month-of-year", comparison: "direct", sourceIds: ["iobe-2026"],
    caution: "Ο ίδιος εθνικός δείκτης ΙΟΒΕ στα δύο έτη. Τα στοιχεία του 2026 τελειώνουν τον Σεπτέμβριο. Ο εθνικός δείκτης ΙΟΒΕ δεν είναι σε ίδια κλίμακα με το ευρωπαϊκό ισοζύγιο.",
    series: [
      { id: "retail-2025", label: "2025", points: months([93.8,98.4,94.9,98.6,100.4,105.9,93.4,91.1,97.8,106.4,113.5,97.2],2025) },
      { id: "retail-2026", label: "2026", points: months([101.0,110.7,104.9,105.6,104.5,108.3,116.8,112.7,116.0],2026) }
    ]
  },
  {
    id: "supermarket-prices",
    title: "Μεταβολή τιμών σούπερ μάρκετ",
    subtitle: "Ετήσιος ρυθμός μεταβολής τον Σεπτέμβριο · ΙΕΛΚΑ",
    unit: "percent", frequency: "annual", comparison: "direct", sourceIds: ["ielka-2025","ielka-2026"],
    caution: "Κάθε τιμή είναι η ετήσια μεταβολή τιμών για τον συγκεκριμένο Σεπτέμβριο στο οργανωμένο λιανεμπόριο τροφίμων — όχι επίπεδο τιμών. Η διαφορά των ρυθμών εκφράζεται σε ποσοστιαίες μονάδες.",
    series: [{ id: "ielka-september", label: "Σεπτέμβριος · ετήσια μεταβολή", points: annual([0.61,-0.75],2025) }]
  },
  {
    id: "holiday-survey",
    title: "Εορταστική αγορά · δηλώσεις επιχειρήσεων",
    subtitle: "ΕΣΕΕ / ΙΝΕΜΥ · εορτές 2025–2026",
    unit: "percent", frequency: "annual", comparison: "descriptive", sourceIds: ["esee-2026"],
    caution: "Διαφορετικές κατηγορίες απαντήσεων στην ΙΔΙΑ έρευνα, όχι χρονική εξέλιξη. Η έρευνα επιχειρήσεων δεν είναι μέτρηση τζίρου και δεν συγκρίνεται αριθμητικά με τις τιμές ΙΕΛΚΑ.",
    series: [
      { id: "holiday-lower", label: "Χαμηλότερες πωλήσεις", points: [{period:"2026",year:2026,value:52}] },
      { id: "holiday-same", label: "Αμετάβλητες πωλήσεις", points: [{period:"2026",year:2026,value:32}] }
    ]
  }
];

export function externalGroup(id: string): ExternalGroup | undefined {
  return EXTERNAL_GROUPS.find((group) => group.id === id);
}

export function externalChange(first: number, last: number): number {
  return Math.round((last - first) * 100) / 100;
}

export function externalCsvCell(value: string | number): string {
  const safe = String(value).replace(/^[\s]*[=+\-@]/, (prefix) => "'" + prefix);
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function externalCsv(group: ExternalGroup, chosenIds: readonly string[], start: number, end: number): string {
  const rows: (string | number)[][] = [["indicator","series","year","period","value","unit","source"]];
  const sources = group.sourceIds.join("; ");
  for (const line of group.series) {
    if (!chosenIds.includes(line.id)) continue;
    for (const point of line.points) {
      if (point.year < start || point.year > end) continue;
      rows.push([group.title,line.label,point.year,point.period,point.value,group.unit,sources]);
    }
  }
  return rows.map((row) => row.map(externalCsvCell).join(",")).join("\r\n") + "\r\n";
}
