import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceScopedCandidate, requireDistinctCandidateKeys } from './canonical-identity-v2.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const manufacturer = sourceScopedCandidate({kind:'manufacturer',source_id:A,label:'Maker'});
const brand = sourceScopedCandidate({kind:'brand',source_id:A,parent_key:manufacturer.candidate_key,label:'Brand'});
const family = sourceScopedCandidate({kind:'family',source_id:A,parent_key:brand.candidate_key,label:'Gel'});
const product = sourceScopedCandidate({kind:'product',source_id:A,parent_key:family.candidate_key,label:'Polish'});
const shade = {kind:'shade',source_id:A,parent_key:product.candidate_key,label:'Ruby',code:'001'};

test('all hierarchy candidate kinds have distinct deterministic keys', () => {
  for (const x of [manufacturer,brand,family,product,sourceScopedCandidate(shade)]) {
    assert.match(x.candidate_key, /^nyxi:v2:/);
    assert.equal(x.independently_reviewed, false);
    assert.equal(x.publication_allowed, false);
    assert.equal(x.reconciliation_required, true);
    assert.ok(Object.isFrozen(x));
  }
});
test('stable normalization and NFC for labels', () => {
  assert.equal(sourceScopedCandidate(shade).candidate_key, sourceScopedCandidate({...shade,label:' ruby '}).candidate_key);
  assert.equal(sourceScopedCandidate({...shade,label:'Café'}).candidate_key,sourceScopedCandidate({...shade,label:'Cafe\u0301'}).candidate_key);
});
test('same manufacturer code from another source cannot merge', () => {
  const x={...shade,external_namespace:'manufacturer',external_id:'001'};
  assert.notEqual(sourceScopedCandidate(x).candidate_key,sourceScopedCandidate({...x,source_id:B}).candidate_key);
});
test('same shade code from another source cannot merge', () => {
  assert.notEqual(sourceScopedCandidate(shade).candidate_key,sourceScopedCandidate({...shade,source_id:B}).candidate_key);
});
test('external code remains stable across display-label changes within source', () => {
  const x={...shade,external_namespace:'manufacturer',external_id:'001'};
  assert.equal(sourceScopedCandidate(x).candidate_key,sourceScopedCandidate({...x,label:'Rouge'}).candidate_key);
});
test('distinct product parent produces distinct shade candidate', () => {
  const other=sourceScopedCandidate({kind:'product',source_id:A,parent_key:family.candidate_key,label:'Other'});
  assert.notEqual(sourceScopedCandidate(shade).candidate_key,sourceScopedCandidate({...shade,parent_key:other.candidate_key}).candidate_key);
});
test('invalid hierarchy rejected', () => assert.throws(()=>sourceScopedCandidate({...shade,parent_key:manufacturer.candidate_key}),/INVALID_PARENT/));
test('missing shade code rejected', () => assert.throws(()=>sourceScopedCandidate({...shade,code:undefined}),/SHADE_CODE_REQUIRED/));
test('cannot inject review or publication status', () => {
  for (const flag of ['approved','verified','review_status','publication_allowed'])
    assert.throws(()=>sourceScopedCandidate({...shade,[flag]:true}),/REVIEW_OR_APPROVAL_INPUT_FORBIDDEN/);
});
test('INCI names are source-scoped and do not infer chemical equivalence', () => {
  const x={kind:'inci',source_id:A,label:'Aqua'};
  assert.notEqual(sourceScopedCandidate(x).candidate_key,sourceScopedCandidate({...x,source_id:B}).candidate_key);
  assert.throws(()=>sourceScopedCandidate({...x,external_namespace:'CAS',external_id:'7732-18-5'}),/INCI_NAME_ONLY/);
});
test('missing external namespace or ID rejected', () => {
  assert.throws(()=>sourceScopedCandidate({...shade,external_id:'1'}),/INVALID_EXTERNAL_NAMESPACE/);
  assert.throws(()=>sourceScopedCandidate({...shade,external_namespace:'x'}),/INVALID_EXTERNAL_ID/);
});
test('control characters, oversized labels and invalid source IDs rejected', () => {
  assert.throws(()=>sourceScopedCandidate({...shade,label:'bad\nlabel'}),/INVALID_LABEL/);
  assert.throws(()=>sourceScopedCandidate({...shade,label:'x'.repeat(513)}),/INVALID_LABEL/);
  assert.throws(()=>sourceScopedCandidate({...shade,source_id:'wrong'}),/SOURCE_REQUIRED/);
});
test('v1/v2 coexist without alias merging', () => {
  const out=requireDistinctCandidateKeys(['nyxi:v1:shade:'+'a'.repeat(64),sourceScopedCandidate(shade).candidate_key]);
  assert.equal(out.count,2); assert.equal(out.auto_merge_allowed,false);
});
test('duplicate and malformed keys rejected', () => {
  const k=sourceScopedCandidate(shade).candidate_key;
  assert.throws(()=>requireDistinctCandidateKeys([k,k]),/DUPLICATE_KEY/);
  assert.throws(()=>requireDistinctCandidateKeys(['invalid']),/INVALID_KEY/);
});
