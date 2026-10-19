/**
 * NYXI Agent 3: private-only, source-bound INCI sequence coverage diagnostics.
 * Positional disagreement or missing ordinals are extraction/review signals,
 * never evidence of a formulation change, safety or compliance.
 * This function must only be called by an authorized private process.
 */
import { auditPrivateInciLabelEvidence } from './private-inci-label-evidence-audit.mjs';

export function auditPrivateInciSequenceCoverage(products, ingredients, snapshots, fragments, mentions) {
  // Validate every record and the full source/snapshot/fragment ancestry before
  // inspecting any candidate sequences. This validator rejects forged approval
  // flags, accessors, proxies, sparse arrays, and duplicate positions.
  const evidence = auditPrivateInciLabelEvidence(products, ingredients, snapshots, fragments, mentions);
  const groups = new Map();
  for (const row of mentions) {
    const groupKey = JSON.stringify([row.product_candidate_key, row.snapshot_id.toLowerCase()]);
    let group = groups.get(groupKey);
    if (!group) {
      group = { product: row.product_candidate_key, positions: new Map() };
      groups.set(groupKey, group);
    }
    group.positions.set(row.position, row.ingredient_candidate_key);
  }

  const byProduct = new Map();
  let sequencesWithMissingFirstPosition = 0;
  let sequencesWithInternalGaps = 0;
  for (const group of groups.values()) {
    const ordinals = [...group.positions.keys()].sort((a, b) => a - b);
    if (ordinals[0] !== 1) sequencesWithMissingFirstPosition++;
    if (ordinals.some((value, index) => index > 0 && value !== ordinals[index - 1] + 1)) sequencesWithInternalGaps++;
    let versions = byProduct.get(group.product);
    if (!versions) { versions = []; byProduct.set(group.product, versions); }
    versions.push(group.positions);
  }

  let comparedPairs = 0;
  let differingPairs = 0;
  let sharedOrdinalDisagreementPairs = 0;
  let differingOrdinalCoveragePairs = 0;
  for (const versions of byProduct.values()) {
    for (let a = 0; a < versions.length; a++) {
      for (let b = a + 1; b < versions.length; b++) {
        comparedPairs++;
        const left = versions[a], right = versions[b];
        const differentCoverage = left.size !== right.size || [...left.keys()].some(position => !right.has(position));
        const differentShared = [...left.entries()].some(([position, ingredient]) => right.has(position) && right.get(position) !== ingredient);
        if (differentCoverage) differingOrdinalCoveragePairs++;
        if (differentShared) sharedOrdinalDisagreementPairs++;
        if (differentCoverage || differentShared) differingPairs++;
      }
    }
  }

  // Deliberately no candidate keys, UUIDs, labels, ingredients or excerpts.
  return Object.freeze({
    schema_version: 'nyxi-private-inci-sequence-coverage-v1',
    product_candidate_count: evidence.product_candidate_count,
    snapshot_sequence_count: groups.size,
    sequences_missing_first_position_count: sequencesWithMissingFirstPosition,
    sequences_with_internal_gaps_count: sequencesWithInternalGaps,
    cross_snapshot_pairs_compared_count: comparedPairs,
    cross_snapshot_pairs_with_any_disagreement_count: differingPairs,
    cross_snapshot_pairs_with_ordinal_coverage_difference_count: differingOrdinalCoveragePairs,
    cross_snapshot_pairs_with_shared_ordinal_disagreement_count: sharedOrdinalDisagreementPairs,
    ordinal_contiguity_checked: true,
    archived_bytes_verified: false,
    label_completeness_verified: false,
    label_authenticity_verified: false,
    ingredient_identity_verified: false,
    formula_change_verified: false,
    ingredient_safety_assessed: false,
    regulatory_compliance_assessed: false,
    independently_reviewed: false,
    publication_allowed: false,
    private_only: true,
  });
}
