import { GREECE_REGIONS, greekRegionForPrefecture, type GreekRegionKey } from "./research-geographic-core";
import { RELATIONSHIP_MIN_BASE, RELATIONSHIP_MIN_OUTCOME } from "./research-geographic-relations-core";

/**
 * Grouped SQL rows only. Each eligible questionnaire appears once per question,
 * including saved draft answers; withdrawn responses are excluded by the SQL.
 */
export type DistributionSqlCell = Readonly<{
  prefecture: string; answered: number; matched: number;
}>;
export type DistributionCounts = Readonly<{ answered: number; matched: number }>;
export type DistributionRegion = DistributionCounts & Readonly<{ key: GreekRegionKey; label: string }>;
export type SafeDistributionCounts = Readonly<{
  /** Actual n of responses to THIS question (not number of invitations). */
  answered: number | null;
  /** Responses selecting the chosen answer, with withheld cells nulled. */
  matched: number | null;
  /** Matched / answered within this region. */
  prevalence: number | null;
  /** Matched / all geographically mapped matches, across 13 regions. */
  distribution: number | null;
}>;
export type SafeDistributionRegion = Readonly<{ key: GreekRegionKey; label: string }> & SafeDistributionCounts;

const empty = (): DistributionCounts => ({ answered: 0, matched: 0 });
const add = (a: DistributionCounts, b: DistributionCounts): DistributionCounts =>
  ({ answered: a.answered + b.answered, matched: a.matched + b.matched });
const roundPercent = (n: number, total: number) => total > 0
  ? Math.round(n * 1000 / total) / 10 : null;

export function aggregateDistribution(rows: readonly DistributionSqlCell[]) {
  let national = empty();
  let unknown = empty();
  const byRegion = new Map<GreekRegionKey, DistributionRegion>(
    GREECE_REGIONS.map(({ key, label }) => [key, { key, label, ...empty() }]));
  for (const row of rows) {
    const counts = { answered: row.answered, matched: row.matched };
    national = add(national, counts);
    const key = greekRegionForPrefecture(row.prefecture);
    if (!key) { unknown = add(unknown, counts); continue; }
    const prior = byRegion.get(key)!;
    byRegion.set(key, { ...prior, ...add(prior, counts) });
  }
  const regions = [...byRegion.values()];
  return {
    national, unknown, regions,
    mappedMatched: regions.reduce((sum, row) => sum + row.matched, 0)
  };
}

/**
 * The decision is made server-side before any React client props are assembled.
 * Read-only Admin users never receive low-n exact counts, percentages or the
 * other values from which they could immediately be reconstructed.
 * Privileged analysts may see exact n including n=1 with low-n warnings.
 */
export function safeDistributionCounts(
  counts: DistributionCounts, mappedMatched: number, exact: boolean
): SafeDistributionCounts {
  if (exact) return {
    answered: counts.answered, matched: counts.matched,
    prevalence: roundPercent(counts.matched, counts.answered),
    distribution: roundPercent(counts.matched, mappedMatched)
  };
  if (counts.answered < RELATIONSHIP_MIN_BASE) {
    return { answered: null, matched: null, prevalence: null, distribution: null };
  }
  if (counts.matched < RELATIONSHIP_MIN_OUTCOME
    || counts.answered - counts.matched < RELATIONSHIP_MIN_OUTCOME) {
    return { answered: counts.answered, matched: null, prevalence: null, distribution: null };
  }
  return {
    answered: counts.answered, matched: counts.matched,
    prevalence: roundPercent(counts.matched, counts.answered),
    distribution: mappedMatched >= RELATIONSHIP_MIN_BASE
      ? roundPercent(counts.matched, mappedMatched) : null
  };
}

export function safeDistributionRegion(
  region: DistributionRegion, mappedMatched: number, exact: boolean
): SafeDistributionRegion {
  return {
    key: region.key, label: region.label,
    ...safeDistributionCounts(region, mappedMatched, exact)
  };
}
