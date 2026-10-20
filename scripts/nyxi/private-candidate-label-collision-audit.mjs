/**
 * NYXI Agent 3: private, review-only collision diagnostics for provisional
 * cosmetics ontology labels. Similar text is NOT identity equivalence.
 * Never use this output to merge records, approve claims, or publish evidence.
 */
import { validatePrivateCandidateGraph } from './private-candidate-graph.mjs';

const KINDS = Object.freeze(['manufacturer', 'brand', 'family', 'product', 'shade', 'inci']);

/**
 * Return aggregate counts only. No candidate IDs, labels, source IDs, parent
 * keys, INCI declarations, or evidence excerpts leave this private audit.
 * NFKC + lowercase + Greek final-sigma folding are review heuristics;
 * no equivalence, authenticity, or canonical identity is established.
 */
export function auditPrivateCandidateLabelCollisions(candidates) {
  // Fail closed on input shape, ancestry, source isolation and forged approvals.
  const graph = validatePrivateCandidateGraph(candidates);
  const groups = new Map();
  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const normalized = row.display_label.normalize('NFKC')
      .trim().replace(/\s+/gu, ' ').toLowerCase().replace(/\u03c2/gu, '\u03c3');
    // The graph validator ensures original nonempty labels, but compatibility
    // normalization can still erase some characters in surprising ways.
    if (!normalized) throw new TypeError('EMPTY_NORMALIZED_LABEL');
    const scope = JSON.stringify([
      row.source_id.toLowerCase(), row.kind, row.parent_key, normalized,
    ]);
    const prior = groups.get(scope);
    if (prior) prior.count++;
    else groups.set(scope, { kind: row.kind, count: 1 });
  }
  const byKind = Object.fromEntries(KINDS.map(kind => [kind, 0]));
  let collisionGroups = 0;
  let collisionCandidates = 0;
  for (const group of groups.values()) {
    if (group.count < 2) continue;
    collisionGroups++;
    collisionCandidates += group.count;
    byKind[group.kind]++;
  }
  return Object.freeze({
    schema_version: 'nyxi-private-label-collision-audit-v1',
    candidate_count: graph.candidate_count,
    collision_group_count: collisionGroups,
    collision_candidate_count: collisionCandidates,
    collision_groups_by_kind: Object.freeze(byKind),
    review_required: collisionGroups > 0,
    identity_equivalence_established: false,
    canonical_merge_allowed: false,
    source_authenticity_verified: false,
    independently_reviewed: false,
    publication_allowed: false,
    private_only: true,
  });
}
