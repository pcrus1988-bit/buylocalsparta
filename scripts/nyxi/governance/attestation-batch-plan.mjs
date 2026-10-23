import { observe } from './attestation-ledger.mjs';

const MAX_BATCH = 1000;
const MAX_BYTES = 64 * 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' &&
  Object.getPrototypeOf(value) === Object.prototype;

/**
 * Deterministic metadata-only handoff for Agent 2 private original-byte
 * verification. Inputs MUST come from an authoritative server-side database
 * read, never from a public client. This never reads Storage, attests original
 * bytes, or grants publication rights.
 *
 * Identical snapshot IDs are deduplicated only if all immutable bindings
 * agree. Same SHA-256 across distinct snapshots is NOT merged because
 * authorization and source provenance remain snapshot-specific.
 */
export function planPrivateAttestationBatch(records, { observedAt, maxBytes = MAX_BYTES } = {}) {
  if (!Array.isArray(records) || records.length > MAX_BATCH ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES)
    throw Error('invalid_attestation_batch');

  const seen = new Map();
  for (const record of records) {
    if (!plain(record) || !plain(record.source) || !plain(record.approval) ||
        !plain(record.snapshot) || !plain(record.snapshot.provenance))
      throw Error('invalid_attestation_record');
    const { source, approval, snapshot } = record;
    const event = observe({ source, approval, snapshot, observedAt });
    if (snapshot.byte_length > maxBytes) throw Error('archive_exceeds_size_limit');

    const identity = JSON.stringify([
      source.id, source.canonical_url,
      approval.id, approval.source_id, approval.asset_url, approval.approved_final_url,
      approval.approved_at, approval.expires_at, approval.acquisition_authorized,
      snapshot.id, snapshot.source_id, snapshot.sha256, snapshot.byte_length,
      snapshot.fetched_at, snapshot.final_url, snapshot.storage_bucket,
      snapshot.storage_path, snapshot.provenance.asset_approval_id
    ]);
    const previous = seen.get(snapshot.id);
    if (previous) {
      if (previous.identity !== identity) throw Error('duplicate_snapshot_identity_conflict');
      continue;
    }
    seen.set(snapshot.id, {
      identity,
      handoff: Object.freeze({
        snapshot_id: event.snapshot_id,
        source_id: event.source_id,
        approval_id: event.approval_id,
        snapshot_sha256: event.snapshot_sha256,
        byte_length: event.byte_length,
        fetched_at: event.fetched_at,
        original_bytes_verified: false,
        publication_authorized: false,
        rights_review_required: true
      })
    });
  }
  return Object.freeze([...seen.values()].map(row => row.handoff)
    .sort((a,b) => a.snapshot_id.localeCompare(b.snapshot_id)));
}
