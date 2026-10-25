import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivateCandidateGraph } from './private-candidate-graph.mjs';

const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const make=(kind,n,source=A,parent=null)=>({candidate_key:`nyxi:v2:${kind}:${n.repeat(64)}`,kind,source_id:source,parent_key:parent,display_label:`Candidate ${kind}`,identity_status:'source_scoped_candidate',reconciliation_required:true,independently_reviewed:false,publication_allowed:false});
const m=make('manufacturer','a'), b=make('brand','b',A,m.candidate_key),f=make('family','c',A,b.candidate_key),p=make('product','d',A,f.candidate_key),s=make('shade','e',A,p.candidate_key),i=make('inci','f');
const graph=[m,b,f,p,s,i];

test('valid six-kind hierarchy remains private',()=>{const x=validatePrivateCandidateGraph(graph);assert.equal(x.candidate_count,6);assert.equal(x.publication_allowed,false);assert.equal(x.auto_merge_allowed,false);assert.ok(Object.isFrozen(x));});
test('cross-source child rejected even with syntactically correct parent key',()=>assert.throws(()=>validatePrivateCandidateGraph([m,{...b,source_id:B}]),/CROSS_SOURCE_PARENT_FORBIDDEN/));
test('parent must be in supplied bundle',()=>assert.throws(()=>validatePrivateCandidateGraph([b]),/PARENT_NOT_IN_BUNDLE/));
test('parent must have correct kind',()=>assert.throws(()=>validatePrivateCandidateGraph([m,{...b,parent_key:i.candidate_key},i]),/PARENT_KIND_MISMATCH/));
test('reject duplicate candidate keys',()=>assert.throws(()=>validatePrivateCandidateGraph([m,m]),/DUPLICATE_CANDIDATE/));
test('reject injected approval',()=>assert.throws(()=>validatePrivateCandidateGraph([{...m,independently_reviewed:true}]),/UNREVIEWED_CANDIDATE_REQUIRED/));
test('reject incorrect key kind',()=>assert.throws(()=>validatePrivateCandidateGraph([{...m,kind:'brand'}]),/CANDIDATE_KIND_MISMATCH/));
test('reject unexpected INCI parent',()=>assert.throws(()=>validatePrivateCandidateGraph([{...i,parent_key:m.candidate_key}]),/UNEXPECTED_PARENT/));
test('reject malformed key and missing source',()=>{assert.throws(()=>validatePrivateCandidateGraph([{...m,candidate_key:'wrong'}]),/INVALID_CANDIDATE_KEY/);assert.throws(()=>validatePrivateCandidateGraph([{...m,source_id:null}]),/INVALID_SOURCE_ID/);});
test('reject extra approval and claim fields, even if private flags remain false',()=>{for(const field of ['approved','review_status','publication_id','safety_claim','verified'])assert.throws(()=>validatePrivateCandidateGraph([{...m,[field]:true}]),/UNEXPECTED_CANDIDATE_FIELD/);});
test('reject missing generated fields',()=>{const {display_label,...rest}=m;assert.throws(()=>validatePrivateCandidateGraph([rest]),/UNEXPECTED_CANDIDATE_FIELD/);});
test('reject empty and control-character labels',()=>{assert.throws(()=>validatePrivateCandidateGraph([{...m,display_label:'  '}]),/INVALID_DISPLAY_LABEL/);assert.throws(()=>validatePrivateCandidateGraph([{...m,display_label:'bad\nlabel'}]),/INVALID_DISPLAY_LABEL/);});
test('reject malformed candidate container and oversize bundles',()=>{assert.throws(()=>validatePrivateCandidateGraph([]),/INVALID_CANDIDATES/);assert.throws(()=>validatePrivateCandidateGraph({}),/INVALID_CANDIDATES/);assert.throws(()=>validatePrivateCandidateGraph(Array(10001).fill(m)),/INVALID_CANDIDATES/);});
