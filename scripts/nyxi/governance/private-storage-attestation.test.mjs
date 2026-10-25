import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendPrivateStorageAttestation } from './private-storage-attestation.mjs';
import { observe, append, verify, root } from './attestation-ledger.mjs';

const uuid = c => c.repeat(8)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(4)+'-'+c.repeat(12);
const original = Buffer.from('synthetic private original, never a real source');
const hash = createHash('sha256').update(original).digest('hex');
const source = { id: uuid('a'), canonical_url: 'https://agency.gov/document' };
const approval = { id: uuid('b'), source_id: source.id, asset_url: source.canonical_url,
  approved_final_url: source.canonical_url, acquisition_authorized: true,
  approved_at: '2026-10-01T00:00:00Z', expires_at: '2026-10-31T00:00:00Z' };
const snapshot = { id: uuid('c'), source_id: source.id, sha256: hash, byte_length: original.length,
  final_url: source.canonical_url, storage_bucket: 'nyxi-evidence',
  storage_path: source.id+'/'+hash+'/original.html', fetched_at: '2026-10-20T00:00:00Z',
  provenance: { asset_approval_id: approval.id } };
const args = () => ({ chain: [], source: structuredClone(source),
  approval: structuredClone(approval), snapshot: structuredClone(snapshot),
  observedAt: '2026-10-23T12:30:00Z' });

function reader(bytes = original, responseOverride) {
  const calls = [];
  return { calls, from(bucket) {
    calls.push(['bucket',bucket]);
    return { async download(path) {
      calls.push(['path',path]);
      return responseOverride === undefined ? { data: new Blob([bytes]), error: null } : responseOverride;
    } };
  } };
}
const run = (changes = {}, storage = reader()) =>
  appendPrivateStorageAttestation({ ...args(), storage, ...changes });

test('original private bytes produce one verified metadata-only event', async () => {
  const storage = reader();
  const result = await run({}, storage);
  assert.equal(result.chain.length,1);
  assert.equal(result.event.type,'original_bytes_verified');
  assert.equal(result.event.publication_authorized,false);
  assert.equal(verify(result.chain,root(result.chain)),true);
  assert.deepEqual(storage.calls,[['bucket','nyxi-evidence'],['path',snapshot.storage_path]]);
  const json = JSON.stringify(result);
  assert.ok(!json.includes('synthetic private original'));
  assert.ok(!json.includes('original.html'));
});
test('the exact stored bytes are required, not matching metadata alone', async () => {
  const bad = Buffer.from(original); bad[0] ^= 1;
  await assert.rejects(run({},reader(bad)),/original_bytes_mismatch/);
});
test('shorter stored body is rejected before digest', async () =>
  assert.rejects(run({},reader(original.subarray(1))),/private_archive_unavailable_or_size_mismatch/));
test('missing authorized reader is rejected', async () =>
  assert.rejects(run({storage:null}),/authorized_private_storage_reader_required/));
test('storage access failure does not return a catalog-only success', async () =>
  assert.rejects(run({},reader(original,{data:null,error:new Error('denied')})),/private_archive_unavailable_or_size_mismatch/));
test('download exceptions are sanitized and fail closed', async () => {
  const storage = {from(){return {async download(){throw Error('secret path must not leak')}}}};
  await assert.rejects(run({},storage),e => e.message==='private_archive_download_failed');
});
test('invalid response body cannot impersonate Blob', async () =>
  assert.rejects(run({},reader(original,{data:{size:original.length},error:null})),/private_archive_unavailable_or_size_mismatch/));
test('read failure does not become a successful observation', async () =>
  assert.rejects(run({},reader(original,{data:{size:original.length,async arrayBuffer(){throw Error('private')}}})),/private_archive_read_failed/));
test('wrong approval binding prevents any Storage access', async () => {
  const storage=reader();
  const v=args();v.snapshot.provenance.asset_approval_id=uuid('d');
  await assert.rejects(run(v,storage),/acquisition_binding_invalid/);
  assert.equal(storage.calls.length,0);
});
test('unauthorized acquisition prevents any Storage access', async () => {
  const storage=reader();const v=args();v.approval.acquisition_authorized=false;
  await assert.rejects(run(v,storage),/acquisition_binding_invalid/);
  assert.equal(storage.calls.length,0);
});
test('private path traversal prevents any Storage access', async () => {
  const storage=reader();const v=args();v.snapshot.storage_path=source.id+'/'+hash+'/../private';
  await assert.rejects(run(v,storage),/invalid_private_storage_binding/);
  assert.equal(storage.calls.length,0);
});
test('public bucket substitution prevents any Storage access', async () => {
  const storage=reader();const v=args();v.snapshot.storage_bucket='public';
  await assert.rejects(run(v,storage),/invalid_private_storage_binding/);
  assert.equal(storage.calls.length,0);
});
test('archive size ceiling blocks reads before Storage access', async () => {
  const storage=reader();
  await assert.rejects(run({maxBytes:original.length-1},storage),/archive_exceeds_size_limit/);
  assert.equal(storage.calls.length,0);
});
test('caller cannot disable the hard size ceiling', async () =>
  assert.rejects(run({maxBytes:Number.MAX_SAFE_INTEGER}),/invalid_archive_size_limit/));
test('corrupted prior chain prevents any Storage access', async () => {
  const v=args();
  const chain=append([],observe(v));
  chain[0].event.byte_length++;
  const storage=reader();
  await assert.rejects(run({chain},storage),/invalid_existing_chain/);
  assert.equal(storage.calls.length,0);
});
test('historical capture after approval expiry can be independently verified', async () => {
  const result=await run({observedAt:'2026-11-03T12:30:00Z'});
  assert.equal(result.event.type,'original_bytes_verified');
  assert.equal(result.event.publication_authorized,false);
});
test('invalid final URL blocks download even if bytes match', async () => {
  const storage=reader();const v=args();v.snapshot.final_url='https://other.gov/document';
  await assert.rejects(run(v,storage),/exact_url_invalid/);
  assert.equal(storage.calls.length,0);
});
test('original bytes do not establish licensing or publication rights', async () => {
  const result=await run();
  assert.equal(result.event.publication_authorized,false);
  assert.ok(!Object.hasOwn(result.event,'rights_approved'));
});
