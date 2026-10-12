/**
 * Administrative proposal triage. Municipality CENTRE distance never proves
 * business address/hub location, even for a correctly matched name.
 */
const REGION_CODES: Readonly<Record<string, string>> = {
  "Αττικής": "ATT",
  "Κεντρικής Μακεδονίας": "CMC",
  "Κρήτης": "CRE",
  "Πελοποννήσου": "PEL",
  "Ανατολικής Μακεδονίας και Θράκης": "EMT",
  "Ηπείρου": "EPI",
  "Θεσσαλίας": "THS",
  "Δυτικής Μακεδονίας": "WMC",
  "Στερεάς Ελλάδας": "CGR",
  "Δυτικής Ελλάδας": "WGR",
  "Νοτίου Αιγαίου": "SAE",
  "Βορείου Αιγαίου": "NAE",
  "Ιονίων Νήσων": "ION"
};

export function municipalityProposalRisks(input: Readonly<{
  sourceRegion: string | null;
  hubRegionCode: string | null;
  centroidDistanceKm: number | string | null;
}>): readonly string[] {
  const expected = input.sourceRegion ? REGION_CODES[input.sourceRegion.trim()] : undefined;
  const distance = input.centroidDistanceKm === null ? NaN : Number(input.centroidDistanceKm);
  const risks: string[] = [];
  if (!expected || !input.hubRegionCode || expected !== input.hubRegionCode) {
    risks.push("region_mismatch_or_unknown");
  }
  if (!Number.isFinite(distance) || distance > 25) {
    risks.push("centroid_outside_25km_or_unknown");
  }
  return risks;
}
