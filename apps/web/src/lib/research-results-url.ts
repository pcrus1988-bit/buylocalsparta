/** Canonical public results destinations are derived from the immutable wave slug.
 * A URL is available before publication; the public page reveals only approved releases.
 * Never derive a public URL from editable request bodies or untrusted external domains.
 */
export function canonicalResearchResultsUrl(waveSlug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(waveSlug)) {
    throw new Error("RESEARCH_RESULTS_SLUG_INVALID");
  }
  return "https://kontamou.site/research/" + waveSlug + "/results";
}
