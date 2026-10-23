import { createHash } from 'node:crypto';
import { observe } from './attestation-ledger.mjs';

const MAX_POLICY_BYTES = 8 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const safeHttps = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch { return false; }
};

/**
 * Metadata-only observation of exact policy-document bytes for INDEPENDENT
 * human rights review. Caller must independently archive and witness the
 * original bytes; neither acquisition approval nor a matching digest grants
 * publication rights. Never call from a browser or public route.
 */
export function observeDocumentaryRightsEvidence({
  source, approval, snapshot, policyUrl, policyBytes, observedAt
} = {}) {
  const catalog = observe({ source, approval, snapshot, observedAt });
  if (!safeHttps(policyUrl) || !safeHttps(approval?.rights_policy_url) ||
      policyUrl !== approval.rights_policy_url)
    throw Error('rights_policy_url_not_authorized');
  if (!(Buffer.isBuffer(policyBytes) || policyBytes instanceof Uint8Array) ||
      policyBytes.byteLength < 1 || policyBytes.byteLength > MAX_POLICY_BYTES)
    throw Error('invalid_rights_policy_bytes');

  const sha256 = createHash('sha256').update(policyBytes).digest('hex');
  const anchor = approval?.metadata?.rights_policy_sha256;
  if (anchor !== undefined && anchor !== null &&
      (!SHA.test(anchor) || anchor !== sha256))
    throw Error('rights_policy_anchor_conflict');

  return Object.freeze({
    evidence_type: 'documentary_rights_policy_bytes_observed',
    source_id: catalog.source_id,
    approval_id: catalog.approval_id,
    snapshot_id: catalog.snapshot_id,
    snapshot_sha256: catalog.snapshot_sha256,
    document_sha256: sha256,
    document_byte_length: policyBytes.byteLength,
    observed_at: catalog.observed_at,
    recorded_anchor_matches: anchor === sha256,
    independently_archived: false,
    independent_rights_review_complete: false,
    publication_authorized: false,
    rights_review_required: true
  });
}
