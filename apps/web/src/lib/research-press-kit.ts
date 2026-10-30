import type { SafePublicResultPoint } from "./research-public-results-data";

export const PRESS_KIT_STUDY = "/research/greek-retail-2026";
export const PRESS_KIT_PATH = PRESS_KIT_STUDY + "/press";
export const PRESS_KIT_RESULTS = PRESS_KIT_STUDY + "/results";

type PressMetric = Readonly<{
  key: string;
  title: string;
  question: string;
  insight: string;
}>;

const selections: readonly PressMetric[] = [
  { key: "business_financial_trends_12m.operating_costs.share.increased", title: "Αύξηση λειτουργικού κόστους", question: "Q21", insight: "Επιχειρήσεις που δηλώνουν αυξημένο λειτουργικό κόστος κατά το τελευταίο 12μηνο." },
  { key: "business_financial_trends_12m.profitability.share.decreased", title: "Υποχώρηση κερδοφορίας", question: "Q21", insight: "Επιχειρήσεις που δηλώνουν μείωση κερδοφορίας κατά το τελευταίο 12μηνο." },
  { key: "digital_capabilities.tax.share.yes", title: "Ψηφιακές φορολογικές διαδικασίες", question: "Q05–Q06", insight: "Επιχειρήσεις που δηλώνουν πλήρως ψηφιακές φορολογικές διαδικασίες." },
  { key: "digital_capabilities.stock_sync.share.yes", title: "Ψηφιακός συγχρονισμός αποθέματος", question: "Q05–Q06", insight: "Επιχειρήσεις που δηλώνουν πλήρη ψηφιακό συγχρονισμό αποθεμάτων." },
  { key: "sales_channels.share.own_eshop", title: "Δικό τους e-shop", question: "Q03", insight: "Επιχειρήσεις που δηλώνουν δικό τους ηλεκτρονικό κατάστημα." },
  { key: "economic_viability_pressures.share.taxation", title: "Φορολογική πίεση", question: "Q27", insight: "Επιχειρήσεις που αναφέρουν τη φορολογία μεταξύ των βασικών πιέσεων βιωσιμότητας." },
  { key: "investment_intentions.share.none", title: "Χωρίς επενδυτικά σχέδια", question: "Q16", insight: "Επιχειρήσεις που δεν δηλώνουν επενδυτική πρόθεση στις διαθέσιμες επιλογές." },
  { key: "customer_acquisition_sources.share.word_of_mouth", title: "Η δύναμη των συστάσεων", question: "Q09–Q10", insight: "Επιχειρήσεις που αναφέρουν συστάσεις ως πηγή απόκτησης πελατών." }
];

export type PressKitHighlight = PressMetric & Readonly<{
  value: number;
  formatted: string;
  n: number;
}>;

export function pressKitHighlights(points: readonly SafePublicResultPoint[]): PressKitHighlight[] {
  return selections.flatMap(item => {
    const point = points.find(p =>
      p.metricKey === item.key &&
      Object.keys(p.segment).length === 0 &&
      p.format === "proportion" &&
      Number.isFinite(p.value) && p.value >= 0 && p.value <= 1 &&
      Number.isSafeInteger(p.n) && p.n >= 5
    );
    if (!point) return [];
    return [{
      ...item,
      value: point.value,
      formatted: new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(point.value * 100) + "%",
      n: point.n
    }];
  });
}

function csvCell(value: string | number): string {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

export function pressKitFactsCsv(figures: readonly PressKitHighlight[], releaseVersion: string): string {
  const rows = [
    ["Δείκτης", "Ποσοστό", "Βάση n", "Ερώτηση", "Επεξήγηση", "Πηγή", "Έκδοση δημοσίευσης"],
    ...figures.map(item => [
      item.title, item.formatted, String(item.n), item.question, item.insight,
      "https://kontamou.site" + PRESS_KIT_RESULTS, releaseVersion
    ])
  ];
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
