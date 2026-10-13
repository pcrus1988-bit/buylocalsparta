/**
 * Safe, deterministic crosswalk between GEMI source prefectures and the 13
 * administrative regions of Greece. Source region_code is a historical
 * prefecture ID, NOT an administrative periphery. Never plot it directly.
 * Unresolved source names stay unassigned, and are counted separately.
 */
export const GREECE_REGION_NAMES = [
  ["EAST MACEDONIA AND THRACE", "Ανατολική Μακεδονία και Θράκη"],
  ["CENTRAL MACEDONIA", "Κεντρική Μακεδονία"],
  ["THESSALY", "Θεσσαλία"],
  ["NORTH AEGEAN", "Βόρειο Αιγαίο"],
  ["SOUTH AEGEAN", "Νότιο Αιγαίο"],
  ["CENTRAL GREECE", "Στερεά Ελλάδα"],
  ["WESTERN GREECE", "Δυτική Ελλάδα"],
  ["PELOPONNESE", "Πελοπόννησος"],
  ["ATTICA", "Αττική"],
  ["WEST MACEDONIA", "Δυτική Μακεδονία"],
  ["EPIRUS", "Ήπειρος"],
  ["IONIAN ISLANDS", "Ιόνια Νησιά"],
  ["CRETE", "Κρήτη"]
] as const;

export type GreekRegionKey = (typeof GREECE_REGION_NAMES)[number][0];
export const GREECE_REGIONS = GREECE_REGION_NAMES.map(([key, label]) => ({ key, label }));

export const normalizedPrefecture = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("el-GR").trim().replace(/\s+/g, " ");

const PREFECTURES_BY_REGION: Record<GreekRegionKey, readonly string[]> = {
  "EAST MACEDONIA AND THRACE": ["ΕΒΡΟΥ", "ΡΟΔΟΠΗΣ", "ΞΑΝΘΗΣ", "ΔΡΑΜΑΣ", "ΚΑΒΑΛΑΣ", "ΘΑΣΟΥ"],
  "CENTRAL MACEDONIA": ["ΘΕΣΣΑΛΟΝΙΚΗΣ", "ΣΕΡΡΩΝ", "ΠΕΛΛΗΣ", "ΗΜΑΘΙΑΣ", "ΠΙΕΡΙΑΣ", "ΧΑΛΚΙΔΙΚΗΣ", "ΚΙΛΚΙΣ"],
  "THESSALY": ["ΛΑΡΙΣΑΣ", "ΛΑΡΙΣΗΣ", "ΜΑΓΝΗΣΙΑΣ", "ΤΡΙΚΑΛΩΝ", "ΚΑΡΔΙΤΣΑΣ", "ΣΠΟΡΑΔΩΝ"],
  "NORTH AEGEAN": ["ΛΕΣΒΟΥ", "ΛΗΜΝΟΥ", "ΧΙΟΥ", "ΣΑΜΟΥ", "ΙΚΑΡΙΑΣ"],
  "SOUTH AEGEAN": ["ΔΩΔΕΚΑΝΗΣΟΥ", "ΚΥΚΛΑΔΩΝ", "ΡΟΔΟΥ", "ΚΩ", "ΚΑΛΥΜΝΟΥ", "ΘΗΡΑΣ", "ΚΑΡΠΑΘΟΥ"],
  "CENTRAL GREECE": ["ΦΘΙΩΤΙΔΑΣ", "ΦΩΚΙΔΑΣ", "ΕΥΡΥΤΑΝΙΑΣ", "ΕΥΒΟΙΑΣ", "ΒΟΙΩΤΙΑΣ"],
  "WESTERN GREECE": ["ΑΧΑΙΑΣ", "ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ", "ΗΛΕΙΑΣ"],
  "PELOPONNESE": ["ΑΡΓΟΛΙΔΑΣ", "ΑΡΚΑΔΙΑΣ", "ΚΟΡΙΝΘΙΑΣ", "ΛΑΚΩΝΙΑΣ", "ΜΕΣΣΗΝΙΑΣ"],
  "ATTICA": ["ΑΤΤΙΚΗΣ", "ΑΘΗΝΩΝ", "ΠΕΙΡΑΙΑ", "ΠΕΙΡΑΙΩΣ", "ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ", "ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ"],
  "WEST MACEDONIA": ["ΚΟΖΑΝΗΣ", "ΚΑΣΤΟΡΙΑΣ", "ΦΛΩΡΙΝΑΣ", "ΓΡΕΒΕΝΩΝ"],
  "EPIRUS": ["ΙΩΑΝΝΙΝΩΝ", "ΑΡΤΑΣ", "ΠΡΕΒΕΖΑΣ", "ΘΕΣΠΡΩΤΙΑΣ"],
  "IONIAN ISLANDS": ["ΚΕΡΚΥΡΑΣ", "ΚΕΦΑΛΛΗΝΙΑΣ", "ΚΕΦΑΛΟΝΙΑΣ", "ΛΕΥΚΑΔΑΣ", "ΖΑΚΥΝΘΟΥ", "ΙΘΑΚΗΣ"],
  "CRETE": ["ΗΡΑΚΛΕΙΟΥ", "ΧΑΝΙΩΝ", "ΡΕΘΥΜΝΗΣ", "ΡΕΘΥΜΝΟΥ", "ΛΑΣΙΘΙΟΥ"]
};

const CROSSWALK = new Map<string, GreekRegionKey>(
  Object.entries(PREFECTURES_BY_REGION).flatMap(([region, prefectures]) =>
    prefectures.map(prefecture => [normalizedPrefecture(prefecture), region as GreekRegionKey] as const))
);

export function greekRegionForPrefecture(prefecture: string | null | undefined): GreekRegionKey | undefined {
  return prefecture ? CROSSWALK.get(normalizedPrefecture(prefecture)) : undefined;
}

export type GeographicMapCell = Readonly<{ key: GreekRegionKey; label: string; respondents: number; answered: number; selected: number }>;
export type GeographicPrefectureCell = Readonly<{ name: string; region: GreekRegionKey | null; respondents: number; answered: number; selected: number }>;

export function summarizeGreekPrefectures(rows: readonly Readonly<{ prefecture: string; respondents: number; answered: number; selected: number }>[]) {
  const byKey = new Map<GreekRegionKey, GeographicMapCell>(GREECE_REGIONS.map(x =>
    [x.key, { key: x.key, label: x.label, respondents: 0, answered: 0, selected: 0 }]));
  let unresolved = 0;
  const prefectures: GeographicPrefectureCell[] = [];
  for (const row of rows) {
    const region = greekRegionForPrefecture(row.prefecture) ?? null;
    prefectures.push({ name: row.prefecture || "Χωρίς αξιόπιστη περιοχή", region, respondents: row.respondents, answered: row.answered, selected: row.selected });
    if (!region) { unresolved += row.respondents; continue; }
    const prev = byKey.get(region)!;
    byKey.set(region, { ...prev, respondents: prev.respondents + row.respondents,
      answered: prev.answered + row.answered, selected: prev.selected + row.selected });
  }
  return { regions: [...byKey.values()], prefectures, unresolved };
}
