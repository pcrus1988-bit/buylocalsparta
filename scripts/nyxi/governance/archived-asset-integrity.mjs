import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validDate = value => value != null && Number.isFinite(Date.parse(value));
const validUrl = value => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash;
  } catch { return false; }
};
const buffer = value => Buffer.isBuffer(value) || value instanceof Uint8Array;

function safePath(snapshot) {
  const path = snapshot?.storage_path;
  if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') ||
      path.split('/').some(part => !part || part === '.' || part === '..')) return false;
  const parts = path.split('/');
  return parts.length >= 3 && parts[0] === snapshot.source_id &&
    parts[1] === snapshot.sha256 && parts.slice(2).every(part => !part.includes('\0'));
}

/**
 * Exact-asset audit of a previously captured private NYXI original.
 *
 * The caller must supply originalBytes obtained independently from private
 * Storage; database hashes and catalog metadata alone are not attestation.
 * A historical capture remains valid after approval expiry if it was acquired
 * inside its authorization window. This function NEVER authorizes acquisition,
 * mirrors, private publication, public excerpts, or source licensing.
 */
export function inspectArchivedAsset({ source, approval, snapshot, originalBytes,
  rightsDocumentBytes, independentlyAnchoredRightsSha256 } = {}) {
  const blockers = [];
  const warnings = [];
  if (!source || !approval || !snapshot) {
    return { original_bytes_verified: false, rights_document_verified: false,
      publication_authorized: false, blockers: ['missing_records'], warnings };
  }

  for (const [label, id] of Object.entries({
    source_id: source.id, approval_id: approval.id, snapshot_id: snapshot.id
  })) if (typeof id !== 'string' || !UUID.test(id)) blockers.push('invalid_' + label);

  if (snapshot.source_id !== source.id || approval.source_id !== source.id)
    blockers.push('source_binding_mismatch');
  if (snapshot?.provenance?.asset_approval_id !== approval.id)
    blockers.push('acquisition_binding_mismatch');

  const finalUrl = approval.approved_final_url || approval.asset_url;
  if (!validUrl(source.canonical_url) || !validUrl(approval.asset_url) ||
      !validUrl(finalUrl) || !validUrl(snapshot.final_url))
    blockers.push('invalid_https_url');
  if (approval.asset_url !== source.canonical_url ||
      snapshot.final_url !== finalUrl) blockers.push('exact_url_mismatch');

  if (approval.acquisition_authorized !== true) blockers.push('acquisition_not_authorized');
  if (!validDate(approval.approved_at) || !validDate(approval.expires_at) ||
      !validDate(snapshot.fetched_at)) blockers.push('invalid_capture_dates');
  else if (Date.parse(snapshot.fetched_at) < Date.parse(approval.approved_at) ||
           Date.parse(snapshot.fetched_at) >= Date.parse(approval.expires_at))
    blockers.push('capture_outside_authorization_window');

  if (typeof snapshot.sha256 !== 'string' || !SHA.test(snapshot.sha256))
    blockers.push('invalid_recorded_sha256');
  if (!Number.isSafeInteger(snapshot.byte_length) || snapshot.byte_length <= 0)
    blockers.push('invalid_recorded_byte_length');
  if (snapshot.storage_bucket !== 'nyxi-evidence' || !safePath(snapshot))
    blockers.push('invalid_private_storage_binding');

  if (!validDate(approval.retention_until)) warnings.push('retention_deadline_missing');
  else if (validDate(snapshot.fetched_at) &&
           Date.parse(approval.retention_until) < Date.parse(snapshot.fetched_at))
    warnings.push('retention_deadline_before_capture');

  let originalVerified = false;
  if (!buffer(originalBytes)) blockers.push('original_storage_bytes_unavailable');
  else if (snapshot.byte_length !== originalBytes.byteLength ||
           sha256(originalBytes) !== snapshot.sha256) blockers.push('original_bytes_mismatch');
  else originalVerified = true;

  let rightsVerified = false;
  if (buffer(rightsDocumentBytes) &&
      typeof independentlyAnchoredRightsSha256 === 'string' &&
      SHA.test(independentlyAnchoredRightsSha256) &&
      sha256(rightsDocumentBytes) === independentlyAnchoredRightsSha256) rightsVerified = true;
  else warnings.push('independent_rights_document_attestation_missing');

  // Verifying policy bytes proves identity only; applicability, exceptions,
  // attribution, publication scope and third-party content require a separate gate.
  return {
    original_bytes_verified: originalVerified && blockers.length === 0,
    rights_document_verified: rightsVerified,
    publication_authorized: false,
    blockers: [...new Set(blockers)].sort(),
    warnings: [...new Set(warnings)].sort(),
    evidence: originalVerified && blockers.length === 0 ? {
      snapshot_id: snapshot.id,
      source_id: source.id,
      acquisition_approval_id: approval.id,
      original_sha256: snapshot.sha256,
      original_byte_length: snapshot.byte_length,
      fetched_at: snapshot.fetched_at,
      storage_bucket: snapshot.storage_bucket,
      storage_path: snapshot.storage_path,
      rights_document_sha256: rightsVerified ? independentlyAnchoredRightsSha256 : null
    } : null
  };
}

/** Potential exact-byte repeats within one source; never delete by inference. */
export function duplicateCandidates(snapshots) {
  const groups = new Map();
  for (const s of snapshots) {
    if (!s || !UUID.test(s.source_id || '') || !SHA.test(s.sha256 || '')) continue;
    const key = s.source_id + ':' + s.sha256;
    groups.set(key, [...(groups.get(key) || []), s.id]);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ source_id: key.split(':')[0], sha256: key.split(':')[1],
      snapshot_ids: ids })).sort((a, b) => a.source_id.localeCompare(b.source_id));
}
