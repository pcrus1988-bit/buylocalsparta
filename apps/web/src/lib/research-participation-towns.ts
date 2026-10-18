import { normalizedPrefecture, greekRegionForPrefecture } from "./research-geographic-core.ts";

const TOWN_LABELS: Record<string, string> = {
  "ΑΘΗΝΑΙΩΝ": "Αθήνα", "ΘΕΣΣΑΛΟΝΙΚΗΣ": "Θεσσαλονίκη", "ΛΑΡΙΣΑΙΩΝ": "Λάρισα",
  "ΗΡΑΚΛΕΙΟΥ": "Ηράκλειο", "ΠΤΟΛΕΜΑΪΔΟΣ": "Πτολεμαΐδα", "ΣΠΑΡΤΗΣ": "Σπάρτη",
  "ΣΠΑΡΤΙΑΤΩΝ": "Σπάρτη", "ΠΑΤΡΕΩΝ": "Πάτρα", "ΠΕΙΡΑΙΩΣ": "Πειραιάς", "ΠΕΙΡΑΙΑ": "Πειραιάς",
  "ΚΑΛΑΜΑΤΑΣ": "Καλαμάτα", "ΒΟΛΟΥ": "Βόλος", "ΧΑΝΙΩΝ": "Χανιά", "ΡΕΘΥΜΝΗΣ": "Ρέθυμνο",
  "ΙΩΑΝΝΙΤΩΝ": "Ιωάννινα", "ΚΑΒΑΛΑΣ": "Καβάλα", "ΣΕΡΡΩΝ": "Σέρρες", "ΤΡΙΚΚΑΙΩΝ": "Τρίκαλα",
  "ΚΑΡΔΙΤΣΗΣ": "Καρδίτσα", "ΚΟΖΑΝΗΣ": "Κοζάνη", "ΑΛΕΞΑΝΔΡΟΥΠΟΛΕΩΣ": "Αλεξανδρούπολη"
};
export type PostcodePoint = Readonly<{ postcode: string; town: string; region?: string; latitude: number; longitude: number }>;
export type ParticipationTown = Readonly<{ key: string; label: string; region: string; latitude: number; longitude: number; started: number }>;
export type ParticipationLocationRow = Readonly<{ postcode: string; prefecture: string; started: number }>;

/** Postcode centroids are approximate area locations, never business premises.
 * Combine postal areas within the same named town, disclose only town totals >=3.
 * Do not infer an unknown postcode from its prefix or move it to a regional capital.
 */
export function participationTowns(rows: readonly ParticipationLocationRow[], points: readonly PostcodePoint[]) {
  const lookup = new Map(points.map(point => [point.postcode, point]));
  const groups = new Map<string, ParticipationTown & { weight: number }>();
  let unmatched = 0;
  for (const row of rows) {
    const code = row.postcode.replace(/\s/g, "");
    const point = /^[0-9]{5}$/.test(code) ? lookup.get(code) : undefined;
    const region = greekRegionForPrefecture(row.prefecture);
    if (!point || !region || (point.region && point.region !== region) || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
      || point.latitude < 34 || point.latitude > 43 || point.longitude < 19 || point.longitude > 30) {
      unmatched += row.started; continue;
    }
    // A name can recur on separate islands: retain spatially distinct town clusters.
    const key = region + ":" + point.town + ":" + Math.round(point.latitude * 5) + ":" + Math.round(point.longitude * 5);
    const previous = groups.get(key);
    if (previous) {
      groups.set(key, { ...previous, started: previous.started + row.started,
        // Retain an actual postcode point rather than inventing a point in the sea.
        ...(row.started > previous.weight ? { latitude: point.latitude, longitude: point.longitude, weight: row.started } : {}) });
    } else groups.set(key, { key, label: TOWN_LABELS[normalizedPrefecture(point.town)] ?? "Περιοχή " + point.town, region, latitude: point.latitude, longitude: point.longitude,
      started: row.started, weight: row.started });
  }
  const towns: ParticipationTown[] = [];
  let withheld = 0;
  for (const { weight: _weight, ...town } of groups.values()) {
    if (town.started < 3) { withheld += town.started; continue; }
    towns.push({ ...town, latitude: Number(town.latitude.toFixed(2)), longitude: Number(town.longitude.toFixed(2)) });
  }
  return { towns: towns.sort((a, b) => b.started - a.started || a.key.localeCompare(b.key)), unmatched, withheld };
}
