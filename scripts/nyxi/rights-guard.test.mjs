import test from 'node:test';
import assert from 'node:assert/strict';
import {publicExcerptEligible} from './rights-guard.mjs';
const h='a'.repeat(64),g='b'.repeat(64);
function fixture(){return {snapshot:{id:'s',sha256:h},fragment:{id:'f',snapshot_id:'s',content_sha256:g},approval:{snapshot_id:'s',fragment_id:'f',snapshot_sha256:h,fragment_sha256:g,decision:'approved',public_excerpt_authorized:true,rights_evidence_sha256:h,reviewer_user_id:'r',submitted_by_user_id:'author'},reviewer:{authenticated_user_id:'r',independently_authorized:true}}}
for(const [name,mutate,allowed] of [
 ['approved',()=>{},true],
 ['pending',x=>x.approval.decision='pending',false],
 ['revoked',x=>x.approval.revoked_at='2026-10-13',false],
 ['self-review',x=>x.approval.submitted_by_user_id='r',false],
 ['snapshot mismatch',x=>x.approval.snapshot_sha256=g,false],
 ['fragment mismatch',x=>x.approval.fragment_sha256=h,false],
 ['no evidence',x=>x.approval.rights_evidence_sha256='',false],
 ['unauthorized reviewer',x=>x.reviewer.independently_authorized=false,false],
 ['acquisition is not publication',x=>{x.approval.public_excerpt_authorized=false;x.approval.acquisition_authorized=true},false]
])test(name,()=>{const x=fixture();mutate(x);assert.equal(publicExcerptEligible(x),allowed)});
