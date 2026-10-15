// NYXI Agent 1: metadata-only rights triage. Advisory, fail-closed.
// Never treat this result as acquisition, mirroring, or publication permission.
const SHA = /^[0-9a-f]{64}$/;
const HTTPS = /^https:\/\/[^\s/?#]+(?:[^\s]*)$/i;
const hasText = x => typeof x === 'string' && x.trim().length > 0;
const validDate = x => typeof x === 'string' && Number.isFinite(Date.parse(x));

export function triageSourceRights({ source, acquisition, evidence, now = new Date().toISOString() } = {}) {
  const blockers = [];
  const humanActions = [];
  if (!source || !hasText(source.id) || !hasText(source.source_key) || !HTTPS.test(source.canonical_url ?? ''))
    blockers.push('SOURCE_IDENTITY_INVALID');
  if (!validDate(now)) blockers.push('CLOCK_INVALID');
  if (!acquisition) {
    blockers.push('ACQUISITION_RECORD_ABSENT');
    humanActions.push('INDEPENDENT_ACQUISITION_RIGHTS_REVIEW');
  } else {
    if (acquisition.source_id !== source?.id) blockers.push('ACQUISITION_SOURCE_MISMATCH');
    if (acquisition.acquisition_authorized !== true) blockers.push('ACQUISITION_NOT_AUTHORIZED');
    if (!HTTPS.test(acquisition.asset_url ?? '') || !HTTPS.test(acquisition.approved_final_url ?? '') ||
        acquisition.asset_url !== acquisition.approved_final_url || acquisition.asset_url !== source?.canonical_url)
      blockers.push('EXACT_URL_SCOPE_UNVERIFIED');
    if (!hasText(acquisition.rights_basis) || !HTTPS.test(acquisition.rights_policy_url ?? ''))
      blockers.push('RIGHTS_POLICY_REFERENCE_INCOMPLETE');
    if (!validDate(acquisition.review_due_at) || !validDate(acquisition.expires_at) ||
        (validDate(now) && (Date.parse(acquisition.review_due_at) <= Date.parse(now) ||
                            Date.parse(acquisition.expires_at) <= Date.parse(now))))
      blockers.push('ACQUISITION_REVIEW_EXPIRED_OR_UNDATED');
    if (!validDate(acquisition.retention_until)) {
      blockers.push('RETENTION_DEADLINE_ABSENT');
      humanActions.push('RETENTION_SCOPE_REVIEW');
    }
    if (acquisition.mirror_authorized !== true) blockers.push('MIRRORING_NOT_AUTHORIZED');
    if (!hasText(acquisition.approved_by) || /\b(agent|automation|bot)\b/i.test(acquisition.approved_by)) {
      blockers.push('INDEPENDENT_APPROVER_UNVERIFIED');
      humanActions.push('INDEPENDENT_HUMAN_REVIEW');
    }
  }
  if (!evidence || !SHA.test(evidence.sha256 ?? '') || evidence.independently_rehashed !== true ||
      !hasText(evidence.document_id) || !hasText(evidence.verified_by_user_id) ||
      !validDate(evidence.verified_at)) {
    blockers.push('DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED');
    humanActions.push('VERIFY_DOCUMENT_BYTES_AND_POLICY_SCOPE');
  }
  humanActions.push('SEPARATE_AGENT4_EXACT_HASH_PUBLICATION_REVIEW');
  return Object.freeze({
    source_key: hasText(source?.source_key) ? source.source_key : null,
    classification: 'HUMAN_REVIEW_REQUIRED',
    blockers: [...new Set(blockers)],
    human_actions: [...new Set(humanActions)],
    acquisition_granted: false,
    mirror_granted: false,
    publication_granted: false,
    archive_deletion_granted: false,
    public_fragment_included: false
  });
}
