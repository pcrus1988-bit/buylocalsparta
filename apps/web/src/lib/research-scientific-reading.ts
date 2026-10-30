import type { SafePublicResultPoint } from "./research-public-results-data.ts";

/** Only a typed, privacy-minimised summary of an already published release
 * may be passed to the presentation. Never send entire methodology/audit rows
 * or unapproved research answers through the public client.
 */
export type ScientificReadingSummary = Readonly<{
  selected: number | null;
  sent: number | null;
  delivered: number | null;
  started: number | null;
  completed: number | null;
  analysed: number | null;
  excluded: number | null;
  completionsPerSent: number | null;
  administrativelyFinalised: boolean;
  earlyCloseDocumented: boolean;
  hasConventionalSamplingIntervals: boolean;
}>;

export type ScientificChart = Readonly<{
  id: string;
  title: string;
  description: string;
  note: string;
  rows: readonly Readonly<{ key: string; label: string; value: number; n: number }>[];
}>;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

function safeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function scientificReadingSummary(
  methodology: Readonly<Record<string, unknown>>,
): ScientificReadingSummary {
  const fieldwork = asObject(methodology.fieldwork);
  const protocol = asObject(methodology.protocolEvidence);
  const disclosure = asObject(methodology.disclosure);
  const eventTitles = Array.isArray(protocol.events)
    ? protocol.events.map(event => String(asObject(event).title ?? ""))
    : [];
  const selected = safeCount(fieldwork.selected);
  const sent = safeCount(fieldwork.sent);
  const delivered = safeCount(fieldwork.delivered);
  const started = safeCount(fieldwork.started);
  const completed = safeCount(fieldwork.completed);
  const analysed = safeCount(fieldwork.analyzed);
  const excluded = safeCount(fieldwork.qualityExcluded);
  // This is a simple completion-to-sent ratio, NOT an unbiased survey response
  // rate, nor the fraction of eligible population. Keep this distinction visible.
  const completionsPerSent = completed !== null && sent !== null
    && sent > 0 && completed <= sent ? completed / sent : null;
  return {
    selected, sent, delivered, started, completed, analysed, excluded,
    completionsPerSent,
    administrativelyFinalised: eventTitles.some(title =>
      /administrative (recovery|finalization)/i.test(title)),
    earlyCloseDocumented: eventTitles.some(title =>
      /early closure/i.test(title)),
    hasConventionalSamplingIntervals: disclosure.confidenceIntervalsPublished === true,
  };
}

const DEFINITIONS = [
  {
    id: "economy", title: "Η πίεση στην καθημερινή λειτουργία",
    description: "Τι δηλώνουν οι επιχειρήσεις για το κόστος, την κερδοφορία και τη βιωσιμότητά τους.",
    note: "Οι κατηγορίες «δεν γνωρίζω» και «δεν απαντώ» της Q21 παραμένουν στον παρονομαστή. Η Q27 επιτρέπει έως τρεις επιλογές: τα ποσοστά μεταξύ ερωτήσεων δεν αθροίζονται.",
    indicators: [
      ["business_financial_trends_12m.operating_costs.share.increased", "Αύξηση λειτουργικού κόστους"],
      ["economic_viability_pressures.share.purchasing_power", "Πίεση από τη μειωμένη αγοραστική δύναμη"],
      ["economic_viability_pressures.share.taxation", "Φορολογική πίεση"],
      ["business_financial_trends_12m.profitability.share.decreased", "Μείωση κερδοφορίας"],
    ]
  },
  {
    id: "digital", title: "Η ψηφιακή μετάβαση έχει διαφορετικές ταχύτητες",
    description: "Η ψηφιακή φορολογική διαδικασία και ο πλήρης συγχρονισμός αποθεμάτων μετρώνται χωριστά.",
    note: "Δύο αυτοτελή σταθμισμένα ποσοστά της Q05, με διαφορετική βάση n. Η διαφορά τους δεν ισοδυναμεί με το ποσοστό των ίδιων επιχειρήσεων που υστερούν σε απόθεμα.",
    indicators: [
      ["digital_capabilities.tax.share.yes", "Πλήρως ψηφιακές φορολογικές διαδικασίες"],
      ["digital_capabilities.stock_sync.share.yes", "Πλήρης ψηφιακός συγχρονισμός αποθεμάτων"],
      ["digital_capabilities.catalog.share.yes", "Πλήρως ψηφιακός κατάλογος"],
    ]
  },
  {
    id: "customers", title: "Η προσέγγιση πελατών παραμένει πολυκαναλική",
    description: "Οι πηγές νέων πελατών όπως δηλώθηκαν από τις επιχειρήσεις.",
    note: "Η ίδια επιχείρηση μπορούσε να επιλέξει περισσότερες από μία πηγές. Το άθροισμα μπορεί να ξεπερνά το 100%.",
    indicators: [
      ["customer_acquisition_sources.share.footfall", "Φυσική προσέλευση"],
      ["customer_acquisition_sources.share.word_of_mouth", "Συστάσεις πελατών"],
      ["customer_acquisition_sources.share.google", "Αναζήτηση Google"],
    ]
  }
] as const;

/** All plotted values are published national marginal estimates, not
 * reconstructed cross-tabs. Never show a missing or suppressed measure as 0.
 */
export function scientificReadingCharts(points: readonly SafePublicResultPoint[]): readonly ScientificChart[] {
  const national = new Map(points
    .filter(point => Object.keys(point.segment).length === 0 && point.format === "proportion"
      && Number.isFinite(point.value) && point.value >= 0 && point.value <= 1 && point.n >= 5)
    .map(point => [point.metricKey, point] as const));
  return DEFINITIONS.flatMap(group => {
    const rows = group.indicators.flatMap(([key, label]) => {
      const value = national.get(key);
      return value ? [{ key, label, value: value.value, n: value.n }] : [];
    });
    return rows.length ? [{
      id: group.id, title: group.title, description: group.description, note: group.note, rows
    }] : [];
  });
}

export function scientificReadingIndices(points: readonly SafePublicResultPoint[]) {
  const defs = [
    ["digital_readiness.mean", "Ψηφιακή ετοιμότητα"],
    ["retail_friction.mean", "Λειτουργική δυσκολία"],
    ["retail_confidence.mean", "Επιχειρηματική εμπιστοσύνη"],
  ] as const;
  return defs.flatMap(([key, label]) => {
    const point = points.find(value => value.metricKey === key && value.format === "mean"
      && Object.keys(value.segment).length === 0 && Number.isFinite(value.value)
      && value.value >= 0 && value.value <= 100 && value.n >= 5);
    return point ? [{ key, label, value: point.value, n: point.n }] : [];
  });
}
