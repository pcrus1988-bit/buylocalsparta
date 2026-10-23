import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRightsReviewQueue } from './rights-review-triage.mjs';

const uuid = c => c.repeat(8)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(12);
const hash = c => c.repeat(64);
const make = () => {
  const sourceId=uuid('a'), approvalId=uuid('b'), digest=hash('c');
  const source={id:sourceId,canonical_url:'https://agency.gov/nail'};
  const approval={id:approvalId,source_id:sourceId,asset_url:source.canonical_url,
    approved_final_url:source.canonical_url,rights_policy_url:'https://agency.gov/rights',
    approved_at:'2026-10-01T00:00:00Z',expires_at:'2026-10-31T00:00:00Z',
    acquisition_authorized:true,retention_until:null,metadata:{}};
  const snapshot={id:uuid('d'),source_id:sourceId,sha256:digest,byte_length:120,
    fetched_at:'2026-10-20T00:00:00Z',final_url:source.canonical_url,
    storage_bucket:'nyxi-evidence',
    storage_path:sourceId+'/'+digest+'/original.html',
    provenance:{asset_approval_id:approvalId}};
  return {sources:[source],approvals:[approval],snapshots:[snapshot],
    observedAt:'2026-10-23T15:00:00Z'};
};
test('holds and triages exact IDs without private paths or policy contents',()=>{
  const q=buildRightsReviewQueue(make());
  assert.equal(q.approval_count,1);
  assert.equal(q.snapshot_count,1);
  assert.equal(q.publication_authorized,false);
  assert.equal(q.entries[0].review_status,'hold');
  assert.equal(q.entries[0].snapshots[0].snapshot_sha256,hash('c'));
  assert.ok(q.entries[0].blockers.includes('retention_deadline_missing'));
  assert.ok(q.entries[0].blockers.includes('documentary_rights_anchor_missing_or_invalid'));
  assert.ok(!JSON.stringify(q).includes('agency.gov'));
  assert.ok(!JSON.stringify(q).includes('original.html'));
  assert.ok(Object.isFrozen(q.entries[0]));
});
test('even a recorded digest and retention deadline cannot grant rights',()=>{
  const x=make();x.approvals[0].retention_until='2026-12-01T00:00:00Z';
  x.approvals[0].metadata.rights_policy_sha256=hash('e');
  x.approvals[0].publication_authorized=true;
  x.approvals[0].independent_review_complete=true;
  const q=buildRightsReviewQueue(x);
  assert.equal(q.entries[0].publication_authorized,false);
  assert.ok(q.entries[0].blockers.includes('independent_documentary_witness_required'));
  assert.ok(q.entries[0].blockers.includes('independent_human_publication_review_required'));
});
test('duplicate identical snapshot collapses to one review item',()=>{
  const x=make();x.snapshots.push(structuredClone(x.snapshots[0]));
  assert.equal(buildRightsReviewQueue(x).snapshot_count,1);
});
test('conflicting duplicate snapshot identity fails closed',()=>{
  const x=make();const other=structuredClone(x.snapshots[0]);
  other.byte_length=121;x.snapshots.push(other);
  assert.throws(()=>buildRightsReviewQueue(x),/conflicting_snapshot_identity/);
});
test('distinct snapshots sharing a content hash remain distinct',()=>{
  const x=make();const other=structuredClone(x.snapshots[0]);
  other.id=uuid('e');x.snapshots.push(other);
  assert.equal(buildRightsReviewQueue(x).snapshot_count,2);
});
test('unbound snapshot fails closed',()=>{
  const x=make();x.snapshots[0].provenance.asset_approval_id=uuid('e');
  assert.throws(()=>buildRightsReviewQueue(x),/unbound_snapshot/);
});
test('cross-source snapshot fails closed',()=>{
  const x=make();x.snapshots[0].source_id=uuid('e');
  assert.throws(()=>buildRightsReviewQueue(x),/unbound_snapshot/);
});
test('historically unauthorized capture fails closed',()=>{
  const x=make();x.snapshots[0].fetched_at='2026-11-01T00:00:00Z';
  x.observedAt='2026-11-02T00:00:00Z';
  assert.throws(()=>buildRightsReviewQueue(x),/capture_outside_authorization/);
});
test('unauthorized acquisition with snapshot fails closed',()=>{
  const x=make();x.approvals[0].acquisition_authorized=false;
  assert.throws(()=>buildRightsReviewQueue(x),/acquisition_binding_invalid/);
});
test('invalid storage binding fails closed',()=>{
  const x=make();x.snapshots[0].storage_path='../private.txt';
  assert.throws(()=>buildRightsReviewQueue(x),/invalid_private_storage_binding/);
});
test('retention preceding capture is separately triaged',()=>{
  const x=make();x.approvals[0].retention_until='2026-10-19T00:00:00Z';
  assert.ok(buildRightsReviewQueue(x).entries[0].blockers.includes('retention_deadline_precedes_capture'));
});
test('duplicate approval ID fails closed',()=>{
  const x=make();x.approvals.push(structuredClone(x.approvals[0]));
  assert.throws(()=>buildRightsReviewQueue(x),/invalid_or_duplicate_approval/);
});
test('duplicate source ID fails closed',()=>{
  const x=make();x.sources.push(structuredClone(x.sources[0]));
  assert.throws(()=>buildRightsReviewQueue(x),/invalid_or_duplicate_source/);
});
test('missing observation time fails closed',()=>{
  const x=make();delete x.observedAt;
  assert.throws(()=>buildRightsReviewQueue(x),/invalid_review_queue_input/);
});
test('deterministic ordering of approvals and snapshots',()=>{
  const x=make(), a2=structuredClone(x.approvals[0]),s2=structuredClone(x.snapshots[0]);
  a2.id=uuid('1');s2.id=uuid('2');s2.provenance.asset_approval_id=a2.id;
  x.approvals.unshift(a2);x.snapshots.unshift(s2);
  const q=buildRightsReviewQueue(x);
  assert.deepEqual(q.entries.map(e=>e.id),[a2.id,x.approvals[1].id]);
  assert.equal(q.snapshot_count,2);
});
test('empty approval is held, never silently approved',()=>{
  const x=make();x.snapshots=[];
  const q=buildRightsReviewQueue(x);
  assert.equal(q.snapshot_count,0);
  assert.equal(q.entries[0].publication_authorized,false);
});

test('same snapshot ID cannot silently substitute another private object path',()=>{
  const x=make();const other=structuredClone(x.snapshots[0]);
  other.storage_path=other.source_id+'/'+other.sha256+'/substituted.html';
  x.snapshots.push(other);
  assert.throws(()=>buildRightsReviewQueue(x),/conflicting_snapshot_identity/);
});

test('same snapshot UUID cannot be rebound under a second approval',()=>{
  const x=make(), a2=structuredClone(x.approvals[0]), s2=structuredClone(x.snapshots[0]);
  a2.id=uuid('1');
  s2.provenance.asset_approval_id=a2.id;
  x.approvals.push(a2); x.snapshots.push(s2);
  assert.throws(()=>buildRightsReviewQueue(x),/conflicting_snapshot_identity/);
});
test('policy URL with credentials is not acceptable documentary evidence',()=>{
  const x=make();
  x.approvals[0].rights_policy_url='https://user:secret@agency.gov/rights';
  assert.ok(buildRightsReviewQueue(x).entries[0].blockers.includes('missing_or_invalid_policy_url'));
});
test('policy URL with fragment is not an exact rights-policy reference',()=>{
  const x=make();
  x.approvals[0].rights_policy_url='https://agency.gov/rights#section';
  assert.ok(buildRightsReviewQueue(x).entries[0].blockers.includes('missing_or_invalid_policy_url'));
});
test('expired retention is separately flagged even if valid at capture',()=>{
  const x=make();
  x.approvals[0].retention_until='2026-10-22T00:00:00Z';
  const q=buildRightsReviewQueue(x);
  assert.ok(q.entries[0].blockers.includes('retention_deadline_expired'));
  assert.ok(!q.entries[0].blockers.includes('retention_deadline_precedes_capture'));
  assert.equal(q.entries[0].publication_authorized,false);
});
test('future retention deadline is not marked expired',()=>{
  const x=make();
  x.approvals[0].retention_until='2026-12-01T00:00:00Z';
  assert.ok(!buildRightsReviewQueue(x).entries[0].blockers.includes('retention_deadline_expired'));
});

test('overdue independent rights review is explicitly triaged',()=>{
  const x=make();
  x.approvals[0].review_due_at='2026-10-22T00:00:00Z';
  const entry=buildRightsReviewQueue(x).entries[0];
  assert.ok(entry.blockers.includes('rights_review_overdue'));
  assert.equal(entry.publication_authorized,false);
});
test('future rights review deadline is not marked overdue',()=>{
  const x=make();
  x.approvals[0].review_due_at='2026-10-24T00:00:00Z';
  assert.ok(!buildRightsReviewQueue(x).entries[0].blockers.includes('rights_review_overdue'));
});
test('missing or malformed rights review date is not silently accepted',()=>{
  const x=make();
  x.approvals[0].review_due_at='not-a-date';
  assert.ok(buildRightsReviewQueue(x).entries[0].blockers.includes('rights_review_due_date_missing_or_invalid'));
  delete x.approvals[0].review_due_at;
  assert.ok(buildRightsReviewQueue(x).entries[0].blockers.includes('rights_review_due_date_missing_or_invalid'));
});
test('expired acquisition approval triggers renewal review without retroactively invalidating capture',()=>{
  const x=make();
  x.approvals[0].expires_at='2026-10-21T00:00:00Z';
  const entry=buildRightsReviewQueue(x).entries[0];
  assert.ok(entry.blockers.includes('acquisition_authorization_expired_for_new_captures'));
  assert.equal(entry.snapshot_count,1);
  assert.equal(entry.publication_authorized,false);
});
test('future acquisition expiry is not flagged as expired',()=>{
  const x=make();
  assert.ok(!buildRightsReviewQueue(x).entries[0].blockers.includes('acquisition_authorization_expired_for_new_captures'));
});
test('uncaptured approval without expiry remains on hold for human review',()=>{
  const x=make();
  x.snapshots=[];
  x.approvals[0].expires_at=null;
  const entry=buildRightsReviewQueue(x).entries[0];
  assert.ok(entry.blockers.includes('acquisition_expiry_missing_or_invalid'));
  assert.equal(entry.publication_authorized,false);
});
test('large batch of separate authorized captures preserves retention triage',()=>{
  const x=make();
  x.approvals[0].retention_until='2026-10-19T00:00:00Z';
  x.snapshots=Array.from({length:300},(_,i)=>({
    ...structuredClone(x.snapshots[0]),
    id: i.toString(16).padStart(8,'0')+'-dddd-dddd-dddd-dddddddddddd'
  }));
  const q=buildRightsReviewQueue(x);
  assert.equal(q.snapshot_count,300);
  assert.ok(q.entries[0].blockers.includes('retention_deadline_precedes_capture'));
  assert.equal(q.publication_authorized,false);
});

test('same digest across different source approvals is flagged for separate rights scope',()=> {
  const x=make();
  const source2={id:uuid('1'),canonical_url:'https://other.gov/nail'};
  const approval2={...structuredClone(x.approvals[0]),id:uuid('2'),source_id:source2.id,
    asset_url:source2.canonical_url,approved_final_url:source2.canonical_url};
  const snapshot2={...structuredClone(x.snapshots[0]),id:uuid('3'),source_id:source2.id,
    final_url:source2.canonical_url,
    storage_path:source2.id+'/'+x.snapshots[0].sha256+'/original.html',
    provenance:{asset_approval_id:approval2.id}};
  x.sources.push(source2);x.approvals.push(approval2);x.snapshots.push(snapshot2);
  const q=buildRightsReviewQueue(x);
  assert.equal(q.snapshot_count,2);
  assert.equal(q.entries.length,2);
  for (const entry of q.entries) {
    assert.ok(entry.blockers.includes('shared_content_hash_across_sources_scope_review_required'));
    assert.equal(entry.publication_authorized,false);
  }
  assert.ok(!JSON.stringify(q).includes('other.gov'));
});
test('same content digest with contradictory recorded byte lengths fails closed',()=> {
  const x=make();
  const duplicate=structuredClone(x.snapshots[0]);
  duplicate.id=uuid('1');
  duplicate.byte_length=121;
  x.snapshots.push(duplicate);
  assert.throws(()=>buildRightsReviewQueue(x),/conflicting_content_hash_byte_length/);
});
test('same-source repeated digest preserves separate snapshots without cross-source rights flag',()=> {
  const x=make();
  const second=structuredClone(x.snapshots[0]);
  second.id=uuid('1');
  x.snapshots.push(second);
  const q=buildRightsReviewQueue(x);
  assert.equal(q.snapshot_count,2);
  assert.ok(!q.entries[0].blockers.includes('shared_content_hash_across_sources_scope_review_required'));
  assert.equal(q.publication_authorized,false);
});

test('same source and digest under distinct acquisition approvals require separate scope review',()=> {
  const x=make();
  const secondApproval={...structuredClone(x.approvals[0]),id:uuid('1')};
  const secondSnapshot={...structuredClone(x.snapshots[0]),id:uuid('2'),
    provenance:{asset_approval_id:secondApproval.id}};
  x.approvals.push(secondApproval);
  x.snapshots.push(secondSnapshot);
  const q=buildRightsReviewQueue(x);
  assert.equal(q.snapshot_count,2);
  assert.equal(q.approval_count,2);
  for (const entry of q.entries) {
    assert.ok(entry.blockers.includes('shared_content_hash_across_approvals_scope_review_required'));
    assert.ok(!entry.blockers.includes('shared_content_hash_across_sources_scope_review_required'));
    assert.equal(entry.publication_authorized,false);
  }
});

test('repeated byte-identical captures under one approval do not invent a cross-approval rights conflict',()=> {
  const x=make();
  const second=structuredClone(x.snapshots[0]);
  second.id=uuid('1');
  x.snapshots.push(second);
  const entry=buildRightsReviewQueue(x).entries[0];
  assert.equal(entry.snapshot_count,2);
  assert.ok(!entry.blockers.includes('shared_content_hash_across_approvals_scope_review_required'));
  assert.equal(entry.publication_authorized,false);
});

test('registered sources lacking acquisition approvals are explicitly held without URL disclosure',()=> {
  const x=make();
  const unapproved={id:uuid('1'),canonical_url:'https://private.example.invalid/unapproved'};
  x.sources.push(unapproved);
  const q=buildRightsReviewQueue(x);
  assert.equal(q.source_count,2);
  assert.equal(q.approval_count,1);
  assert.equal(q.sources_without_authorized_acquisition_count,1);
  assert.deepEqual(q.sources_without_authorized_acquisition_ids,[unapproved.id]);
  assert.ok(Object.isFrozen(q.sources_without_authorized_acquisition_ids));
  assert.equal(q.publication_authorized,false);
  assert.ok(!JSON.stringify(q).includes('private.example.invalid'));
});
test('a registered source with an explicitly unauthorized approval remains on acquisition hold',()=> {
  const x=make();
  x.snapshots=[];
  x.approvals[0].acquisition_authorized=false;
  const q=buildRightsReviewQueue(x);
  assert.equal(q.sources_without_authorized_acquisition_count,1);
  assert.deepEqual(q.sources_without_authorized_acquisition_ids,[x.sources[0].id]);
  assert.ok(q.entries[0].blockers.includes('acquisition_not_authorized'));
  assert.equal(q.publication_authorized,false);
});
test('authorized sources do not enter the missing-authorization queue',()=> {
  const q=buildRightsReviewQueue(make());
  assert.equal(q.source_count,1);
  assert.equal(q.sources_without_authorized_acquisition_count,0);
  assert.deepEqual(q.sources_without_authorized_acquisition_ids,[]);
  assert.equal(q.publication_authorized,false);
});

test('authorized but uncaptured approval is explicitly queued without authorizing a fetch',()=> {
  const x=make();
  x.snapshots=[];
  const q=buildRightsReviewQueue(x);
  assert.equal(q.sources_without_archived_snapshots_count,1);
  assert.deepEqual(q.sources_without_archived_snapshots_ids,[x.sources[0].id]);
  assert.equal(q.authorized_uncaptured_approval_count,1);
  assert.deepEqual(q.authorized_uncaptured_approval_ids,[x.approvals[0].id]);
  assert.equal(q.publication_authorized,false);
  assert.ok(Object.isFrozen(q.authorized_uncaptured_approval_ids));
  assert.ok(Object.isFrozen(q.sources_without_archived_snapshots_ids));
});
test('uncleared source and authorized uncaptured approval are counted separately',()=> {
  const x=make();
  const unapproved={id:uuid('1'),canonical_url:'https://private.example.invalid/no-rights'};
  x.sources.push(unapproved);
  const q=buildRightsReviewQueue(x);
  assert.equal(q.sources_without_authorized_acquisition_count,1);
  assert.deepEqual(q.sources_without_authorized_acquisition_ids,[unapproved.id]);
  assert.equal(q.sources_without_archived_snapshots_count,1);
  assert.deepEqual(q.sources_without_archived_snapshots_ids,[unapproved.id]);
  assert.equal(q.authorized_uncaptured_approval_count,0);
  assert.ok(!JSON.stringify(q).includes('private.example.invalid'));
});
test('distinct approval for archived source can be uncaptured without losing source archive status',()=> {
  const x=make();
  const secondApproval={...structuredClone(x.approvals[0]),id:uuid('1')};
  x.approvals.push(secondApproval);
  const q=buildRightsReviewQueue(x);
  assert.equal(q.sources_without_archived_snapshots_count,0);
  assert.equal(q.authorized_uncaptured_approval_count,1);
  assert.deepEqual(q.authorized_uncaptured_approval_ids,[secondApproval.id]);
  assert.equal(q.snapshot_count,1);
  assert.equal(q.publication_authorized,false);
});
test('unauthorized approval without captures never enters authorized acquisition worklist',()=> {
  const x=make();
  x.snapshots=[];
  x.approvals[0].acquisition_authorized=false;
  const q=buildRightsReviewQueue(x);
  assert.equal(q.sources_without_authorized_acquisition_count,1);
  assert.equal(q.sources_without_archived_snapshots_count,1);
  assert.equal(q.authorized_uncaptured_approval_count,0);
  assert.deepEqual(q.authorized_uncaptured_approval_ids,[]);
  assert.equal(q.publication_authorized,false);
});
