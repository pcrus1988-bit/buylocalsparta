/**
 * NYXI Agent 3: metadata-only, fail-closed binding of private formula assertions
 * to completed extraction runs. This is NOT review, rights clearance or a
 * safety/compliance determination. Callers supply authoritative DB records.
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/i;
const assert = (condition, code) => { if (!condition) throw new TypeError(code); };
const id = (value, code) => { assert(typeof value === 'string' && UUID.test(value), code); return value.toLowerCase(); };
const hash = (value, code) => { assert(typeof value === 'string' && SHA.test(value), code); return value.toLowerCase(); };
const version = value => { assert(typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{2,99}$/.test(value), 'INVALID_PARSER_VERSION'); return value; };

export function bindPrivateFormulaToExtraction(formula, { snapshots, fragments, extractionRuns } = {}) {
  assert(formula && typeof formula === 'object' && formula.publication_allowed === false && formula.independently_reviewed === false, 'PRIVATE_FORMULA_REQUIRED');
  assert(Array.isArray(formula.ingredient_assertions) && formula.ingredient_assertions.length > 0, 'ASSERTIONS_REQUIRED');
  assert(Array.isArray(snapshots) && Array.isArray(fragments) && Array.isArray(extractionRuns), 'AUTHORITATIVE_RECORDS_REQUIRED');
  const source = id(formula.source_id, 'INVALID_FORMULA_SOURCE');
  const indexed = (rows, label) => {
    const map = new Map();
    for (const row of rows) {
      const key = id(row?.id, `INVALID_${label}_ID`);
      assert(!map.has(key), `DUPLICATE_${label}_ID`);
      map.set(key, row);
    }
    return map;
  };
  const snapshotMap = indexed(snapshots, 'SNAPSHOT');
  const fragmentMap = indexed(fragments, 'FRAGMENT');
  const runMap = indexed(extractionRuns, 'RUN');
  const proof = [];
  for (const assertion of formula.ingredient_assertions) {
    assert(assertion?.evidence_status === 'private_unverified' && assertion.publication_allowed === false, 'PRIVATE_ASSERTION_REQUIRED');
    const snapshotId = id(assertion.snapshot_id, 'INVALID_ASSERTION_SNAPSHOT');
    const fragmentId = id(assertion.fragment_id, 'INVALID_ASSERTION_FRAGMENT');
    const snapshot = snapshotMap.get(snapshotId);
    const fragment = fragmentMap.get(fragmentId);
    assert(snapshot && fragment, 'MISSING_EVIDENCE_RECORD');
    assert(id(snapshot.source_id, 'INVALID_SNAPSHOT_SOURCE') === source && id(fragment.source_id, 'INVALID_FRAGMENT_SOURCE') === source, 'CROSS_SOURCE_EVIDENCE');
    assert(id(fragment.snapshot_id, 'INVALID_FRAGMENT_SNAPSHOT') === snapshotId, 'FRAGMENT_SNAPSHOT_MISMATCH');
    const snapshotSha = hash(snapshot.sha256, 'INVALID_SNAPSHOT_HASH');
    assert(snapshotSha === hash(assertion.snapshot_sha256, 'INVALID_ASSERTION_SNAPSHOT_HASH'), 'SNAPSHOT_HASH_MISMATCH');
    assert(hash(fragment.content_sha256, 'INVALID_FRAGMENT_HASH') === hash(assertion.fragment_sha256, 'INVALID_ASSERTION_FRAGMENT_HASH'), 'FRAGMENT_HASH_MISMATCH');
    assert(hash(fragment.metadata?.source_sha256, 'MISSING_FRAGMENT_SOURCE_HASH') === snapshotSha, 'FRAGMENT_SOURCE_HASH_MISMATCH');
    const parser = version(fragment.metadata?.parser_version);
    const eligible = [...runMap.values()].filter(run =>
      run.status === 'complete' &&
      id(run.source_id, 'INVALID_RUN_SOURCE') === source &&
      id(run.snapshot_id, 'INVALID_RUN_SNAPSHOT') === snapshotId &&
      version(run.parser_version) === parser
    );
    assert(eligible.length === 1, eligible.length ? 'AMBIGUOUS_COMPLETED_RUN' : 'COMPLETED_RUN_NOT_FOUND');
    const run = eligible[0];
    assert(hash(run.metadata?.source_sha256, 'MISSING_RUN_SOURCE_HASH') === snapshotSha, 'RUN_SOURCE_HASH_MISMATCH');
    assert(typeof run.completed_at === 'string' && Number.isFinite(Date.parse(run.completed_at)), 'RUN_COMPLETION_TIMESTAMP_REQUIRED');
    proof.push(Object.freeze({ assertion_key: assertion.assertion_key, extraction_run_id: id(run.id, 'INVALID_RUN_ID'), parser_version: parser, provenance_status: 'metadata_matched_not_independently_reviewed' }));
  }
  return Object.freeze({ matched_assertions: proof.length, bindings: Object.freeze(proof), independently_reviewed: false, publication_allowed: false, safety_or_compliance_inferred: false });
}
