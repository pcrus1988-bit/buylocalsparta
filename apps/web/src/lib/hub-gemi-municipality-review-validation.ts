export type MunicipalityReviewInput = Readonly<{
  municipalityId: string;
  sourceId: string;
  decision: string;
  reason: string;
  attestation: string;
}>;

/** This decision verifies an administrative-name match, never a business address. */
export function validateMunicipalityReviewInput(input: MunicipalityReviewInput) {
  const municipalityId = input.municipalityId.trim();
  const sourceId = input.sourceId.trim();
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!/^[1-9][0-9]{3,5}$/.test(municipalityId)) throw new Error("INVALID_MUNICIPALITY_ID");
  if (!/^GR[0-9]{4}M[0-9]{3}$/.test(sourceId)) throw new Error("INVALID_GAZETTEER_ID");
  if (input.decision !== "reviewed" && input.decision !== "rejected") {
    throw new Error("INVALID_REVIEW_DECISION");
  }
  if (reason.length < 20 || reason.length > 600) throw new Error("REVIEW_REASON_REQUIRED");
  if (input.attestation !== "municipality_only") throw new Error("MUNICIPALITY_SCOPE_ACK_REQUIRED");
  return { municipalityId, sourceId, reason, decision: input.decision };
}
