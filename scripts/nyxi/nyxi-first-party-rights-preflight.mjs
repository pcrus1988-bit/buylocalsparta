import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_KEYS = new Set(['body_text', 'excerpt', 'raw_html', 'private_fragment', 'original_bytes', 'search_text']);

function safeObject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + ' must be an object');
  for (const key of Object.keys(value)) if (CONTENT_KEYS.has(key)) throw new TypeError(name + ' must not contain private content');
}
function httpsHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return null;
    return parsed.hostname.toLowerCase();
  } catch { return null; }
}
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(value);
}

/**
 * Advisory, offline and fail-closed. Evidence bytes MUST come from an independently
 * authorized first-party retrieval, not a JSON field claiming they were verified.
 * A PASS is only a candidate for authenticated human review, NEVER an authorization.
 */
export function firstPartyRightsPreflight({ source, approval, policyEvidence, policyBytes, now } = {}) {
  for (const [key, value] of Object.entries({ source, approval, policyEvidence })) safeObject(key, value);
  if (policyBytes !== undefined && !(policyBytes instanceof Uint8Array)) throw new TypeError('policyBytes must be Uint8Array');
  const failures = [];
  const reject = (condition, code) => { if (!condition) failures.push(code); };
  const sourceHost = httpsHost(source.canonical_url);
  const assetHost = httpsHost(approval.asset_url);
  const finalHost = httpsHost(approval.approved_final_url);
  const policyHost = httpsHost(approval.rights_policy_url);
  const evidenceHost = httpsHost(policyEvidence.policy_url);
  const nowMs = now === undefined ? Date.now() : time(now);
  reject(Number.isFinite(nowMs), 'INVALID_NOW');
  reject(UUID.test(source.id ?? '') && source.status === 'active', 'SOURCE_NOT_ACTIVE');
  reject(sourceHost && sourceHost === assetHost && assetHost === finalHost, 'NOT_EXACT_FIRST_PARTY_ASSET');
  reject(policyHost && policyHost === evidenceHost && policyHost === sourceHost, 'POLICY_URL_SCOPE');
  reject(UUID.test(approval.id ?? '') && approval.source_id === source.id && approval.acquisition_authorized === true, 'APPROVAL_BINDING');
  reject(approval.mirror_authorized === false, 'MIRROR_NOT_PROHIBITED');
  reject(typeof approval.approved_by === 'string' && approval.approved_by.trim().length > 2 && !/agent|bot|automation|worker/i.test(approval.approved_by), 'NONHUMAN_APPROVAL');
  reject(Number.isFinite(time(approval.expires_at)) && time(approval.expires_at) > nowMs, 'APPROVAL_EXPIRED');
  reject(Number.isFinite(time(approval.review_due_at)) && time(approval.review_due_at) > nowMs, 'REVIEW_OVERDUE');
  reject(Number.isFinite(time(approval.retention_until)) && time(approval.retention_until) > nowMs, 'RETENTION_UNSPECIFIED_OR_EXPIRED');
  reject(policyEvidence.source_id === source.id && policyEvidence.asset_approval_id === approval.id, 'EVIDENCE_BINDING');
  reject(policyEvidence.scope === 'original_first_party_html_only', 'REUSE_SCOPE_NOT_EXACT');
  reject(policyEvidence.storage_bucket === 'nyxi-evidence' && typeof policyEvidence.storage_path === 'string' && policyEvidence.storage_path.startsWith('rights/' + source.id + '/') && !policyEvidence.storage_path.includes('..'), 'IMMUTABLE_PRIVATE_EVIDENCE_PATH');
  reject(typeof policyEvidence.reviewer_user_id === 'string' && UUID.test(policyEvidence.reviewer_user_id) && policyEvidence.reviewer_user_id !== policyEvidence.collector_user_id, 'REVIEWER_NOT_INDEPENDENT');
  reject(policyEvidence.revoked_at == null, 'RIGHTS_EVIDENCE_REVOKED');
  const digest = policyBytes === undefined ? null : createHash('sha256').update(policyBytes).digest('hex');
  reject(policyBytes !== undefined && policyBytes.byteLength > 0 && SHA256.test(policyEvidence.sha256 ?? '') && digest === policyEvidence.sha256, 'POLICY_ORIGINAL_BYTES_NOT_VERIFIED');
  const result = {
    source_id: source.id,
    asset_approval_id: approval.id,
    policy_sha256: SHA256.test(policyEvidence.sha256 ?? '') ? policyEvidence.sha256 : null,
    original_policy_bytes_verified: digest !== null && digest === policyEvidence.sha256,
    preflight: failures.length === 0 ? 'READY_FOR_AUTHENTICATED_HUMAN_REVIEW' : 'HOLD',
    blockers: [...new Set(failures)].sort(),
    acquisition_authorized: false,
    mirror_authorized: false,
    publication_authorized: false,
    private_fragments_exposed: false,
  };
  return Object.freeze(result);
}
