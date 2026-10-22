// Metadata-only reviewer routing. No network calls, no rights grants.
// Different origins can legitimately share a publisher or licensing policy;
// that relationship must be established by independent documentary review.
import { isIP } from 'node:net';
const SHA256 = /^[a-f0-9]{64}$/;
function origin(value) {
  try {
    if (typeof value !== 'string') return null;
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || u.toString() !== value) return null;
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host.includes('.') || isIP(host) || /(^|\.)(localhost|local|internal|test|invalid|example|onion|lan|home|corp)$/.test(host)) return null;
    return u.origin;
  } catch { return null; }
}
export function triagePolicyReference({ sourceUrl, policyUrl, evidenceHash } = {}) {
  const sourceOrigin = origin(sourceUrl), policyOrigin = origin(policyUrl);
  const blockers = [];
  if (!sourceOrigin || !policyOrigin) blockers.push('INVALID_OR_UNSAFE_HTTPS_REFERENCE');
  else if (sourceOrigin !== policyOrigin) blockers.push('CROSS_ORIGIN_SCOPE_REQUIRES_HUMAN_REVIEW');
  if (!SHA256.test(evidenceHash ?? '')) blockers.push('DOCUMENTARY_EVIDENCE_HASH_MISSING');
  // Even a syntactically valid evidence hash does NOT prove original bytes,
  // publication rights, reviewer identity, or policy applicability.
  blockers.push('INDEPENDENT_AUTHENTICATED_REVIEW_REQUIRED');
  return Object.freeze({
    status: 'HOLD',
    source_origin: sourceOrigin,
    policy_origin: policyOrigin,
    blockers: Object.freeze(blockers),
    acquisition_authorized: false,
    mirror_authorized: false,
    publication_authorized: false,
    delete_authorized: false
  });
}
