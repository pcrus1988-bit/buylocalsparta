import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { preflightExactAsset } from './agent1-exact-asset-preflight.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceId = '11111111-1111-4111-8111-111111111111';
const snapshotId = '22222222-2222-4222-8222-222222222222';
const approvalId = '33333333-3333-4333-8333-333333333333';
function fixture() {
  const archiveBytes = Buffer.from('first-party archive bytes');
  const rightsEvidenceBytes = Buffer.from('documentary rights evidence bytes');
  const sha = hash(archiveBytes);
  return {
    source: {id:sourceId,canonical_url:'https://example.org/guidance',status:'active'},
    snapshot: {id:snapshotId,source_id:sourceId,fetch_metadata:{asset_id:'asset-v1'},
      final_url:'https://example.org/archive',fetched_at:'2026-10-18T12:00:00Z',
      sha256:sha,byte_length:archiveBytes.length,http_status:200,mime_type:'text/html',
      storage_bucket:'nyxi-evidence',storage_path:`${sourceId}/${sha}/archive.html`,
      provenance:{asset_approval_id:approvalId,no_link_following:true,original_bytes_preserved:true}},
    acquisition: {id:approvalId,source_id:sourceId,approved_final_url:'https://example.org/archive',
      asset_url:'https://example.org/archive',rights_policy_url:'https://example.org/rights',
      approved_by:'independent human',approved_at:'2026-10-18T11:00:00Z',
      retention_until:'2099-12-31T00:00:00Z',expires_at:'2099-11-01T00:00:00Z',
      review_due_at:'2099-10-20T00:00:00Z',acquisition_authorized:true,mirror_authorized:false,
      metadata:{asset_id:'asset-v1',rights_evidence_sha256:hash(rightsEvidenceBytes)}},
    archiveBytes, rightsEvidenceBytes
  };
}
function expectHold(mutator, blocker) {
  const f=fixture(); mutator(f); const r=preflightExactAsset(f);
  assert.equal(r.state,'HOLD'); assert.equal(r.publication_authorized,false);
  assert.equal(r.acquisition_authorized,false); assert.equal(r.mirror_authorized,false);
  assert.ok(r.blockers.includes(blocker),JSON.stringify(r.blockers));
}
test('verified bytes remain advisory, never grant rights',()=>{
  const r=preflightExactAsset(fixture());
  assert.equal(r.state,'READY_FOR_INDEPENDENT_HUMAN_REVIEW');
  assert.equal(r.publication_authorized,false);
  assert.equal(r.acquisition_authorized,false);
  assert.equal(r.mirror_authorized,false);
});
const cases = [
 ['inactive source',f=>f.source.status='inactive','SOURCE_NOT_ACTIVE'],
 ['missing source status',f=>delete f.source.status,'SOURCE_NOT_ACTIVE'],
 ['404 archive',f=>f.snapshot.http_status=404,'ARCHIVE_HTTP_STATUS_INVALID'],
 ['missing HTTP status',f=>delete f.snapshot.http_status,'ARCHIVE_HTTP_STATUS_INVALID'],
 ['AI-assisted attestation',f=>f.acquisition.approved_by='AI-assisted governance','INDEPENDENT_APPROVAL_NOT_ATTESTED'],
 ['agent attestation',f=>f.acquisition.approved_by='Agent 1','INDEPENDENT_APPROVAL_NOT_ATTESTED'],
 ['expired at fetch',f=>f.acquisition.expires_at='2026-10-18T11:59:59Z','ACQUISITION_EXPIRED_AT_FETCH'],
 ['review overdue at fetch',f=>f.acquisition.review_due_at='2026-10-18T11:59:59Z','ACQUISITION_REVIEW_OVERDUE_AT_FETCH'],
 ['invalid expiry',f=>f.acquisition.expires_at='not-a-date','ACQUISITION_EXPIRED_AT_FETCH'],
 ['other policy host',f=>f.acquisition.rights_policy_url='https://other.org/rights','RIGHTS_POLICY_ORIGIN_INVALID'],
 ['HTTP policy',f=>f.acquisition.rights_policy_url='http://example.org/rights','RIGHTS_POLICY_ORIGIN_INVALID'],
 ['different port',f=>f.snapshot.final_url=f.acquisition.asset_url=f.acquisition.approved_final_url='https://example.org:8443/archive','EXACT_FINAL_URL_SCOPE'],
 ['missing rights bytes',f=>delete f.rightsEvidenceBytes,'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED'],
 ['modified archive bytes',f=>f.archiveBytes=Buffer.from('tampered bytes'),'ORIGINAL_BYTES_UNVERIFIED'],
 ['missing asset ID',f=>delete f.snapshot.fetch_metadata.asset_id,'ASSET_ID_BINDING'],
 ['cross-source snapshot',f=>f.snapshot.source_id='44444444-4444-4444-8444-444444444444','EXACT_SOURCE_APPROVAL_BINDING'],
 ['retroactive approval',f=>f.acquisition.approved_at='2026-10-18T12:00:01Z','NO_RETROACTIVE_ACQUISITION'],
 ['missing approver label',f=>delete f.acquisition.approved_by,'INDEPENDENT_APPROVAL_NOT_ATTESTED'],
 ['future approval',f=>f.acquisition.approved_at='2026-10-18T13:00:00Z','NO_RETROACTIVE_ACQUISITION'],
 ['missing provenance binding',f=>delete f.snapshot.provenance.asset_approval_id,'EXACT_SOURCE_APPROVAL_BINDING'],
 ['mirror flag',f=>f.acquisition.mirror_authorized=true,'ACQUISITION_SCOPE_INVALID'],
 ['mismatched rights hash',f=>f.acquisition.metadata.rights_evidence_sha256='a'.repeat(64),'DOCUMENTARY_RIGHTS_EVIDENCE_UNVERIFIED'],
 ['zero archive size',f=>f.snapshot.byte_length=0,'ARCHIVE_SIZE_INVALID'],
 ['path traversal',f=>f.snapshot.storage_path='../archive.html','CONTENT_ADDRESS_INVALID'],
 ['PDF signature mismatch',f=>f.snapshot.mime_type='application/pdf','PDF_SIGNATURE_MISMATCH'],
 ['invalid review date',f=>f.acquisition.review_due_at='2026-02-30T00:00:00Z','ACQUISITION_REVIEW_OVERDUE_AT_FETCH'],
 ['invalid expiry month',f=>f.acquisition.expires_at='2026-13-01T00:00:00Z','ACQUISITION_EXPIRED_AT_FETCH'],
 ['missing retention',f=>delete f.acquisition.retention_until,'RETENTION_SCOPE_MISSING'],
 ['missing source ID',f=>f.source.id=null,'EXACT_SOURCE_APPROVAL_BINDING'],
 ['policy credentials',f=>f.acquisition.rights_policy_url='https://user:pass@example.org/rights','RIGHTS_POLICY_ORIGIN_INVALID'],
 ['retention expires after fetch',f=>f.acquisition.retention_until=new Date(Date.now()-1000).toISOString(),'RETENTION_EXPIRED_NOW'],
 ['authorization expires after fetch',f=>f.acquisition.expires_at=new Date(Date.now()-1000).toISOString(),'ACQUISITION_EXPIRED_NOW'],
 ['review becomes overdue after fetch',f=>f.acquisition.review_due_at=new Date(Date.now()-1000).toISOString(),'ACQUISITION_REVIEW_OVERDUE_NOW'],
 ['future-dated snapshot',f=>f.snapshot.fetched_at=new Date(Date.now()+3600000).toISOString(),'FUTURE_DATED_SNAPSHOT'],
 ['future-dated approval',f=>{f.snapshot.fetched_at=new Date(Date.now()+7200000).toISOString();f.acquisition.approved_at=new Date(Date.now()+3600000).toISOString()},'FUTURE_DATED_APPROVAL'],
 ['expired retention with valid bytes',f=>f.acquisition.retention_until='2026-10-19T00:00:00Z','RETENTION_EXPIRED_NOW'],
 ['expiry in the future',f=>f.acquisition.expires_at='2099-12-31T00:00:00Z',null],
 ['missing acquisition expiry',f=>delete f.acquisition.expires_at,'ACQUISITION_EXPIRY_MISSING_OR_INVALID'],
 ['null acquisition expiry',f=>f.acquisition.expires_at=null,'ACQUISITION_EXPIRY_MISSING_OR_INVALID'],
 ['empty acquisition expiry',f=>f.acquisition.expires_at='','ACQUISITION_EXPIRY_MISSING_OR_INVALID'],
 ['missing review deadline',f=>delete f.acquisition.review_due_at,'REVIEW_DEADLINE_MISSING_OR_INVALID'],
 ['null review deadline',f=>f.acquisition.review_due_at=null,'REVIEW_DEADLINE_MISSING_OR_INVALID'],
 ['empty review deadline',f=>f.acquisition.review_due_at='','REVIEW_DEADLINE_MISSING_OR_INVALID']
];
for(const [name,mutator,blocker] of cases) test(name,()=>{
  if(blocker) return expectHold(mutator,blocker);
  const f=fixture();mutator(f);assert.equal(preflightExactAsset(f).state,'READY_FOR_INDEPENDENT_HUMAN_REVIEW');
});
