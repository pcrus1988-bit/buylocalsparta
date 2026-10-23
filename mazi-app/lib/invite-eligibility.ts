/** ΜΑΖΙ domain validation. This module does NOT perform registry lookups, send
 * invitations, approve companies, mint credits or grant member permissions.
 */
export function normalizeGreekAfm(input: string): string | null {
  const afm = input.trim().replace(/[ -]/g, "");
  if (!/^[0-9]{9}$/.test(afm) || /^([0-9])\1{8}$/.test(afm)) return null;
  // Greek ΑΦΜ weighted mod-11/mod-10 checksum. A checksum validates
  // transcription only; it NEVER proves that an entity exists or is active.
  const checksum = [...afm.slice(0, 8)].reduce(
    (sum, digit, index) => sum + Number(digit) * (2 ** (8 - index)), 0
  ) % 11 % 10;
  return checksum === Number(afm[8]) ? afm : null;
}

export type InvitationReview = {
  applicationStatus: "pending" | "approved" | "rejected";
  gemiLookup: "matched" | "not_found" | "unavailable" | "unverified";
  gemiCompanyActive: boolean;
  afmMatchesRegistry: boolean;
  gemiNumberPresent: boolean;
  representativeVerified: boolean;
  contactEmailVerified: boolean;
  adminApproved: boolean;
  legalEntityAlreadyMember: boolean;
  invitationAlreadyActive: boolean;
};

export type InvitationBlocker =
  | "application_not_approved"
  | "registry_not_matched"
  | "registry_entity_inactive"
  | "afm_registry_mismatch"
  | "gemi_number_missing"
  | "representative_unverified"
  | "contact_email_unverified"
  | "admin_approval_missing"
  | "legal_entity_already_member"
  | "active_invitation_exists";

/** Fail closed. No single lookup or contact email confers membership. */
export function invitationBlockers(r: InvitationReview): InvitationBlocker[] {
  const blockers: InvitationBlocker[] = [];
  if (r.applicationStatus !== "approved") blockers.push("application_not_approved");
  if (r.gemiLookup !== "matched") blockers.push("registry_not_matched");
  if (!r.gemiCompanyActive) blockers.push("registry_entity_inactive");
  if (!r.afmMatchesRegistry) blockers.push("afm_registry_mismatch");
  if (!r.gemiNumberPresent) blockers.push("gemi_number_missing");
  if (!r.representativeVerified) blockers.push("representative_unverified");
  if (!r.contactEmailVerified) blockers.push("contact_email_unverified");
  if (!r.adminApproved) blockers.push("admin_approval_missing");
  if (r.legalEntityAlreadyMember) blockers.push("legal_entity_already_member");
  if (r.invitationAlreadyActive) blockers.push("active_invitation_exists");
  return blockers;
}
