import test from 'node:test';
import assert from 'node:assert/strict';
import { publicExcerptEligible, parseStrictInstant, validSha256 } from './rights-guard.mjs';
const a='a'.repeat(64), b='b'.repeat(64), c='c'.repeat(64);
const fixture=()=>({
  now:'2026-10-14T01:15:00Z',
  source:{id:'s',status:'active'},
  snapshot:{id:'v',source_id:'s',sha256:a},
  fragment:{id:'f',source_id:'s',snapshot_id:'v',content_sha256:b},
  approval:{source_id:'s',snapshot_id:'v',fragment_id:'f',snapshot_sha256:a,fragment_sha256:b,
    decision:'approved',scope:'public_excerpt',public_excerpt_authorized:true,
    rights_evidence_sha256:c,reviewer_user_id:'r',submitted_by_user_id:'author',
    approved_at:'2026-10-12T10:00:00Z',expires_at:'2026-11-12T10:00:00Z'},
  reviewer:{authenticated_user_id:'r',role:'rights_reviewer',added_at:'2026-10-11T10:00:00Z',independently_authorized:true,trusted_identity_verified:true},
  evidence:{sha256:c,bytes_verified:true,rights_scope:'public_excerpt',source_id:'s',snapshot_sha256:a,
    fragment_sha256:b,immutable_ref:'private:'+c,verified_by_user_id:'officer',
    verified_at:'2026-10-12T09:00:00Z',expires_at:'2026-11-12T10:00:00Z'}
});
test('synthetic approved fixture passes advisory preflight only',()=>assert.equal(publicExcerptEligible(fixture()),true));
const negatives={
  noClock:x=>delete x.now, ambiguousClock:x=>x.now='2026-10-14T01:15:00', invalidClock:x=>x.now='2026-02-30T01:15:00Z',
  inactiveSource:x=>x.source.status='discovered', restrictedSource:x=>x.source.status='restricted',
  sourceRevoked:x=>x.source.revoked_at='2026-10-12T00:00:00Z', snapshotRetracted:x=>x.snapshot.retracted_at='2026-10-12T00:00:00Z',
  fragmentRevoked:x=>x.fragment.revoked_at='2026-10-12T00:00:00Z', approvalRevoked:x=>x.approval.revoked_at='2026-10-12T00:00:00Z',
  evidenceRetracted:x=>x.evidence.retracted_at='2026-10-12T00:00:00Z', reviewerRevoked:x=>x.reviewer.revoked_at='2026-10-12T00:00:00Z',
  reviewerDisabled:x=>x.reviewer.disabled_at='2026-10-12T00:00:00Z', reviewerWrongRole:x=>x.reviewer.role='admin',
  reviewerNotIndependent:x=>x.reviewer.independently_authorized=false, reviewerNotVerified:x=>x.reviewer.trusted_identity_verified=false,
  reviewerAddedLater:x=>x.reviewer.added_at='2026-10-13T00:00:00Z', selfApproval:x=>x.approval.submitted_by_user_id='r',
  missingSubmitter:x=>delete x.approval.submitted_by_user_id, wrongReviewer:x=>x.approval.reviewer_user_id='someone',
  wrongSource:x=>x.fragment.source_id='other', wrongSnapshot:x=>x.fragment.snapshot_id='other',
  wrongApprovalSource:x=>x.approval.source_id='other', wrongApprovalSnapshot:x=>x.approval.snapshot_id='other',
  wrongApprovalFragment:x=>x.approval.fragment_id='other', wrongSnapshotHash:x=>x.approval.snapshot_sha256=b,
  wrongFragmentHash:x=>x.approval.fragment_sha256=a, malformedFragmentHash:x=>x.fragment.content_sha256='z'.repeat(64),
  noPublicScope:x=>x.approval.scope='private', noPublicFlag:x=>x.approval.public_excerpt_authorized=false,
  rejected:x=>x.approval.decision='rejected', retrospectiveEvidence:x=>x.evidence.verified_at='2026-10-12T11:00:00Z',
  expiredApproval:x=>x.approval.expires_at='2026-10-13T00:00:00Z', expiredEvidence:x=>x.evidence.expires_at='2026-10-13T00:00:00Z',
  evidenceExpiredBeforeApproval:x=>x.evidence.expires_at='2026-10-12T09:30:00Z',
  approvalExpiryBeforeApproval:x=>x.approval.expires_at='2026-10-12T09:30:00Z',
  futureApproval:x=>x.approval.approved_at='2026-10-15T00:00:00Z',
  unverifiedEvidence:x=>x.evidence.bytes_verified=false, wrongEvidenceHash:x=>x.evidence.sha256=a,
  wrongEvidenceSource:x=>x.evidence.source_id='other', wrongEvidenceSnapshotHash:x=>x.evidence.snapshot_sha256=b,
  wrongEvidenceFragmentHash:x=>x.evidence.fragment_sha256=a, wrongEvidenceScope:x=>x.evidence.rights_scope='acquisition',
  noImmutableRef:x=>x.evidence.immutable_ref='', noEvidenceVerifier:x=>delete x.evidence.verified_by_user_id,
  selfVerifiedEvidence:x=>x.evidence.verified_by_user_id='author',
  malformedApprovedDate:x=>x.approval.approved_at='2026-02-30T10:00:00Z',
  missingEvidenceExpiry:x=>delete x.evidence.expires_at
};
for(const [name, edit] of Object.entries(negatives))test(name,()=>{const f=fixture();edit(f);assert.equal(publicExcerptEligible(f),false)});
test('sha validation is strict',()=>{assert.equal(validSha256(a),true);assert.equal(validSha256(a.toUpperCase()),false);assert.equal(validSha256(''),false)});
for (const value of ['2026-02-29T00:00:00Z','1900-02-29T00:00:00Z','2100-02-29T00:00:00Z',
'2026-04-31T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:60:00Z',
'2026-01-01T00:00:60Z','2026-01-01T00:00:00+14:01','2026-01-01T00:00:00+25:00',
'2026-01-01T00:00:00','2026-01-01 00:00:00Z','2026-01-01T00:00Z',
'2026-01-01T00:00:00.1234Z']) test('rejects invalid instant '+value,()=>assert.equal(parseStrictInstant(value),null));
for (const value of ['2000-02-29T00:00:00Z','2024-02-29T23:59:59Z','2026-01-01T00:00:00+03:00','2026-01-01T00:00:00.123Z'])
  test('accepts valid instant '+value,()=>assert.notEqual(parseStrictInstant(value),null));
test('equivalent timezone offsets produce identical instants',()=>assert.equal(parseStrictInstant('2026-10-14T04:15:00+03:00'),parseStrictInstant('2026-10-14T01:15:00Z')));
