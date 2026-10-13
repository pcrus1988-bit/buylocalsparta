// ADVISORY PREFLIGHT ONLY. Never use this helper as a production authorization
// decision: the server must authenticate reviewer identity/role, independently
// verify documentary rights evidence bytes and provenance, and enforce RLS.
// No caller-provided flags or this helper may grant publication rights.
export const validSha256 = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);

const validTime = s => typeof s === 'string' && Number.isFinite(Date.parse(s));
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const notRevoked = obj => obj?.revoked_at == null && obj?.retracted_at == null;

export function publicExcerptEligible({source, snapshot, fragment, approval, reviewer, evidence, now} = {}) {
  const at = typeof now === 'string' ? Date.parse(now) : NaN;
  if (!Number.isFinite(at)) return false; // deterministic trusted clock required
  if (!nonempty(source?.id) || !nonempty(snapshot?.id) || !nonempty(fragment?.id)) return false;
  if (!validSha256(snapshot?.sha256) || !validSha256(fragment?.content_sha256)) return false;
  if (snapshot?.source_id !== source.id ||
      fragment?.source_id !== source.id ||
      approval?.source_id !== source.id ||
      fragment?.snapshot_id !== snapshot.id ||
      approval?.snapshot_id !== snapshot.id ||
      approval?.fragment_id !== fragment.id) return false;
  if (approval?.snapshot_sha256 !== snapshot.sha256 ||
      approval?.fragment_sha256 !== fragment.content_sha256) return false;

  if (approval?.decision !== 'approved' ||
      approval?.public_excerpt_authorized !== true ||
      approval?.scope !== 'public_excerpt' ||
      !notRevoked(approval)) return false;
  if (!validTime(approval?.approved_at) || !validTime(approval?.expires_at) ||
      Date.parse(approval.approved_at) > at ||
      Date.parse(approval.expires_at) <= at) return false;

  if (!nonempty(reviewer?.authenticated_user_id) ||
      reviewer?.independently_authorized !== true ||
      reviewer?.trusted_identity_verified !== true ||
      approval?.reviewer_user_id !== reviewer.authenticated_user_id ||
      !nonempty(approval?.submitted_by_user_id) ||
      approval.submitted_by_user_id === reviewer.authenticated_user_id) return false;

  if (!validSha256(approval?.rights_evidence_sha256) ||
      evidence?.sha256 !== approval.rights_evidence_sha256 ||
      evidence?.bytes_verified !== true ||
      evidence?.rights_scope !== 'public_excerpt' ||
      evidence?.source_id !== source.id ||
      evidence?.snapshot_sha256 !== snapshot.sha256 ||
      evidence?.fragment_sha256 !== fragment.content_sha256 ||
      !nonempty(evidence?.immutable_ref) ||
      !nonempty(evidence?.verified_by_user_id) ||
      evidence?.verified_by_user_id === approval.submitted_by_user_id ||
      !notRevoked(evidence)) return false;
  if (!validTime(evidence?.verified_at) ||
      Date.parse(evidence.verified_at) > at ||
      !validTime(evidence?.expires_at) ||
      Date.parse(evidence.expires_at) <= at) return false;
  return true;
}
