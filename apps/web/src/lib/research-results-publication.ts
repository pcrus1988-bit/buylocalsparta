/**
 * Owner-authorized early public release (30 October 2026, 20:23 EET).
 * Keep the original embargo date separately for scientific/protocol provenance.
 * This server-only cutoff must be used in addition to the sealed snapshot,
 * archived artifact verification and per-estimate public suppression.
 */
export const GREEK_RETAIL_RESULTS_ORIGINAL_PUBLICATION_AT = "2026-10-31T22:00:01.000Z";
export const GREEK_RETAIL_RESULTS_PUBLICATION_AT = "2026-10-30T18:23:00.000Z";
export const GREEK_RETAIL_RESULTS_PUBLICATION_ATHENS = "2026-10-30T20:23:00+02:00";

/** For lifecycle publication, set the timestamp no earlier than the cutoff. */
export function eligibleGreekRetailPublicationAt(now: Date): string {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new Error("RESEARCH_PUBLICATION_CLOCK_INVALID");
  return new Date(Math.max(time, Date.parse(GREEK_RETAIL_RESULTS_PUBLICATION_AT))).toISOString();
}

/** Fail-closed public visibility predicate for deterministic tests and clients. */
export function greekRetailResultsCutoffReached(now: Date): boolean {
  const time = now.getTime();
  return Number.isFinite(time) && time >= Date.parse(GREEK_RETAIL_RESULTS_PUBLICATION_AT);
}
