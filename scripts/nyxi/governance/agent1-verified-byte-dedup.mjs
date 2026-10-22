import { createHash, timingSafeEqual } from 'node:crypto';

// Advisory only. This function never grants rights, deletes archives, or exposes bytes.
const HEX = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const result = (status, candidate = false) => Object.freeze({
  status, dedup_candidate: candidate, delete_authorized: false,
  acquisition_authorized: false, publication_authorized: false,
});
const validHashes = value => Array.isArray(value) && value.every(h => typeof h === 'string' && HEX.test(h));
const validUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; }
  catch { return false; }
};
const verified = (record, bytes) => {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(record.byte_length) || record.byte_length <= 0 || bytes.byteLength !== record.byte_length) return false;
  if (!HEX.test(record.archive_sha256 ?? '')) return false;
  return timingSafeEqual(Buffer.from(digest(bytes), 'hex'), Buffer.from(record.archive_sha256, 'hex'));
};

/**
 * Compare two versions of one exact authorized first-party asset.
 * archiveBytes must be supplied from independently retrieved original Storage
 * objects, not copied from metadata. A caller's original_bytes_verified flag
 * is deliberately ignored. Fragment hashes are not publication evidence.
 */
export function classifyVerifiedBytePair(previous, current, { previousArchiveBytes, currentArchiveBytes } = {}) {
  if (!previous || !current || typeof previous !== 'object' || typeof current !== 'object' ||
      !previous.source_id || previous.source_id !== current.source_id ||
      !previous.snapshot_id || !current.snapshot_id || previous.snapshot_id === current.snapshot_id ||
      typeof previous.asset_id !== 'string' || !previous.asset_id.trim() || previous.asset_id !== current.asset_id ||
      !validUrl(previous.final_url) || previous.final_url !== current.final_url ||
      !HEX.test(previous.archive_sha256 ?? '') || !HEX.test(current.archive_sha256 ?? '') ||
      !validHashes(previous.ordered_fragment_sha256) || !validHashes(current.ordered_fragment_sha256)) {
    return result('INVALID_OR_CROSS_ASSET_METADATA');
  }
  if (!previous.ordered_fragment_sha256.length || !current.ordered_fragment_sha256.length) return result('EMPTY_EXTRACTION_REVIEW_REQUIRED');
  if (previous.parser_status !== 'complete' || current.parser_status !== 'complete' ||
      previous.extraction_status !== 'complete' || current.extraction_status !== 'complete') return result('PARSER_STATE_RECONCILIATION_REQUIRED');
  if (typeof previous.parser_version !== 'string' || !previous.parser_version.trim() || previous.parser_version !== current.parser_version) return result('PARSER_VERSION_REVIEW_REQUIRED');
  if (!verified(previous, previousArchiveBytes) || !verified(current, currentArchiveBytes)) return result('ORIGINAL_BYTES_UNVERIFIED');
  if (previous.archive_sha256 === current.archive_sha256) return result('IDENTICAL_VERIFIED_ORIGINAL_HASH');
  const a = previous.ordered_fragment_sha256, b = current.ordered_fragment_sha256;
  const same = a.length === b.length && a.every((hash, i) => hash === b[i]);
  return result(same ? 'VERIFIED_PARSER_EQUIVALENCE_CANDIDATE' : 'CHANGED_FRAGMENT_SEQUENCE', same);
}
