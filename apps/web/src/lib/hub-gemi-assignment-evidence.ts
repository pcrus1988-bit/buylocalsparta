/**
 * Geographic point evidence does not identify a business premise merely
 * because its postcode, municipality or shared locality can be plotted.
 * This gate must pass before the *private* census auto-assignment script
 * assigns even a preliminary hub. It NEVER authorizes publication.
 */
export type CensusBusinessEvidence = Readonly<{
  precisionKind: string | null;
  geoSource: string | null;
  sourceReference: string | null;
  businessEvidenceReference: string | null;
  businessEvidenceKind: string | null;
  hasVerifiedPhysicalAddress: boolean;
  businessGeoVerified: boolean;
  businessGeoReviewed: boolean;
  hasBusinessGeoReviewer: boolean;
  sourcePostcode: string | null;
  registryPostcode: string | null;
  locationKeyUniqueToBusiness: boolean;
}>;

export function businessHasPremiseLevelGeoEvidence(value: CensusBusinessEvidence): boolean {
  if (value.precisionKind !== "address") return false;
  if (!["verified_geocode", "verified_manual", "licensed_gazetteer"].includes(value.geoSource ?? "")) return false;
  const source = value.sourceReference?.trim() ?? "";
  if (source.length < 12 || source !== value.businessEvidenceReference?.trim()) return false;
  if (!["verified_premise_address", "verified_registry_address"].includes(value.businessEvidenceKind ?? "")) return false;
  if (!value.hasVerifiedPhysicalAddress || !value.businessGeoVerified ||
      !value.businessGeoReviewed || !value.hasBusinessGeoReviewer) return false;
  if (!value.registryPostcode || !/^[0-9]{5}$/.test(value.registryPostcode) ||
      value.sourcePostcode !== value.registryPostcode) return false;
  // A reusable geo key with multiple registered businesses cannot establish
  // that the point is correct for each of their individual premises.
  return value.locationKeyUniqueToBusiness;
}
