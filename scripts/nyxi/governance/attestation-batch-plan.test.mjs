import test from 'node:test';
import assert from 'node:assert/strict';
import { planPrivateAttestationBatch } from './attestation-batch-plan.mjs';

const uuid = c => c.repeat(8)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(12);
const sha = c => c.repeat(64);
const make = (c='a', digest='e') => {
  const id=uuid(c), approvalId=uuid(c==='a'?'b':'f'), hash=sha(digest);
  return {source:{id,canonical_url:'https://authority.gov/'+c},
    approval:{id:approvalId,source_id:id,asset_url:'https://authority.gov/'+c,
      approved_final_url:'https://authority.gov/'+c,acquisition_authorized:true,
      approved_at:'2026-10-01T00:00:00Z',expires_at:'2026-10-31T00:00:00Z'},
    snapshot:{id:uuid(c==='a'?'c':c),source_id:id,sha256:hash,byte_length:120,
      fetched_at:'2026-10-20T00:00:00Z',final_url:'https://authority.gov/'+c,
      storage_bucket:'nyxi-evidence',storage_path:id+'/'+hash+'/original.html',
      provenance:{asset_approval_id:approvalId}}};
};
const opts={observedAt:'2026-10-23T12:00:00Z'};
const plan = (records,options=opts) => planPrivateAttestationBatch(records,options);

test('empty batch is safe',()=>assert.deepEqual(plan([]),[]));
test('one valid snapshot yields metadata-only rights HOLD',()=>{
  const result=plan([make()]);
  assert.equal(result.length,1);
  assert.equal(result[0].original_bytes_verified,false);
  assert.equal(result[0].publication_authorized,false);
  assert.equal(result[0].rights_review_required,true);
  assert.equal(result[0].approval_id,uuid('b'));
  assert.ok(!JSON.stringify(result).includes('original.html'));
  assert.ok(!JSON.stringify(result).includes('authority.gov'));
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]));
});
test('identical duplicate snapshot ID is deduplicated',()=>assert.equal(plan([make(),make()]).length,1));
test('same snapshot ID with different archived path is rejected',()=>{
  const a=make(), b=make();b.snapshot.storage_path=b.snapshot.storage_path.replace('original.html','other.html');
  assert.throws(()=>plan([a,b]),/duplicate_snapshot_identity_conflict/);
});
test('same snapshot ID with different capture time is rejected',()=>{
  const a=make(), b=make();b.snapshot.fetched_at='2026-10-21T00:00:00Z';
  assert.throws(()=>plan([a,b]),/duplicate_snapshot_identity_conflict/);
});
test('same content hash from distinct sources remains two provenance records',()=>{
  const result=plan([make('a'),make('d')]);
  assert.equal(result.length,2);
  assert.equal(result[0].snapshot_sha256,result[1].snapshot_sha256);
});
test('order is stable regardless of input order',()=>{
  const a=make('a'),b=make('d');
  assert.deepEqual(plan([a,b]),plan([b,a]));
});
test('unauthorized acquisition is rejected',()=>{
  const a=make();a.approval.acquisition_authorized=false;
  assert.throws(()=>plan([a]),/acquisition_binding_invalid/);
});
test('invalid URL or path is rejected',()=>{
  const a=make();a.snapshot.storage_path='../private';
  assert.throws(()=>plan([a]),/invalid_private_storage_binding/);
});
test('oversized snapshot rejected',()=>assert.throws(()=>plan([make()],{...opts,maxBytes:100}),/archive_exceeds_size_limit/));
test('unbounded batch rejected',()=>assert.throws(()=>plan(Array(1001).fill(make())),/invalid_attestation_batch/));
test('missing provenance object rejected',()=>{
  const a=make();delete a.snapshot.provenance;
  assert.throws(()=>plan([a]),/invalid_attestation_record/);
});
test('prototype-bearing record rejected',()=>{
  const a=make();a.snapshot=Object.assign(Object.create({injected:true}),a.snapshot);
  assert.throws(()=>plan([a]),/invalid_attestation_record/);
});
test('missing observedAt cannot be used to produce a plan',()=>
  assert.throws(()=>plan([make()],{}),/invalid_observed_at/));

test('aggregate byte budget rejects distinct snapshots even when each fits individually',()=>{
  const a=make('a','e'), b=make('d','f');
  assert.throws(()=>plan([a,b],{...opts,maxBytes:200}),/attestation_batch_total_bytes_exceeded/);
});
test('identical duplicate snapshot does not consume aggregate budget twice',()=>{
  const a=make('a','e'), b=make('d','f');
  const result=plan([a,a,b],{...opts,maxBytes:240});
  assert.equal(result.length,2);
});
test('aggregate byte budget accepts exact boundary',()=>{
  assert.equal(plan([make('a','e'),make('d','f')],{...opts,maxBytes:240}).length,2);
});
test('equal content hashes with contradictory byte lengths fail before Storage handoff',()=>{
  const a=make('a','e'), b=make('d','e');
  b.snapshot.byte_length=121;
  assert.throws(()=>plan([a,b]),/conflicting_content_hash_byte_length/);
});

test('same approval UUID cannot authorize different source identities in one batch',()=>{
  const a=make('a','e'), b=make('d','f');
  // Both records pass individual acquisition binding, but reuse approval b.
  b.approval.id=a.approval.id;
  b.snapshot.provenance.asset_approval_id=b.approval.id;
  assert.equal(a.approval.id,b.approval.id);
  assert.throws(()=>plan([a,b]),/conflicting_approval_identity/);
});
test('same source UUID cannot be rebound to another canonical URL in one batch',()=>{
  const a=make('a','e'), b=make('a','f');
  b.snapshot.id=uuid('d');
  b.approval.id=uuid('f');
  b.snapshot.provenance.asset_approval_id=b.approval.id;
  b.source.canonical_url='https://authority.gov/other';
  b.approval.asset_url=b.source.canonical_url;
  b.approval.approved_final_url=b.source.canonical_url;
  b.snapshot.final_url=b.source.canonical_url;
  assert.throws(()=>plan([a,b]),/conflicting_source_identity/);
});
test('same approval UUID cannot silently change authorization expiry',()=>{
  const a=make('a','e'), b=make('a','f');
  b.snapshot.id=uuid('d');
  b.snapshot.storage_path=b.source.id+'/'+b.snapshot.sha256+'/original.html';
  b.approval.expires_at='2026-11-30T00:00:00Z';
  assert.throws(()=>plan([a,b]),/conflicting_approval_identity/);
});
test('same source can have distinct approved assets with distinct approval UUIDs',()=>{
  const a=make('a','e'), b=make('a','f');
  b.snapshot.id=uuid('d');
  b.approval.id=uuid('f');
  b.snapshot.provenance.asset_approval_id=b.approval.id;
  assert.equal(plan([a,b]).length,2);
});
