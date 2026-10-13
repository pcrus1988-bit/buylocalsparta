import test from 'node:test';
import assert from 'node:assert/strict';
import {publicExcerptEligible} from './rights-guard.mjs';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const fixture=()=>({now:'2026-10-13T14:19:00Z',
source:{id:'s'},snapshot:{id:'v',source_id:'s',sha256:a},
fragment:{id:'f',source_id:'s',snapshot_id:'v',content_sha256:b},
approval:{source_id:'s',snapshot_id:'v',fragment_id:'f',snapshot_sha256:a,fragment_sha256:b,decision:'approved',scope:'public_excerpt',public_excerpt_authorized:true,rights_evidence_sha256:c,reviewer_user_id:'r',submitted_by_user_id:'author',approved_at:'2026-10-12T00:00:00Z',expires_at:'2026-11-12T00:00:00Z'},
reviewer:{authenticated_user_id:'r',independently_authorized:true,trusted_identity_verified:true},
evidence:{sha256:c,bytes_verified:true,rights_scope:'public_excerpt',source_id:'s',snapshot_sha256:a,fragment_sha256:b,immutable_ref:'private:'+c,verified_by_user_id:'officer',verified_at:'2026-10-12T00:00:00Z',expires_at:'2026-11-12T00:00:00Z'}});
test('approved synthetic fixture',()=>assert.equal(publicExcerptEligible(fixture()),true));
for(const [name,edit] of Object.entries({
revoked:x=>x.approval.revoked_at='now',
expired:x=>x.approval.expires_at='2026-10-12T00:00:00Z',
selfReview:x=>x.approval.submitted_by_user_id='r',
crossSource:x=>x.fragment.source_id='other',
unverified:x=>x.evidence.bytes_verified=false,
noRights:x=>x.approval.public_excerpt_authorized=false,
noClock:x=>delete x.now
}))test(name,()=>{const f=fixture();edit(f);assert.equal(publicExcerptEligible(f),false)});
