import { observe, isValidGovernanceTimestamp } from './attestation-ledger.mjs';
import { isIP } from 'node:net';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const validDate = isValidGovernanceTimestamp;
const isPublicHttpsMetadata = value => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    // Metadata-only guard: a network worker must ALSO check resolved IPs,
    // redirects, access terms and DNS rebinding before any actual fetch.
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.hash && host.includes('.') &&
      !isIP(host.replace(/^\[|\]$/g, '')) &&
      !['.localhost', '.local', '.localdomain', '.internal'].some(s => host.endsWith(s));
  } catch { return false; }
};
const safeHttps = isPublicHttpsMetadata;
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
  // Source registrations without acquisition approval are still reviewed. Do
  // not allow alias keys or URL spelling differences to hide duplicate assets.
  const sourceKeys = new Set(), canonicalUrls = new Set();
  const capturesBeyondRetention = new Set();
  // One SHA-256 digest describes one byte stream. Distinct byte lengths under
  // that digest are contradictory metadata even across separate snapshot IDs.
  const hashByteLengths = new Map(), hashSourceIds = new Map(), hashApprovalIds = new Map();
  for (const source of sources) {
    if (!UUID.test(source?.id || '') || sourceMap.has(source.id))
      throw Error('invalid_or_duplicate_source');
    // Normalize only URL identity (host case, default HTTPS port, etc.).
    // This is metadata validation, not a network request or rights decision.
    if (!safeHttps(source.canonical_url)) throw Error('invalid_source_canonical_url');
    const canonicalUrl = new URL(source.canonical_url).href;
    if (canonicalUrls.has(canonicalUrl)) throw Error('duplicate_source_canonical_url');
    canonicalUrls.add(canonicalUrl);
    // An explicitly malformed or blank key must not evade deduplication.
    // Older metadata-only callers may omit the key; never treat a supplied
    // empty/non-string key as a distinct source identity.
    if (source.source_key !== undefined &&
        (typeof source.source_key !== 'string' || !source.source_key.trim()))
      throw Error('invalid_source_key');
    if (typeof source.source_key === 'string') {
      const key = source.source_key.trim().toLowerCase();
      if (sourceKeys.has(key)) throw Error('duplicate_source_key');
      sourceKeys.add(key);
    }
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
    if (validDate(approval.retention_until) &&
        Date.parse(snapshot.fetched_at) > Date.parse(approval.retention_until))
      capturesBeyondRetention.add(approvalId);
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
    // Preserve the more specific immutable-UUID error before evaluating
    // cross-snapshot content consistency.
    const recordedLength = hashByteLengths.get(event.snapshot_sha256);
    if (recordedLength !== undefined && recordedLength !== event.byte_length)
      throw Error('conflicting_content_hash_byte_length');
    hashByteLengths.set(event.snapshot_sha256, event.byte_length);
    if (!hashSourceIds.has(event.snapshot_sha256)) hashSourceIds.set(event.snapshot_sha256, new Set());
    hashSourceIds.get(event.snapshot_sha256).add(event.source_id);
    if (!hashApprovalIds.has(event.snapshot_sha256)) hashApprovalIds.set(event.snapshot_sha256, new Set());
    hashApprovalIds.get(event.snapshot_sha256).add(event.approval_id);
    items.set(event.snapshot_id, {
      identity,
      item: Object.freeze({
        snapshot_id: event.snapshot_id,
        snapshot_sha256: event.snapshot_sha256,
        byte_length: event.byte_length
      })
    });
  }

  // Shared bytes do not transfer licensing rights between publishers.
  // Preserve both snapshot identities, but require separate scope review.
  const sharedAcrossSources = new Set([...hashSourceIds]
    .filter(([, sourceIds]) => sourceIds.size > 1).map(([hash]) => hash));
  // Even one publisher can authorize distinct assets under different terms.
  // Equal bytes under different approvals must not silently share rights scope.
  const sharedAcrossApprovals = new Set([...hashApprovalIds]
    .filter(([, approvalIds]) => approvalIds.size > 1).map(([hash]) => hash));
  const queue = stable([...approvalMap.values()].map(approval => {
    const items = [...grouped.get(approval.id).values()]
      .map(x => x.item).sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));
    const reasons = [];
    const source = sourceMap.get(approval.source_id);
    // An authorization flag alone must not place an uncaptured asset on an
    // acquisition worklist. Validate the exact approved source URL and current
    // authorization window even when no archived snapshot exists to bind().
    if (!safeHttps(approval.asset_url) || approval.asset_url !== source.canonical_url)
      reasons.push('approved_asset_source_url_mismatch');
    if (!safeHttps(approval.approved_final_url || approval.asset_url))
      reasons.push('approved_final_url_missing_or_invalid');
    if (!validDate(approval.approved_at))
      reasons.push('acquisition_start_missing_or_invalid');
    else if (Date.parse(observedAt) < Date.parse(approval.approved_at))
      reasons.push('acquisition_authorization_not_yet_active');
    if (validDate(approval.approved_at) && validDate(approval.expires_at) &&
        Date.parse(approval.expires_at) <= Date.parse(approval.approved_at))
      reasons.push('acquisition_window_invalid');
    if (items.some(item => sharedAcrossSources.has(item.snapshot_sha256)))
      reasons.push('shared_content_hash_across_sources_scope_review_required');
    if (items.some(item => sharedAcrossApprovals.has(item.snapshot_sha256)))
      reasons.push('shared_content_hash_across_approvals_scope_review_required');
    if (approval.acquisition_authorized !== true) reasons.push('acquisition_not_authorized');
    if (!safeHttps(approval.rights_policy_url))
      reasons.push('missing_or_invalid_policy_url');
    if (!validDate(approval.retention_until)) reasons.push('retention_deadline_missing');
    else if (Date.parse(observedAt) >= Date.parse(approval.retention_until))
      reasons.push('retention_deadline_expired');
    if (capturesBeyondRetention.has(approval.id))
      reasons.push('retention_deadline_precedes_capture');
    // Review cadence and acquisition expiry are separate from the legal
    // publication-rights decision. Flag them for humans; never auto-renew.
    if (!validDate(approval.review_due_at))
      reasons.push('rights_review_due_date_missing_or_invalid');
    else if (Date.parse(observedAt) >= Date.parse(approval.review_due_at))
      reasons.push('rights_review_overdue');
    if (!validDate(approval.expires_at))
      reasons.push('acquisition_expiry_missing_or_invalid');
    else if (Date.parse(observedAt) >= Date.parse(approval.expires_at))
      reasons.push('acquisition_authorization_expired_for_new_captures');
    if (!SHA.test(approval.metadata?.rights_policy_sha256 || ''))
      reasons.push('documentary_rights_anchor_missing_or_invalid');
    // A metadata-only candidate is NOT an instruction to fetch, and never
    // establishes rights to redistribute or publish. Network, terms, rate
    // limits, and independent rights checks remain external responsibilities.
    const captureBlockers = new Set([
      'acquisition_not_authorized', 'approved_asset_source_url_mismatch',
      'approved_final_url_missing_or_invalid', 'missing_or_invalid_policy_url',
      'acquisition_start_missing_or_invalid',
      'acquisition_authorization_not_yet_active', 'acquisition_window_invalid',
      'acquisition_expiry_missing_or_invalid',
      'acquisition_authorization_expired_for_new_captures',
      'retention_deadline_missing', 'retention_deadline_expired',
      'rights_review_due_date_missing_or_invalid', 'rights_review_overdue'
    ]);
    const uncapturedMetadataEligible = items.length === 0 &&
      !reasons.some(reason => captureBlockers.has(reason));
    // These cannot be satisfied by caller-supplied JSON flags.
    reasons.push('independent_documentary_witness_required',
      'independent_original_byte_attestation_required',
      'independent_human_publication_review_required');
    return Object.freeze({
      id: approval.id, source_id: approval.source_id,
      snapshot_count: items.length,
      snapshots: Object.freeze(items),
      uncaptured_acquisition_metadata_eligible: uncapturedMetadataEligible,
      blockers: Object.freeze(reasons),
      review_status: 'hold',
      publication_authorized: false
    });
  }));
  // Registered sources with no independently authorized acquisition must not
  // disappear merely because this queue is grouped by acquisition approvals.
  // Report only immutable source IDs: no URLs, document text or private paths.
  const authorizedSourceIds = new Set([...approvalMap.values()]
    .filter(approval => approval.acquisition_authorized === true)
    .map(approval => approval.source_id));
  const sourcesWithoutAuthorizedAcquisition = Object.freeze([...sourceMap.keys()]
    .filter(sourceId => !authorizedSourceIds.has(sourceId))
    .sort());
  // Absence of an archive is distinct from absence of acquisition permission.
  // These lists are metadata-only worklists, NOT instructions to fetch assets.
  const archivedSourceIds = new Set(snapshots.map(snapshot => snapshot.source_id));
  const sourcesWithoutArchivedSnapshots = Object.freeze([...sourceMap.keys()]
    .filter(sourceId => !archivedSourceIds.has(sourceId))
    .sort());
  const authorizedUncapturedApprovalIds = Object.freeze([...approvalMap.values()]
    .filter(approval => approval.acquisition_authorized === true &&
      grouped.get(approval.id).size === 0)
    .map(approval => approval.id).sort());

  const metadataEligibleUncapturedApprovalIds = Object.freeze(queue
    .filter(entry => entry.uncaptured_acquisition_metadata_eligible)
    .map(entry => entry.id).sort());

  return Object.freeze({
    observed_at: observedAt,
    source_count: sourceMap.size,
    sources_without_authorized_acquisition_count: sourcesWithoutAuthorizedAcquisition.length,
    sources_without_authorized_acquisition_ids: sourcesWithoutAuthorizedAcquisition,
    sources_without_archived_snapshots_count: sourcesWithoutArchivedSnapshots.length,
    sources_without_archived_snapshots_ids: sourcesWithoutArchivedSnapshots,
    authorized_uncaptured_approval_count: authorizedUncapturedApprovalIds.length,
    authorized_uncaptured_approval_ids: authorizedUncapturedApprovalIds,
    // Strict subset: metadata-eligible only, NOT a fetch/publication grant.
    metadata_eligible_uncaptured_approval_count: metadataEligibleUncapturedApprovalIds.length,
    metadata_eligible_uncaptured_approval_ids: metadataEligibleUncapturedApprovalIds,
    approval_count: queue.length,
    snapshot_count: queue.reduce((n, item) => n + item.snapshot_count, 0),
    publication_authorized: false,
    entries: Object.freeze(queue)
  });
}
