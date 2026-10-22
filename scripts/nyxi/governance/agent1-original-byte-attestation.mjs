import { createHash, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[a-f0-9]{64}$/;
const ASSET_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const BASENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/;

const noGrants = {
  acquisition_authorized: false,
  mirror_authorized: false,
  publication_authorized: false,
  deletion_authorized: false,
};
const recordResult = (id, state, reason, duplicateOf = null) => Object.freeze({
  snapshot_id: typeof id === 'string' ? id : null,
  state, reason, duplicate_of_snapshot_id: duplicateOf,
  ...noGrants,
});

/**
 * Independently check original archive bytes supplied by an authorized private
 * Storage reader. Database metadata, catalog sizes, and fragment digests alone
 * cannot satisfy this contract. This function never fetches, writes, grants
 * rights, deletes or publishes. Results contain identifiers only, not content.
 */
export function attestOriginalArchiveBatch(records) {
  if (!Array.isArray(records)) throw new TypeError('Expected archive records array');
  const seenSnapshots = new Set();
  const verifiedByExactAssetAndHash = new Map();
  const results = [];
  for (const record of records) {
    const r = record && typeof record === 'object' ? record : {};
    const { snapshot_id: id, source_id: source, acquisition_id: acquisition,
      asset_id: asset, sha256: sha, byte_length: length,
      storage_bucket: bucket, storage_path: path, archiveBytes: bytes } = r;
    if (!UUID.test(id ?? '') || !UUID.test(source ?? '') || !UUID.test(acquisition ?? '') ||
        !ASSET_ID.test(asset ?? '') || !HEX.test(sha ?? '') ||
        !Number.isSafeInteger(length) || length <= 0 || bucket !== 'nyxi-evidence' ||
        typeof path !== 'string' || !path.startsWith(`${source}/${sha}/`) ||
        !BASENAME.test(path.slice(`${source}/${sha}/`.length))) {
      results.push(recordResult(id, 'HOLD', 'INVALID_EXACT_ASSET_METADATA'));
      continue;
    }
    if (seenSnapshots.has(id)) {
      results.push(recordResult(id, 'HOLD', 'DUPLICATE_SNAPSHOT_ID'));
      continue;
    }
    seenSnapshots.add(id);
    if (!(bytes instanceof Uint8Array)) {
      results.push(recordResult(id, 'HOLD', 'ORIGINAL_BYTES_NOT_SUPPLIED'));
      continue;
    }
    if (bytes.byteLength !== length) {
      results.push(recordResult(id, 'HOLD', 'ORIGINAL_BYTE_LENGTH_MISMATCH'));
      continue;
    }
    const digest = createHash('sha256').update(bytes).digest();
    if (!timingSafeEqual(digest, Buffer.from(sha, 'hex'))) {
      results.push(recordResult(id, 'HOLD', 'ORIGINAL_SHA256_MISMATCH'));
      continue;
    }
    const key = JSON.stringify([source, acquisition, asset, sha]);
    const previous = verifiedByExactAssetAndHash.get(key);
    results.push(recordResult(id, 'ORIGINAL_BYTES_VERIFIED',
      previous ? 'SAME_EXACT_ASSET_HASH_DEDUP_CANDIDATE' : 'MATCHED_SHA256_AND_LENGTH',
      previous ?? null));
    if (!previous) verifiedByExactAssetAndHash.set(key, id);
  }
  return Object.freeze({
    total: results.length,
    verified: results.filter(x => x.state === 'ORIGINAL_BYTES_VERIFIED').length,
    held: results.filter(x => x.state === 'HOLD').length,
    dedup_candidates: results.filter(x => x.duplicate_of_snapshot_id !== null).length,
    results: Object.freeze(results),
    ...noGrants,
  });
}
