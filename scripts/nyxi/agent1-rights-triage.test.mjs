import test from 'node:test';
import assert from 'node:assert/strict';
import { triageSourceRights } from './agent1-rights-triage.mjs';

const source = { id:'source-1', source_key:'us-fda-mocra', canonical_url:'https://www.fda.gov/cosmetics/mocra' };
const acquisition = {
  source_id:'source-1', acquisition_authorized:true,
  asset_url:source.canonical_url, approved_final_url:source.canonical_url,
  rights_basis:'FDA-authored page',
  rights_policy_url:'https://www.fda.gov/about-fda/about-website/website-policies',
  review_due_at:'2027-01-01T00:00:00Z', expires_at:'2027-01-01T00:00:00Z',
  retention_until:'2027-01-01T00:00:00Z', approved_by:'External reviewer',
  mirror_authorized:false
};
const evidence = {
  sha256:'a'.repeat(64), independently_rehashed:true,
  document_id:'evidence-1', verified_by_user_id:'reviewer-2',
  verified_at:'2026-10-15T15:00:00Z'
};
const run = (over={}) => triageSourceRights({source,acquisition,evidence,...over});
const blocked = (r,reason) => assert.ok(r.blockers.includes(reason), reason+': '+JSON.stringify(r.blockers));

test('even complete metadata never grants permission', () => {
  const r=run();
  assert.equal(r.classification,'HUMAN_REVIEW_REQUIRED');
  for(const k of ['acquisition_granted','mirror_granted','publication_granted','archive_deletion_granted','public_fragment_included'])
    assert.equal(r[k],false);
});
test('missing acquisition',()=>blocked(run({acquisition:null}),'ACQUISITION_RECORD_ABSENT'));
test('missing source',()=>blocked(run({source:null}),'SOURCE_IDENTITY_INVALID'));
test('insecure source URL',()=>blocked(run({source:{...source,canonical_url:'http://fda.gov'}}),'SOURCE_IDENTITY_INVALID'));
test('source mismatch',()=>blocked(run({acquisition:{...acquisition,source_id:'other'}}),'ACQUISITION_SOURCE_MISMATCH'));
test('authorization false',()=>blocked(run({acquisition:{...acquisition,acquisition_authorized:false}}),'ACQUISITION_NOT_AUTHORIZED'));
test('missing final URL',()=>blocked(run({acquisition:{...acquisition,approved_final_url:null}}),'EXACT_URL_SCOPE_UNVERIFIED'));
test('redirect out of scope',()=>blocked(run({acquisition:{...acquisition,approved_final_url:'https://example.org'}}),'EXACT_URL_SCOPE_UNVERIFIED'));
test('missing policy URL',()=>blocked(run({acquisition:{...acquisition,rights_policy_url:null}}),'RIGHTS_POLICY_REFERENCE_INCOMPLETE'));
test('expired review',()=>blocked(run({acquisition:{...acquisition,review_due_at:'2025-01-01T00:00:00Z'}}),'ACQUISITION_REVIEW_EXPIRED_OR_UNDATED'));
test('expired approval',()=>blocked(run({acquisition:{...acquisition,expires_at:'2025-01-01T00:00:00Z'}}),'ACQUISITION_REVIEW_EXPIRED_OR_UNDATED'));
test('missing retention',()=>blocked(run({acquisition:{...acquisition,retention_until:null}}),'RETENTION_DEADLINE_ABSENT'));
test('agent approval is not human review',()=>blocked(run({acquisition:{...acquisition,approved_by:'NYXI Agent 1 governance review'}}),'INDEPENDENT_APPROVER_UNVERIFIED'));
test('bot approval is not human review',()=>blocked(run({acquisition:{...acquisition,approved_by:'system bot'}}),'INDEPENDENT_APPROVER_UNVERIFIED'));
test('mirroring is separately prohibited',()=>blocked(run(),'MIRRORING_NOT_AUTHORIZED'));
test('missing evidence',()=>blocked(run({evidence:null}),'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED'));
test('unhashed evidence bytes',()=>blocked(run({evidence:{...evidence,independently_rehashed:false}}),'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED'));
test('malformed evidence hash',()=>blocked(run({evidence:{...evidence,sha256:'bad'}}),'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED'));
test('missing human verifier',()=>blocked(run({evidence:{...evidence,verified_by_user_id:null}}),'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED'));
test('invalid clock',()=>blocked(run({now:'not-a-date'}),'CLOCK_INVALID'));
test('no private fragment body or evidence text in output',()=>{
  const r=run(); assert.ok(!JSON.stringify(r).includes('FDA-authored')); assert.ok(!('body_text' in r));
});
