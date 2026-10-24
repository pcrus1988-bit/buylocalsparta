import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { observe,append,verify,root } from './attestation-ledger.mjs';
const uuid = c => c.repeat(8) + '-' + c.repeat(4) + '-' + c.repeat(4) + '-' + c.repeat(4) + '-' + c.repeat(12);
const original = Buffer.from('synthetic private original');
const digest = createHash('sha256').update(original).digest('hex');
const source = {id:uuid('a'),canonical_url:'https://agency.gov/document'};
const approval = {id:uuid('b'),source_id:source.id,asset_url:source.canonical_url,approved_final_url:source.canonical_url,acquisition_authorized:true,approved_at:'2026-10-01T00:00:00Z',expires_at:'2026-10-31T00:00:00Z'};
const snapshot = {id:uuid('c'),source_id:source.id,sha256:digest,byte_length:original.length,final_url:source.canonical_url,storage_bucket:'nyxi-evidence',storage_path:source.id+'/'+digest+'/original.html',fetched_at:'2026-10-20T00:00:00Z',provenance:{asset_approval_id:approval.id}};
const f = () => ({source:structuredClone(source),approval:structuredClone(approval),snapshot:structuredClone(snapshot),observedAt:'2026-10-23T07:19:00Z'});
const fail = (change,reason) => {const v=f();change(v);assert.throws(()=>observe(v),new RegExp(reason));};
test('catalog observation never claims original bytes or publication',()=>{const e=observe(f());assert.equal(e.type,'catalog_observed');assert.equal(e.publication_authorized,false)});
test('actual bytes produce original-byte observation',()=>assert.equal(observe({...f(),originalBytes:original}).type,'original_bytes_verified'));
test('changed original bytes rejected',()=>assert.throws(()=>observe({...f(),originalBytes:Buffer.alloc(original.length)}),/original_bytes_mismatch/));
test('non-byte claim rejected',()=>assert.throws(()=>observe({...f(),originalBytes:true}),/original_bytes_required/));
test('source mismatch rejected',()=>fail(v=>v.snapshot.source_id=uuid('d'),'acquisition_binding_invalid'));
test('approval provenance substitution rejected',()=>fail(v=>v.snapshot.provenance.asset_approval_id=uuid('d'),'acquisition_binding_invalid'));
test('unauthorized acquisition rejected',()=>fail(v=>v.approval.acquisition_authorized=false,'acquisition_binding_invalid'));
test('redirected URL substitution rejected',()=>fail(v=>v.snapshot.final_url='https://other.gov/','exact_url_invalid'));
test('non-HTTPS URL rejected',()=>fail(v=>v.source.canonical_url='http://agency.gov/document','exact_url_invalid'));
test('pre-approval capture rejected',()=>fail(v=>v.snapshot.fetched_at='2026-09-01T00:00:00Z','capture_outside_authorization'));
test('capture at expiry rejected',()=>fail(v=>v.snapshot.fetched_at=v.approval.expires_at,'capture_outside_authorization'));
test('historical capture can be observed after expiry',()=>{const v=f();v.observedAt='2026-11-02T00:00:00Z';assert.equal(observe(v).type,'catalog_observed')});
test('wrong Storage bucket rejected',()=>fail(v=>v.snapshot.storage_bucket='public','invalid_private_storage_binding'));
test('path traversal rejected',()=>fail(v=>v.snapshot.storage_path=source.id+'/'+digest+'/../private','invalid_private_storage_binding'));
test('wrong content-addressed path rejected',()=>fail(v=>v.snapshot.storage_path='other/path','invalid_private_storage_binding'));
test('bad snapshot SHA rejected',()=>fail(v=>v.snapshot.sha256='123','invalid_snapshot_hash_or_size'));
test('hold event permits only fixed review reasons',()=>{assert.equal(observe({...f(),holdReason:'missing_rights_evidence'}).publication_authorized,false);assert.throws(()=>observe({...f(),holdReason:'allow'}),/invalid_hold/)});
test('hold event cannot also attest original bytes',()=>assert.throws(()=>observe({...f(),holdReason:'missing_retention',originalBytes:original}),/invalid_hold/));
test('chain validates against independently pinned root',()=>{let c=append([],observe(f()));c=append(c,observe({...f(),holdReason:'missing_retention'}));assert.equal(verify(c,root(c)),true)});
test('no external root fails closed',()=>{const c=append([],observe(f()));assert.equal(verify(c),false)});
test('modified event is detected',()=>{const c=append([],observe(f()));const t=structuredClone(c);t[0].event.snapshot_sha256='f'.repeat(64);assert.equal(verify(t,root(c)),false)});
test('truncation detected against external root',()=>{let c=append([],observe(f()));c=append(c,observe({...f(),holdReason:'undecidable_scope'}));assert.equal(verify(c.slice(0,1),root(c)),false)});
test('reordering detected',()=>{let c=append([],observe(f()));c=append(c,observe({...f(),holdReason:'missing_retention'}));const pinned=root(c);assert.equal(verify(c.reverse(),pinned),false)});
test('private fragment text rejected from event schema',()=>assert.throws(()=>append([],{...observe(f()),body_text:'private'}),/invalid_event_schema/));
test('publication true rejected',()=>assert.throws(()=>append([],{...observe(f()),publication_authorized:true}),/invalid_event_fields/));
test('metadata event excludes Storage path and original text',()=>{const e=observe({...f(),originalBytes:original});assert.ok(!JSON.stringify(e).includes('original.html'));assert.ok(!JSON.stringify(e).includes('synthetic private original'))});
test('deterministic chain root',()=>{const e=observe(f());assert.equal(root(append([],e)),root(append([],e)))});

test('append rejects a tampered existing event even if last hash has correct format',()=>{
  const chain=append([],observe(f()));
  const changed=structuredClone(chain);
  changed[0].event.snapshot_sha256='f'.repeat(64);
  assert.throws(()=>append(changed,observe(f())),/invalid_existing_chain/);
});
test('append rejects a broken predecessor hash and sequence',()=>{
  let chain=append([],observe(f()));
  chain=append(chain,observe({...f(),holdReason:'missing_retention'}));
  const changed=structuredClone(chain);
  changed[1].previous_hash='f'.repeat(64);
  assert.throws(()=>append(changed,observe(f())),/invalid_existing_chain/);
  const sequence=structuredClone(chain);
  sequence[1].sequence=3;
  assert.throws(()=>append(sequence,observe(f())),/invalid_existing_chain/);
});
test('root rejects a tampered or truncated row instead of exporting false assurance',()=>{
  const chain=append([],observe(f()));
  const changed=structuredClone(chain);
  changed[0].event.byte_length++;
  assert.throws(()=>root(changed),/invalid_existing_chain/);
  const missing=structuredClone(chain);
  delete missing[0].entry_hash;
  assert.throws(()=>root(missing),/invalid_existing_chain/);
});
test('valid multi-event chain remains appendable and root-verifiable',()=>{
  let chain=append([],observe(f()));
  chain=append(chain,observe({...f(),holdReason:'undecidable_scope'}));
  chain=append(chain,observe({...f(),originalBytes:original}));
  assert.equal(verify(chain,root(chain)),true);
  assert.equal(chain.length,3);
});


test('observation cannot precede its archived capture',()=>{
  const v=f();v.observedAt='2026-10-19T23:59:59Z';
  assert.throws(()=>observe(v),/invalid_event_fields/);
});
test('append rejects hash and byte-length identity drift for one snapshot',()=>{
  const chain=append([],observe(f()));
  const hashDrift={...observe(f()),snapshot_sha256:'f'.repeat(64)};
  assert.throws(()=>append(chain,hashDrift),/snapshot_identity_drift/);
  const sizeDrift={...observe(f()),byte_length:original.length+1};
  assert.throws(()=>append(chain,sizeDrift),/snapshot_identity_drift/);
});
test('append rejects authorization, source and capture-time identity drift',()=>{
  const chain=append([],observe(f()));
  for(const [field,value] of [['approval_id',uuid('d')],['source_id',uuid('e')],['fetched_at','2026-10-19T00:00:00Z']]){
    assert.throws(()=>append(chain,{...observe(f()),[field]:value}),/snapshot_identity_drift/);
  }
});
test('verification rejects internally rehashed contradictory snapshot identities',()=>{
  const first=append([],observe(f()));
  const changed={...observe(f()),snapshot_sha256:'f'.repeat(64)};
  const row={sequence:2,previous_hash:first[0].entry_hash,event:changed};
  const canonical=value=>{
    if(value===null || typeof value==='string' || typeof value==='boolean' || typeof value==='number') return JSON.stringify(value);
    if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  };
  const forgedRoot=createHash('sha256').update('NYXI_AGENT1_LEDGER_V1\n'+canonical(row)).digest('hex');
  assert.equal(verify([...first,{...row,entry_hash:forgedRoot}],forgedRoot),false);
});

test('caller-forged byte attestation cannot be appended without trusted observe capability',()=>{
  const genuine=observe({...f(),originalBytes:original});
  const forged=structuredClone(genuine);
  assert.throws(()=>append([],forged),/unverified_byte_attestation_event/);
  assert.equal(append([],genuine).length,1);
});
test('byte-verified event identity is frozen after original-byte digest',()=>{
  const event=observe({...f(),originalBytes:original});
  assert.equal(Object.isFrozen(event),true);
  assert.throws(()=>{event.snapshot_sha256='f'.repeat(64)},TypeError);
});


test('impossible calendar capture cannot be normalized into a valid authorization window',()=>{
  fail(v=>v.snapshot.fetched_at='2026-02-30T00:00:00Z','capture_outside_authorization');
});
test('ambiguous date-only authorization is rejected',()=>{
  fail(v=>v.approval.approved_at='2026-10-01','capture_outside_authorization');
});
test('24-hour timestamp rollover is rejected in observation',()=>{
  fail(v=>v.observedAt='2026-10-23T24:00:00Z','invalid_observed_at');
});
test('valid leap day and explicit timezone offset are accepted',()=>{
  const v=f();
  v.approval.approved_at='2024-02-29T12:00:00+02:00';
  v.snapshot.fetched_at='2026-10-20T03:00:00+03:00';
  assert.equal(observe(v).type,'catalog_observed');
});
test('invalid timezone offset cannot extend acquisition authorization',()=>{
  fail(v=>v.approval.expires_at='2026-10-31T00:00:00+15:00','capture_outside_authorization');
});


test('percent-encoded traversal is rejected before private Storage lookup',()=>{
  fail(v=>v.snapshot.storage_path=source.id+'/'+digest+'/original%2e%2e/private','invalid_private_storage_binding');
});
test('encoded path separator is rejected before private Storage lookup',()=>{
  fail(v=>v.snapshot.storage_path=source.id+'/'+digest+'/original%2fprivate','invalid_private_storage_binding');
});
test('query and fragment delimiters cannot alter exact private Storage identity',()=>{
  for(const suffix of ['original.html?download=1','original.html#version'])
    fail(v=>v.snapshot.storage_path=source.id+'/'+digest+'/'+suffix,'invalid_private_storage_binding');
});
test('control characters are rejected from private Storage object paths',()=>{
  fail(v=>v.snapshot.storage_path=source.id+'/'+digest+'/original\n.html','invalid_private_storage_binding');
});
test('ordinary content-addressed Storage paths remain valid',()=>{
  const v=f();
  v.snapshot.storage_path=source.id+'/'+digest+'/archive/2026-10-20_original.v1.html';
  assert.equal(observe(v).type,'catalog_observed');
});
