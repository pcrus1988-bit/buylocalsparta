import { observe } from './attestation-ledger.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const safeHttps = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) &&
      !url.username && !url.password && !url.hash;
  } catch { return false; }
};
const stable = rows => rows.sort((a, b) => a.id.localeCompare(b.id));

/**
 * Metadata-only, deterministic HUMAN review queue. No rights are inferred
 * from an acquisition approval, policy URL, recorded digest or caller flag.
 * Original-byte and documentary evidence must be verified by separate trusted
 * workers, with independent reviewer decisions in the protected publication gate.
 *
 * Never include Storage paths, policy contents, excerpts or private bytes.
 */
export function buildRightsReviewQueue({ sources, approvals, snapshots, observedAt } = {}) {
  if (![sources, approvals, snapshots].every(Array.isArray) || !validDate(observedAt))
    throw Error('invalid_review_queue_input');
  if (sources.length > 10000 || approvals.length > 10000 || snapshots.length > 100000)
    throw Error('review_queue_limit_exceeded');

  const sourceMap = new Map(), approvalMap = new Map(), grouped = new Map(), globalSnapshotIds = new Map();
  for (const source of sources) {
    if (!UUID.test(source?.id || '') || sourceMap.has(source.id))
      throw Error('invalid_or_duplicate_source');
    sourceMap.set(source.id, source);
  }
  for (const approval of approvals) {
    if (!UUID.test(approval?.id || '') || approvalMap.has(approval.id) ||
        !sourceMap.has(approval.source_id))
      throw Error('invalid_or_duplicate_approval');
    approvalMap.set(approval.id, approval);
    grouped.set(approval.id, new Map());
  }
  for (const snapshot of snapshots) {
    const approvalId = snapshot?.provenance?.asset_approval_id;
    const approval = approvalMap.get(approvalId);
    const source = sourceMap.get(snapshot?.source_id);
    if (!approval || !source) throw Error('unbound_snapshot');
    // Reuse the same exact historical authorization and private-path validation
    // as the original-byte verification bridge. No Storage fetch occurs.
    const event = observe({ source, approval, snapshot, observedAt });
    const items = grouped.get(approvalId);
    const identity = [event.source_id, event.approval_id, event.snapshot_sha256,
      event.byte_length, event.fetched_at, snapshot.storage_bucket,
      snapshot.storage_path, snapshot.final_url].join('|');
    // Snapshot UUIDs are globally unique, not merely unique within an
    // acquisition approval. A second approval cannot rebind an archived ID.
    const globalIdentity = globalSnapshotIds.get(event.snapshot_id);
    if (globalIdentity !== undefined && globalIdentity !== identity)
      throw Error('conflicting_snapshot_identity');
    globalSnapshotIds.set(event.snapshot_id, identity);
    const previous = items.get(event.snapshot_id);
    if (previous && previous.identity !== identity)
      throw Error('conflicting_snapshot_identity');
    items.set(event.snapshot_id, {
      identity,
      item: Object.freeze({
        snapshot_id: event.snapshot_id,
        snapshot_sha256: event.snapshot_sha256,
        byte_length: event.byte_length
      })
    });
  }

  const queue = stable([...approvalMap.values()].map(approval => {
    const items = [...grouped.get(approval.id).values()]
      .map(x => x.item).sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));
    const reasons = [];
    if (approval.acquisition_authorized !== true) reasons.push('acquisition_not_authorized');
    if (!safeHttps(approval.rights_policy_url))
      reasons.push('missing_or_invalid_policy_url');
    if (!validDate(approval.retention_until)) reasons.push('retention_deadline_missing');
    else if (Date.parse(observedAt) >= Date.parse(approval.retention_until))
      reasons.push('retention_deadline_expired');
    if (validDate(approval.retention_until) && items.length && snapshots.some(s => s.provenance?.asset_approval_id === approval.id &&
      Date.parse(s.fetched_at) > Date.parse(approval.retention_until)))
      reasons.push('retention_deadline_precedes_capture');
    if (!SHA.test(approval.metadata?.rights_policy_sha256 || ''))
      reasons.push('documentary_rights_anchor_missing_or_invalid');
    // These cannot be satisfied by caller-supplied JSON flags.
    reasons.push('independent_documentary_witness_required',
      'independent_original_byte_attestation_required',
      'independent_human_publication_review_required');
    return Object.freeze({
      id: approval.id, source_id: approval.source_id,
      snapshot_count: items.length,
      snapshots: Object.freeze(items),
      blockers: Object.freeze(reasons),
      review_status: 'hold',
      publication_authorized: false
    });
  }));
  return Object.freeze({
    observed_at: observedAt,
    approval_count: queue.length,
    snapshot_count: queue.reduce((n, item) => n + item.snapshot_count, 0),
    publication_authorized: false,
    entries: Object.freeze(queue)
  });
}
