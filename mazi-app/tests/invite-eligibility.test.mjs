import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGreekAfm, invitationBlockers } from "../lib/invite-eligibility.ts";

// Locally generated checksum fixtures; not requests or actual company records.
test("ΑΦΜ checksum and canonicalisation (not proof of company existence)", () => {
  assert.equal(normalizeGreekAfm(" 123 456 783 "), "123456783");
  assert.equal(normalizeGreekAfm("246-813-570"), "246813570");
  assert.equal(normalizeGreekAfm("123456782"), null);
  assert.equal(normalizeGreekAfm("12345678"), null);
  assert.equal(normalizeGreekAfm("000000000"), null);
  assert.equal(normalizeGreekAfm("not-an-afm"), null);
  assert.equal(normalizeGreekAfm("１２３４５６７８３"), null);
});
const verified = {
  applicationStatus: "approved",
  gemiLookup: "matched",
  gemiCompanyActive: true,
  afmMatchesRegistry: true,
  gemiNumberPresent: true,
  representativeVerified: true,
  contactEmailVerified: true,
  adminApproved: true,
  legalEntityAlreadyMember: false,
  invitationAlreadyActive: false
};
test("invitation requires all independent verified facts", () => {
  assert.deepEqual(invitationBlockers(verified), []);
});
test("approval without independently verified control is not sufficient", () => {
  assert.deepEqual(invitationBlockers({...verified, representativeVerified:false}), ["representative_unverified"]);
  assert.deepEqual(invitationBlockers({...verified, contactEmailVerified:false}), ["contact_email_unverified"]);
  assert.deepEqual(invitationBlockers({...verified, adminApproved:false}), ["admin_approval_missing"]);
});
test("registry checks fail closed and prevent duplicate legal-entity invitations", () => {
  assert.deepEqual(invitationBlockers({...verified, gemiLookup:"unavailable"}), ["registry_not_matched"]);
  assert.deepEqual(invitationBlockers({...verified, gemiCompanyActive:false}), ["registry_entity_inactive"]);
  assert.deepEqual(invitationBlockers({...verified, afmMatchesRegistry:false}), ["afm_registry_mismatch"]);
  assert.deepEqual(invitationBlockers({...verified, legalEntityAlreadyMember:true}), ["legal_entity_already_member"]);
  assert.deepEqual(invitationBlockers({...verified, invitationAlreadyActive:true}), ["active_invitation_exists"]);
});
test("pending or rejected public interest applications never gain onboarding invitations", () => {
  assert.deepEqual(invitationBlockers({...verified, applicationStatus:"pending"}), ["application_not_approved"]);
  assert.deepEqual(invitationBlockers({...verified, applicationStatus:"rejected"}), ["application_not_approved"]);
});
