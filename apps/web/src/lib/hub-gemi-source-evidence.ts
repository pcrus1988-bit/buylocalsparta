/** Source address corroboration is never physical coordinate verification. */
export type GemiSourceEvidenceInputs = Readonly<{
  sourcePostcode: string | null;
  registryPostcode: string | null;
  addressMatchStatus: string;
  sourceConfirmed: boolean;
  physicalGeoVerified: boolean;
  existingClaim: boolean;
  existingPartner: boolean;
}>;

export type GemiSourceEvidenceAssessment = Readonly<{
  issues: readonly string[];
  duplicateExistingProfile: boolean;
  eligibleForAutomaticPublication: false;
}>;

export function classifyGemiSourceEvidence(value: GemiSourceEvidenceInputs): GemiSourceEvidenceAssessment {
  const issues: string[] = [];
  if (!value.sourcePostcode || !value.registryPostcode) {
    issues.push("Απαιτείται αντιπαραβολή ταχυδρομικού κώδικα με ανεξάρτητη πηγή.");
  } else if (value.sourcePostcode !== value.registryPostcode) {
    issues.push("Ασυμφωνία ταχυδρομικού κώδικα πηγής και ΓΕΜΗ.");
  }
  if (value.addressMatchStatus !== "source_corroborated") {
    issues.push("Η διεύθυνση δεν έχει τεκμηριωμένη συμφωνία με την πηγή.");
  }
  if (!value.sourceConfirmed) {
    issues.push("Δεν έχει ολοκληρωθεί ανθρώπινη επιβεβαίωση της πηγής.");
  }
  if (!value.physicalGeoVerified) {
    issues.push("Δεν υπάρχουν επαληθευμένες συντεταγμένες φυσικής εγκατάστασης.");
  }
  if (value.existingClaim || value.existingPartner) {
    issues.push("Υπάρχει ήδη δημόσιο προφίλ · απαιτείται διατήρηση κανονικής διεύθυνσης URL χωρίς διπλή δημοσίευση.");
  }
  return {
    issues,
    duplicateExistingProfile: value.existingClaim || value.existingPartner,
    eligibleForAutomaticPublication: false
  };
}
