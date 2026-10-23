const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = value => typeof value === 'string' && SHA256.test(value);
const id = value => typeof value === 'string' && UUID.test(value);

/**
 * Metadata-only, fail-closed handoff to an independently authorized rights
 * reviewer. This is NOT a publication decision or an access-control function.
 * Never call this to authorize a public API, SQL view or Storage download.
 * The actual release gate must re-read current RLS-protected approvals and
 * revocations, authenticate independent reviewers and verify original bytes.
 */
export function triagePublicationEvidence({
  attestation, acquisition, snapshot, fragment, publicationApproval,
  rightsReview
} = {}) {
  const blockers = [];
  const add = (condition, reason) => { if (!condition) blockers.push(reason); };

  add(attestation?.original_bytes_verified === true &&
      attestation?.evidence?.snapshot_id === snapshot?.id &&
      attestation?.evidence?.original_sha256 === snapshot?.sha256,
      'original_bytes_not_independently_attested');
  add(attestation?.rights_document_verified === true &&
      hash(attestation?.evidence?.rights_document_sha256),
      'rights_policy_bytes_not_independently_attested');
  add(acquisition?.acquisition_authorized === true &&
      acquisition?.id === snapshot?.provenance?.asset_approval_id,
      'acquisition_binding_unverified');
  add(acquisition?.retention_until != null &&
      Number.isFinite(Date.parse(acquisition.retention_until)) &&
      Number.isFinite(Date.parse(snapshot?.fetched_at)) &&
      Date.parse(acquisition.retention_until) >= Date.parse(snapshot.fetched_at),
      'retention_deadline_unresolved');
  // Absence of an explicit prohibition is NOT affirmative permission.
  add(acquisition?.metadata?.no_public_release === false,
      'public_release_not_explicitly_permitted');
  add(id(rightsReview?.reviewer_user_id) &&
      rightsReview?.scope_verified === true &&
      hash(rightsReview?.rights_evidence_sha256) &&
      rightsReview.rights_evidence_sha256 === attestation?.evidence?.rights_document_sha256 &&
      rightsReview?.snapshot_sha256 === snapshot?.sha256,
      'independent_rights_scope_review_unverified');
  add(id(fragment?.id) && fragment?.snapshot_id === snapshot?.id &&
      hash(fragment?.content_sha256),
      'fragment_identity_unverified');
  add(publicationApproval?.fragment_id === fragment?.id &&
      publicationApproval?.snapshot_id === snapshot?.id &&
      publicationApproval?.snapshot_sha256 === snapshot?.sha256 &&
      publicationApproval?.fragment_sha256 === fragment?.content_sha256,
      'publication_approval_provenance_mismatch');
  add(publicationApproval?.public_excerpt_authorized === true &&
      publicationApproval?.revoked_at == null &&
      publicationApproval?.rights_evidence_sha256 === rightsReview?.rights_evidence_sha256,
      'public_excerpt_approval_missing_or_revoked');
  add(id(publicationApproval?.reviewer_user_id) &&
      id(publicationApproval?.rights_reviewer_user_id) &&
      publicationApproval?.reviewer_user_id !== publicationApproval?.rights_reviewer_user_id &&
      publicationApproval?.rights_reviewer_user_id === rightsReview?.reviewer_user_id,
      'independent_reviewer_separation_unverified');

  return {
    publication_authorized: false,
    independent_release_gate_required: true,
    review_blockers: [...new Set(blockers)].sort(),
    // No source text, fragment body, private URL, or policy document is returned.
    snapshot_id: id(snapshot?.id) ? snapshot.id : null,
    fragment_id: id(fragment?.id) ? fragment.id : null
  };
}
