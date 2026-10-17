/**
 * NYXI Agent 3 — validate a private, source-scoped candidate hierarchy.
 * Structural validation is NOT source authentication, independent review,
 * a canonical merge, or authorization to publish.
 */
const KEY = /^nyxi:v2:(manufacturer|brand|family|product|shade|inci):[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const PARENT = Object.freeze({ manufacturer:null, brand:'manufacturer', family:'brand', product:'family', shade:'product', inci:null });
const FIELDS = new Set(['candidate_key','kind','source_id','parent_key','display_label','identity_status','reconciliation_required','independently_reviewed','publication_allowed']);
const check = (ok, reason) => { if (!ok) throw new TypeError(reason); };

export function validatePrivateCandidateGraph(candidates) {
  check(Array.isArray(candidates) && candidates.length > 0 && candidates.length <= 10000, 'INVALID_CANDIDATES');
  const index = new Map();
  for (const row of candidates) {
    check(row && typeof row === 'object' && !Array.isArray(row), 'INVALID_CANDIDATE');
    // Exact generated-candidate shape: fail closed on injected approvals,
    // claims, publication metadata or purported verification evidence.
    check(Object.keys(row).length === FIELDS.size && Object.keys(row).every(k => FIELDS.has(k)), 'UNEXPECTED_CANDIDATE_FIELD');
    check(typeof row.candidate_key === 'string' && KEY.test(row.candidate_key), 'INVALID_CANDIDATE_KEY');
    const kind = row.candidate_key.split(':')[2];
    check(row.kind === kind, 'CANDIDATE_KIND_MISMATCH');
    check(typeof row.source_id === 'string' && UUID.test(row.source_id), 'INVALID_SOURCE_ID');
    check(typeof row.display_label === 'string' && row.display_label.trim().length > 0 && row.display_label.length <= 512 && !/[\x00-\x1f\x7f]/u.test(row.display_label), 'INVALID_DISPLAY_LABEL');
    check(row.identity_status === 'source_scoped_candidate' && row.reconciliation_required === true && row.independently_reviewed === false && row.publication_allowed === false, 'UNREVIEWED_CANDIDATE_REQUIRED');
    check(!index.has(row.candidate_key), 'DUPLICATE_CANDIDATE');
    index.set(row.candidate_key, {kind, source:row.source_id.toLowerCase(), parent:row.parent_key});
  }
  for (const row of index.values()) {
    const required = PARENT[row.kind];
    if (required === null) {
      check(row.parent === null, 'UNEXPECTED_PARENT');
      continue;
    }
    check(typeof row.parent === 'string', 'MISSING_PARENT');
    const parent = index.get(row.parent);
    check(parent !== undefined, 'PARENT_NOT_IN_BUNDLE');
    check(parent.kind === required, 'PARENT_KIND_MISMATCH');
    check(parent.source === row.source, 'CROSS_SOURCE_PARENT_FORBIDDEN');
  }
  return Object.freeze({candidate_count:index.size, private_only:true, auto_merge_allowed:false, independently_reviewed:false, publication_allowed:false});
}
