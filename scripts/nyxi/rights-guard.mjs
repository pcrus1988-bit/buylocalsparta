// ADVISORY PREFLIGHT ONLY. This helper NEVER grants publication rights.
// Production must enforce authenticated independent human review, verified
// rights-evidence bytes, RLS, exact asset binding, revocation, and audit logs.
export const validSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const notRevoked = value => value != null && value.revoked_at == null && value.retracted_at == null;

// Reject JS Date.parse normalization of nonexistent dates, ambiguous timezones,
// malformed offsets, and 1900/2100 century leap-year errors.
export function parseStrictInstant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, ys, mos, ds, hs, mis, ss, frac = '0', zone] = match;
  const [year, month, day, hour, minute, second] = [ys, mos, ds, hs, mis, ss].map(Number);
  if (year < 1000 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) return null;
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const zh = Number(zone.slice(1, 3)), zm = Number(zone.slice(4, 6));
    if (zh > 14 || zm > 59 || (zh === 14 && zm !== 0)) return null;
    offsetMinutes = (zone[0] === '+' ? 1 : -1) * (zh * 60 + zm);
  }
  const instant = Date.UTC(year, month - 1, day, hour, minute, second, Number(frac.padEnd(3, '0'))) - offsetMinutes * 60000;
  return Number.isFinite(instant) ? instant : null;
}

export function publicExcerptEligible({ source, snapshot, fragment, approval, reviewer, evidence, now } = {}) {
  const at = parseStrictInstant(now);
  if (at == null) return false;
  if (![source, snapshot, fragment, approval, reviewer, evidence].every(notRevoked)) return false;
  if (source.status !== 'active' || !nonempty(source.id) || !nonempty(snapshot.id) || !nonempty(fragment.id)) return false;
  if (!validSha256(snapshot.sha256) || !validSha256(fragment.content_sha256)) return false;
  if (snapshot.source_id !== source.id || fragment.source_id !== source.id ||
      fragment.snapshot_id !== snapshot.id || approval.source_id !== source.id ||
      approval.snapshot_id !== snapshot.id || approval.fragment_id !== fragment.id ||
      approval.snapshot_sha256 !== snapshot.sha256 || approval.fragment_sha256 !== fragment.content_sha256) return false;
  if (approval.decision !== 'approved' || approval.public_excerpt_authorized !== true ||
      approval.scope !== 'public_excerpt') return false;
  const approved = parseStrictInstant(approval.approved_at);
  const approvalExpires = parseStrictInstant(approval.expires_at);
  const verified = parseStrictInstant(evidence.verified_at);
  const evidenceExpires = parseStrictInstant(evidence.expires_at);
  const reviewerAdded = parseStrictInstant(reviewer.added_at);
  if ([approved, approvalExpires, verified, evidenceExpires, reviewerAdded].some(v => v == null)) return false;
  if (verified > approved || reviewerAdded > approved || approved > at ||
      approvalExpires <= approved || approvalExpires <= at ||
      evidenceExpires <= approved || evidenceExpires <= at) return false;
  if (reviewer.disabled_at != null || reviewer.role !== 'rights_reviewer' ||
      !nonempty(reviewer.authenticated_user_id) ||
      reviewer.independently_authorized !== true || reviewer.trusted_identity_verified !== true ||
      approval.reviewer_user_id !== reviewer.authenticated_user_id ||
      !nonempty(approval.submitted_by_user_id) ||
      approval.submitted_by_user_id === reviewer.authenticated_user_id) return false;
  if (!validSha256(approval.rights_evidence_sha256) || evidence.sha256 !== approval.rights_evidence_sha256 ||
      evidence.bytes_verified !== true || evidence.rights_scope !== 'public_excerpt' ||
      evidence.source_id !== source.id || evidence.snapshot_sha256 !== snapshot.sha256 ||
      evidence.fragment_sha256 !== fragment.content_sha256 ||
      !nonempty(evidence.immutable_ref) || !nonempty(evidence.verified_by_user_id) ||
      evidence.verified_by_user_id === approval.submitted_by_user_id) return false;
  return true;
}
