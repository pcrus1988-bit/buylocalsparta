// Advisory only: production must authenticate reviewer and verify bytes.
export const validSha256 = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
export function publicExcerptEligible({snapshot, fragment, approval, reviewer}) {
  return !!(validSha256(snapshot?.sha256) &&
    validSha256(fragment?.content_sha256) &&
    approval?.snapshot_sha256 === snapshot.sha256 &&
    approval?.fragment_sha256 === fragment.content_sha256 &&
    approval?.snapshot_id === snapshot.id &&
    approval?.fragment_id === fragment.id &&
    fragment?.snapshot_id === snapshot.id &&
    approval?.decision === 'approved' &&
    approval?.public_excerpt_authorized === true &&
    validSha256(approval?.rights_evidence_sha256) &&
    reviewer?.independently_authorized === true &&
    approval?.reviewer_user_id === reviewer?.authenticated_user_id &&
    approval?.reviewer_user_id !== approval?.submitted_by_user_id &&
    !approval?.revoked_at);
}
