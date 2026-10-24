/**
 * NYXI Agent 3: synthetic-only deterministic regression coverage for private
 * source-scoped INCI sequence diagnostics. No manufacturer or formula claims.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPrivateInciSequenceCoverage as audit } from './private-inci-sequence-coverage-audit.mjs';

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const digest = n => n.toString(16).padStart(64, '0');
const key = (kind, n) => 'nyxi:v2:' + kind + ':' + digest(n);
const candidate = (candidate_key, source_id) => ({
  candidate_key, source_id, identity_status: 'source_scoped_candidate',
  independently_reviewed: false, publication_allowed: false,
});

function fixture() {
  const source = uuid(1);
  const product = key('product', 1);
  const ingredients = [key('inci', 11), key('inci', 12), key('inci', 13)];
  const snapshots = [2, 3].map((n) => ({ id: uuid(n), source_id: source, sha256: digest(n) }));
  const fragments = snapshots.map((s, index) => ({
    id: uuid(20 + index), source_id: source, snapshot_id: s.id,
    content_sha256: digest(20 + index),
  }));
  const mention = (version, position, ingredient) => ({
    product_candidate_key: product, ingredient_candidate_key: ingredients[ingredient],
    source_id: source, snapshot_id: snapshots[version].id,
    fragment_id: fragments[version].id, fragment_sha256: fragments[version].content_sha256,
    position, assertion_type: 'unreviewed_label_transcription',
  });
  return {
    products: [candidate(product, source)],
    ingredients: ingredients.map((k) => candidate(k, source)),
    snapshots, fragments,
    mentions: [mention(0, 1, 0), mention(0, 2, 1), mention(1, 1, 0), mention(1, 2, 1)],
    mention,
  };
}
const run = f => audit(f.products, f.ingredients, f.snapshots, f.fragments, f.mentions);

const noAuthority = output => {
  for (const flag of [
    'archived_bytes_verified', 'label_completeness_verified', 'label_authenticity_verified',
    'ingredient_identity_verified', 'formula_change_verified', 'ingredient_safety_assessed',
    'regulatory_compliance_assessed', 'independently_reviewed', 'publication_allowed',
  ]) assert.equal(output[flag], false, flag);
  assert.equal(output.private_only, true);
  assert.equal(Object.isFrozen(output), true);
  assert.doesNotMatch(JSON.stringify(output), /nyxi:v2:|00000000-0000-4000-8000/);
};

test('identical source-scoped versions: no drift or missing positions', () => {
  const out = run(fixture());
  assert.equal(out.snapshot_sequence_count, 2);
  assert.equal(out.cross_snapshot_pairs_compared_count, 1);
  assert.equal(out.cross_snapshot_pairs_with_any_disagreement_count, 0);
  assert.equal(out.sequences_missing_first_position_count, 0);
  assert.equal(out.sequences_with_internal_gaps_count, 0);
  noAuthority(out);
});

test('changed candidate at same ordinal: review signal, not formula-change proof', () => {
  const f = fixture();
  f.mentions[3].ingredient_candidate_key = key('inci', 13);
  const out = run(f);
  assert.equal(out.cross_snapshot_pairs_with_any_disagreement_count, 1);
  assert.equal(out.cross_snapshot_pairs_with_shared_ordinal_disagreement_count, 1);
  assert.equal(out.cross_snapshot_pairs_with_ordinal_coverage_difference_count, 0);
  noAuthority(out);
});

test('missing first ordinal and coverage mismatch are counted separately', () => {
  const f = fixture();
  f.mentions = f.mentions.filter(m => m.snapshot_id !== f.snapshots[1].id || m.position !== 1);
  const out = run(f);
  assert.equal(out.sequences_missing_first_position_count, 1);
  assert.equal(out.sequences_with_internal_gaps_count, 0);
  assert.equal(out.cross_snapshot_pairs_with_ordinal_coverage_difference_count, 1);
  assert.equal(out.cross_snapshot_pairs_with_shared_ordinal_disagreement_count, 0);
  noAuthority(out);
});

test('internal gap in second snapshot flagged without invented completeness', () => {
  const f = fixture();
  f.mentions[3].position = 3;
  const out = run(f);
  assert.equal(out.sequences_missing_first_position_count, 0);
  assert.equal(out.sequences_with_internal_gaps_count, 1);
  assert.equal(out.cross_snapshot_pairs_with_ordinal_coverage_difference_count, 1);
  noAuthority(out);
});

test('third snapshot gives exactly three unordered comparisons', () => {
  const f = fixture(), s = {id: uuid(4), source_id: uuid(1), sha256: digest(4)};
  const fr = {id: uuid(24), source_id: uuid(1), snapshot_id: s.id, content_sha256: digest(24)};
  f.snapshots.push(s); f.fragments.push(fr);
  f.mentions.push(...[1, 2].map((position) => ({
    ...f.mentions[position - 1], snapshot_id: s.id, fragment_id: fr.id,
    fragment_sha256: fr.content_sha256,
    ingredient_candidate_key: position === 2 ? key('inci', 13) : key('inci', 11),
  })));
  const out = run(f);
  assert.equal(out.cross_snapshot_pairs_compared_count, 3);
  assert.equal(out.cross_snapshot_pairs_with_any_disagreement_count, 2);
  assert.equal(out.cross_snapshot_pairs_with_shared_ordinal_disagreement_count, 2);
  noAuthority(out);
});

test('different products never enter cross-snapshot comparison', () => {
  const f = fixture(), p2 = key('product', 2);
  f.products.push(candidate(p2, uuid(1)));
  for (const m of f.mentions.filter(m => m.snapshot_id === f.snapshots[1].id)) m.product_candidate_key = p2;
  const out = run(f);
  assert.equal(out.product_candidate_count, 2);
  assert.equal(out.cross_snapshot_pairs_compared_count, 0);
  noAuthority(out);
});

test('duplicate ordinal in one product/snapshot is rejected', () => {
  const f = fixture(); f.mentions.push({...f.mentions[0]});
  assert.throws(() => run(f), /DUPLICATE_POSITION/);
});

test('cross-source evidence substitution fails before sequence comparison', () => {
  const f = fixture(); f.mentions[0].source_id = uuid(99);
  assert.throws(() => run(f), /CROSS_SOURCE_IDENTITY/);
});

test('wrong fragment hash fails before sequence comparison', () => {
  const f = fixture(); f.mentions[0].fragment_sha256 = digest(99);
  assert.throws(() => run(f), /FRAGMENT_HASH_MISMATCH/);
});

test('forged review status fails closed', () => {
  const f = fixture(); f.products[0].independently_reviewed = true;
  assert.throws(() => run(f), /APPROVAL_FORBIDDEN/);
});

test('malformed or sparse mention arrays fail closed', () => {
  const f = fixture(); f.mentions.length++;
  assert.throws(() => run(f), /SPARSE_ARRAY/);
});
