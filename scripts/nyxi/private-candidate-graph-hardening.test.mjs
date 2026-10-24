import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrivateCandidateGraph} from './private-candidate-graph.mjs';
const source='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const base={candidate_key:'nyxi:v2:manufacturer:'+ 'a'.repeat(64),kind:'manufacturer',source_id:source,parent_key:null,display_label:'Provisional',identity_status:'source_scoped_candidate',reconciliation_required:true,independently_reviewed:false,publication_allowed:false};
test('valid private-only candidate remains unapproved',()=>{
  const result=validatePrivateCandidateGraph([{...base}]);
  assert.equal(result.candidate_count,1);
  assert.equal(result.publication_allowed,false);
  assert.equal(result.auto_merge_allowed,false);
});
test('rejects non-enumerable unexpected data',()=>{
  const candidate={...base};
  Object.defineProperty(candidate,'hidden',{value:'x'});
  assert.throws(()=>validatePrivateCandidateGraph([candidate]),/UNEXPECTED_CANDIDATE_FIELD/);
});
test('rejects Unicode formatting controls in candidate labels',()=>{
  assert.throws(()=>validatePrivateCandidateGraph([{...base,display_label:'A\u200bB'}]),/INVALID_DISPLAY_LABEL/);
});
