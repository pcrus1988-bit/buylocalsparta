/**
 * Immutable public release cutoff for the Greek Retail 2026 study.
 * Athens is on EET (UTC+02:00) on 1 November 2026, after DST ends.
 * Rendering must enforce this on the server; never rely on a cron tick or
 * a client/browser countdown for the moment results become publicly visible.
 */
export const GREEK_RETAIL_RESULTS_PUBLICATION_AT = "2026-10-31T22:00:01.000Z";
export const GREEK_RETAIL_RESULTS_PUBLICATION_ATHENS = "2026-11-01T00:00:01+02:00";

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
