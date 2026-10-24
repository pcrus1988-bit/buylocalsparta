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
  // Bound the total bytes handed to the private verifier, not just each
  // individual object. Repeated identical snapshot IDs count only once.
  let plannedBytes = 0;
  const hashByteLengths = new Map();
  // A UUID is a global identity, not merely a key local to one snapshot.
  // Reject a mixed batch that rebinds one source or approval ID to another
  // URL, source, authorization scope or capture window. Every individual
  // record could otherwise pass observe() while the batch contradicts itself.
  const sourceIdentities = new Map(), approvalIdentities = new Map();
  // Canonical URL is a source identity across UUIDs too. A duplicate URL
  // cannot silently inherit a separate acquisition approval in one batch.
  const canonicalSourceIds = new Map();
  for (const record of records) {
    if (!plain(record) || !plain(record.source) || !plain(record.approval) ||
        !plain(record.snapshot) || !plain(record.snapshot.provenance))
      throw Error('invalid_attestation_record');
    const { source, approval, snapshot } = record;
    const event = observe({ source, approval, snapshot, observedAt });
    if (snapshot.byte_length > maxBytes) throw Error('archive_exceeds_size_limit');

    const sourceIdentity = source.canonical_url;
    const knownSource = sourceIdentities.get(source.id);
    if (knownSource !== undefined && knownSource !== sourceIdentity)
      throw Error('conflicting_source_identity');
    sourceIdentities.set(source.id, sourceIdentity);
    const canonicalUrl = new URL(source.canonical_url).href;
    const knownUrlOwner = canonicalSourceIds.get(canonicalUrl);
    if (knownUrlOwner !== undefined && knownUrlOwner !== source.id)
      throw Error('duplicate_source_canonical_url');
    canonicalSourceIds.set(canonicalUrl, source.id);

    // One approval UUID cannot carry conflicting rights or retention scope
    // inside a batch, even if both snapshots independently pass capture checks.
    // The digest is evidence metadata, NEVER a publication-rights grant.
    const approvalIdentity = JSON.stringify([
      approval.source_id, approval.asset_url, approval.approved_final_url,
      approval.approved_at, approval.expires_at, approval.acquisition_authorized,
      approval.rights_basis, approval.rights_policy_url, approval.attribution,
      approval.retention_policy, approval.retention_until, approval.approved_by,
      approval.review_due_at, approval.mirror_authorized,
      approval.acquisition_method, approval.asset_kind,
      approval.metadata?.rights_policy_sha256
    ]);
    const knownApproval = approvalIdentities.get(approval.id);
    if (knownApproval !== undefined && knownApproval !== approvalIdentity)
      throw Error('conflicting_approval_identity');
    approvalIdentities.set(approval.id, approvalIdentity);

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
    // SHA-256 identifies one exact byte stream, including its length.
    // Contradictory catalog sizes must fail before any Storage work begins.
    const knownLength = hashByteLengths.get(snapshot.sha256);
    if (knownLength !== undefined && knownLength !== snapshot.byte_length)
      throw Error('conflicting_content_hash_byte_length');
    hashByteLengths.set(snapshot.sha256, snapshot.byte_length);
    plannedBytes += snapshot.byte_length;
    if (plannedBytes > maxBytes) throw Error('attestation_batch_total_bytes_exceeded');
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
