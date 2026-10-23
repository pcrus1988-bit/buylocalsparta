import test from 'node:test';
import assert from 'node:assert/strict';
import { triagePublicationEvidence as triage } from './publication-hold-gate.mjs';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const d='44444444-4444-4444-8444-444444444444';
const e='55555555-5555-4555-8555-555555555555';
const h='a'.repeat(64), r='b'.repeat(64);
function fixture() {
  return {
    snapshot:{id:a,sha256:h,fetched_at:'2026-10-22T00:00:00Z',provenance:{asset_approval_id:b}},
    acquisition:{id:b,acquisition_authorized:true,retention_until:'2027-01-01T00:00:00Z',metadata:{no_public_release:false}},
    fragment:{id:c,snapshot_id:a,content_sha256:r},
    attestation:{original_bytes_verified:true,rights_document_verified:true,evidence:{snapshot_id:a,original_sha256:h,rights_document_sha256:r}},
    rightsReview:{reviewer_user_id:d,scope_verified:true,rights_evidence_sha256:r,snapshot_sha256:h},
    publicationApproval:{fragment_id:c,snapshot_id:a,snapshot_sha256:h,fragment_sha256:r,public_excerpt_authorized:true,revoked_at:null,rights_evidence_sha256:r,reviewer_user_id:e,rights_reviewer_user_id:d}
  };
}
test('missing all records holds publication',()=>{const x=triage();assert.equal(x.publication_authorized,false);assert.ok(x.review_blockers.length>=8)});
test('even fully claimed evidence never grants publication',()=>{const x=triage(fixture());assert.deepEqual(x.review_blockers,[]);assert.equal(x.publication_authorized,false);assert.equal(x.independent_release_gate_required,true)});
test('absent public-release prohibition is not permission',()=>{const x=fixture();delete x.acquisition.metadata.no_public_release;assert.ok(triage(x).review_blockers.includes('public_release_not_explicitly_permitted'))});
test('explicit no-public-release is respected',()=>{const x=fixture();x.acquisition.metadata.no_public_release=true;assert.ok(triage(x).review_blockers.includes('public_release_not_explicitly_permitted'))});
test('string false is not an authorization',()=>{const x=fixture();x.acquisition.metadata.no_public_release='false';assert.ok(triage(x).review_blockers.includes('public_release_not_explicitly_permitted'))});
test('missing retention blocks rights handoff',()=>{const x=fixture();x.acquisition.retention_until=null;assert.ok(triage(x).review_blockers.includes('retention_deadline_unresolved'))});
test('retention earlier than capture blocks handoff',()=>{const x=fixture();x.acquisition.retention_until='2026-10-21T00:00:00Z';assert.ok(triage(x).review_blockers.includes('retention_deadline_unresolved'))});
test('metadata-only snapshot without original bytes blocks handoff',()=>{const x=fixture();x.attestation.original_bytes_verified=false;assert.ok(triage(x).review_blockers.includes('original_bytes_not_independently_attested'))});
test('caller-supplied policy hash without independent byte proof blocks',()=>{const x=fixture();x.attestation.rights_document_verified=false;assert.ok(triage(x).review_blockers.includes('rights_policy_bytes_not_independently_attested'))});
test('rights evidence cannot be substituted across snapshots',()=>{const x=fixture();x.rightsReview.snapshot_sha256='c'.repeat(64);assert.ok(triage(x).review_blockers.includes('independent_rights_scope_review_unverified'))});
test('rights evidence hash must match attested document',()=>{const x=fixture();x.rightsReview.rights_evidence_sha256='c'.repeat(64);assert.ok(triage(x).review_blockers.includes('independent_rights_scope_review_unverified'))});
test('fragment approval cannot be replayed across snapshots',()=>{const x=fixture();x.publicationApproval.snapshot_id=d;assert.ok(triage(x).review_blockers.includes('publication_approval_provenance_mismatch'))});
test('revocation blocks handoff',()=>{const x=fixture();x.publicationApproval.revoked_at='2026-10-23T00:00:00Z';assert.ok(triage(x).review_blockers.includes('public_excerpt_approval_missing_or_revoked'))});
test('self-review blocks handoff',()=>{const x=fixture();x.publicationApproval.reviewer_user_id=d;assert.ok(triage(x).review_blockers.includes('independent_reviewer_separation_unverified'))});
test('mismatched rights reviewer blocks handoff',()=>{const x=fixture();x.publicationApproval.rights_reviewer_user_id=e;assert.ok(triage(x).review_blockers.includes('independent_reviewer_separation_unverified'))});
test('no fragment text or private path leaves the triage result',()=>{const x=fixture();x.fragment.body_text='PRIVATE NEVER EMIT';x.snapshot.storage_path='private/path';const result=JSON.stringify(triage(x));assert.ok(!result.includes('PRIVATE NEVER EMIT'));assert.ok(!result.includes('private/path'))});
