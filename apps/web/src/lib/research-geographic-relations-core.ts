import { GREECE_REGIONS, greekRegionForPrefecture, type GreekRegionKey } from "./research-geographic-core";

/**
 * Every preset is a pre-specified descriptive cross-tab, not a causal model.
 * Actual questionnaire size buckets are 1, 2–4, 5–9, etc. — never "1–2".
 */
export const RESEARCH_RELATIONSHIP_PRESETS = [
  { id:"micro_local", group:"Τοπική αγορά", label:"Μικρές επιχειρήσεις & τοπικοί πελάτες",
    a:"Q02", av:["1","2_4"], aLabel:"Επιχειρήσεις με 1–4 εργαζομένους",
    b:"Q11", bv:["51_75","76_100"], bLabel:"Πάνω από τους μισούς πελάτες είναι τοπικοί",
    insight:"Συνδέεται το πολύ μικρό μέγεθος μιας επιχείρησης με την εξάρτηση από την τοπική αγορά;" },
  { id:"solo_local", group:"Τοπική αγορά", label:"Ατομικές επιχειρήσεις & τοπικοί πελάτες",
    a:"Q02", av:["1"], aLabel:"Επιχειρήσεις με ακριβώς 1 εργαζόμενο (μαζί με τον ιδιοκτήτη)",
    b:"Q11", bv:["51_75","76_100"], bLabel:"Πάνω από τους μισούς πελάτες είναι τοπικοί",
    insight:"Στις μονοπρόσωπες επιχειρήσεις, πόσο σημαντική είναι η τοπική πελατεία;" },
  { id:"owner_local", group:"Τοπική αγορά", label:"Ιδιοκτήτες & τοπική πελατεία",
    a:"Q01", av:["owner"], aLabel:"Απαντούν ιδιοκτήτες / συνιδιοκτήτες",
    b:"Q11", bv:["51_75","76_100"], bLabel:"Οι περισσότεροι πελάτες είναι τοπικοί",
    insight:"Πώς διαφέρει η εικόνα των ιδιοκτητών σε σχέση με τους λοιπούς ρόλους;" },
  { id:"micro_offline", group:"Ψηφιακό εμπόριο", label:"Μικρές επιχειρήσεις & μηδενικές ψηφιακές πωλήσεις",
    a:"Q02", av:["1","2_4"], aLabel:"Επιχειρήσεις με 1–4 εργαζομένους",
    b:"Q04", bv:["0"], bLabel:"0% πωλήσεις από ψηφιακά κανάλια",
    insight:"Οι μικρότερες επιχειρήσεις πραγματοποιούν συχνότερα αποκλειστικά μη ψηφιακές πωλήσεις;" },
  { id:"local_eshop", group:"Ψηφιακό εμπόριο", label:"Τοπικοί πελάτες & ιδιόκτητο e-shop",
    a:"Q11", av:["51_75","76_100"], aLabel:"Πλειονότητα πελατών από την τοπική αγορά",
    b:"Q03", bv:["own_eshop"], bLabel:"Πωλήσεις μέσω δικού τους e-shop",
    insight:"Μπορεί μια επιχείρηση με τοπική πελατεία να διαθέτει και δικό της e-shop;" },
  { id:"offline_invest", group:"Ψηφιακό εμπόριο", label:"Χωρίς ψηφιακές πωλήσεις & πρόθεση για e-shop",
    a:"Q04", av:["0"], aLabel:"Επιχειρήσεις με 0% ψηφιακές πωλήσεις",
    b:"Q16", bv:["eshop"], bLabel:"Σχεδιαζόμενη επένδυση σε e-shop",
    insight:"Πόσες επιχειρήσεις που σήμερα δεν πουλούν ψηφιακά σκοπεύουν να επενδύσουν σε e-shop;" },
  { id:"marketplace_growth", group:"Ψηφιακό εμπόριο", label:"Marketplaces & προσδοκία αύξησης πωλήσεων",
    a:"Q03", av:["marketplace"], aLabel:"Πωλήσεις μέσω marketplace",
    b:"Q17", bv:["up_small","up_large"], bLabel:"Προσδοκία αύξησης πωλήσεων στους επόμενους 12 μήνες",
    insight:"Οι επιχειρήσεις που δραστηριοποιούνται σε marketplaces προσδοκούν συχνότερα ανάπτυξη;" },
  { id:"tax_outlook", group:"Πιέσεις & προοπτικές", label:"Φορολογικό βάρος & απαισιοδοξία",
    a:"Q27", av:["taxation"], aLabel:"Αναφέρουν φορολογία / εισφορές ως πίεση",
    b:"Q19", bv:["pessimistic","very_pessimistic"], bLabel:"Μάλλον ή πολύ απαισιόδοξοι",
    insight:"Συσχετίζεται η αναφορά της φορολογίας ως οικονομικής πίεσης με την επιχειρηματική απαισιοδοξία;" },
  { id:"rent_sales", group:"Πιέσεις & προοπτικές", label:"Ενοίκιο & φόβος μείωσης πωλήσεων",
    a:"Q27", av:["rent"], aLabel:"Αναφέρουν το ενοίκιο ως οικονομική πίεση",
    b:"Q17", bv:["down_small","down_large"], bLabel:"Προσδοκούν μείωση πωλήσεων",
    insight:"Οι επιχειρήσεις που πιέζονται από τα ενοίκια προβλέπουν συχνότερα πτώση τζίρου;" },
  { id:"micro_tax", group:"Πιέσεις & προοπτικές", label:"Μικρές επιχειρήσεις & φορολογία",
    a:"Q02", av:["1","2_4"], aLabel:"Επιχειρήσεις με 1–4 εργαζομένους",
    b:"Q27", bv:["taxation"], bLabel:"Αναφέρουν φορολογία / εισφορές ως πίεση",
    insight:"Πόσο συχνά επισημαίνουν το φορολογικό βάρος οι πολύ μικρές επιχειρήσεις;" },
  { id:"invest_confidence", group:"Πιέσεις & προοπτικές", label:"Επενδύσεις σε e-shop & αισιοδοξία",
    a:"Q16", av:["eshop"], aLabel:"Σχεδιάζουν επένδυση σε e-shop",
    b:"Q19", bv:["optimistic","very_optimistic"], bLabel:"Μάλλον ή πολύ αισιόδοξοι",
    insight:"Όσοι σχεδιάζουν επενδύσεις σε ηλεκτρονικό εμπόριο δηλώνουν συχνότερα αισιόδοξοι;" }
] as const;

export type RelationshipPreset = (typeof RESEARCH_RELATIONSHIP_PRESETS)[number];
export type RelationshipPair = Readonly<{
  a: string; av: readonly string[]; aLabel: string;
  b: string; bv: readonly string[]; bLabel: string;
  insight: string;
}>;
export type RawRelationshipCell = Readonly<{
  prefecture: string; segment: boolean | null;
  /** Responses containing BOTH recorded question answers in this segment. */
  answered: number; selected: number;
  /** Response counts retained in coverage when only one question was answered. */
  aOnly?: number; bOnly?: number;
}>;
export type RelationshipCounts = Readonly<{ answered: number; selected: number }>;
export type RelationshipRegion = Readonly<{ key: GreekRegionKey; label: string; segment: RelationshipCounts; other: RelationshipCounts }>;
export type SafeRelationshipCounts = Readonly<{ base: number | null; percent: number | null }>;
export type SafeRelationshipRegion = Readonly<{ key: GreekRegionKey; label: string; segment: SafeRelationshipCounts; other: SafeRelationshipCounts }>;

export const RELATIONSHIP_MIN_BASE = 15;
export const RELATIONSHIP_MIN_OUTCOME = 5;
export type RelationshipAnswerCoverage = Readonly<{
  answeredA: number; answeredB: number; paired: number;
  onlyA: number; onlyB: number;
}>;
export function relationshipAnswerCoverage(rows: readonly RawRelationshipCell[]): RelationshipAnswerCoverage {
  const paired = rows.reduce((n, row) => n + row.answered, 0);
  const onlyA = rows.reduce((n, row) => n + (row.aOnly ?? 0), 0);
  const onlyB = rows.reduce((n, row) => n + (row.bOnly ?? 0), 0);
  return { answeredA: paired + onlyA, answeredB: paired + onlyB, paired, onlyA, onlyB };
}

function empty(): RelationshipCounts { return { answered:0, selected:0 }; }
function plus(a: RelationshipCounts, b: RelationshipCounts): RelationshipCounts {
  return { answered:a.answered+b.answered, selected:a.selected+b.selected };
}
/** Compute the two denominators independently; nonresponders to either question are excluded. */
export function aggregateRelationship(cells: readonly RawRelationshipCell[]) {
  const regions = new Map<GreekRegionKey, RelationshipRegion>(GREECE_REGIONS.map(({key,label}) =>
    [key,{ key,label,segment:empty(),other:empty() }]));
  let unknown = 0;
  let unknownEntries = 0;
  let nationalSegment = empty();
  let nationalOther = empty();
  for (const cell of cells) {
    const counts = { answered:cell.answered, selected:cell.selected };
    if (cell.segment === true) nationalSegment = plus(nationalSegment, counts);
    // Missing answer A must NOT be mislabeled as "other businesses".
    else if (cell.segment === false) nationalOther = plus(nationalOther, counts);
    const region = greekRegionForPrefecture(cell.prefecture);
    if (!region) { unknown += cell.answered; unknownEntries++; continue; }
    if (cell.segment === null) continue;
    const prior = regions.get(region)!;
    regions.set(region, { ...prior,
      segment: cell.segment === true ? plus(prior.segment, counts) : prior.segment,
      other: cell.segment === false ? plus(prior.other, counts) : prior.other
    });
  }
  return { regions:[...regions.values()], nationalSegment, nationalOther, unknown, unknownEntries };
}

/**
 * This function runs on server data before HTML and React Flight serialization.
 * Withhold percentages whenever either outcome partition is under k=5.
 * Never send exact sub-threshold numerator/denominator to client components.
 */
export function safeRelationshipCounts(
  counts: RelationshipCounts, canViewExactSmallCells = false
): SafeRelationshipCounts {
  // Admins with explicit analysis/management permission can review actual n,
  // including n=1. Zero answered produces no percentage, never artificial 0%.
  if (canViewExactSmallCells) return {
    base: counts.answered,
    percent: counts.answered > 0 ? Math.round(counts.selected / counts.answered * 100) : null
  };
  if (counts.answered < RELATIONSHIP_MIN_BASE) return { base:null, percent:null };
  if (counts.selected < RELATIONSHIP_MIN_OUTCOME || counts.answered-counts.selected < RELATIONSHIP_MIN_OUTCOME) {
    return { base:counts.answered, percent:null };
  }
  return { base:counts.answered, percent:Math.round(counts.selected/counts.answered*100) };
}

export function safeRelationshipRegion(
  row: RelationshipRegion, canViewExactSmallCells = false
): SafeRelationshipRegion {
  return { key:row.key,label:row.label,
    segment:safeRelationshipCounts(row.segment, canViewExactSmallCells),
    other:safeRelationshipCounts(row.other, canViewExactSmallCells) };
}
