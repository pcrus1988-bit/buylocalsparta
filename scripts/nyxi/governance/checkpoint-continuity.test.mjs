import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { append, observe } from './attestation-ledger.mjs';
import { createWitnessRequest, publicKeyFingerprint } from './witness-checkpoint.mjs';
import { checkpointAnchor, verifyWitnessContinuation } from './checkpoint-continuity.mjs';

const uuid = c => [8,4,4,4,12].map(n => c.repeat(n)).join('-');
const bytes = Buffer.from('synthetic test asset');
const hash = createHash('sha256').update(bytes).digest('hex');
const source = { id:uuid('a'), canonical_url:'https://agency.gov/nail-safety' };
const approval = { id:uuid('b'), source_id:source.id, asset_url:source.canonical_url,
  approved_final_url:source.canonical_url, acquisition_authorized:true,
  approved_at:'2026-10-01T00:00:00Z', expires_at:'2026-10-31T00:00:00Z' };
const snapshot = { id:uuid('c'), source_id:source.id, sha256:hash, byte_length:bytes.length,
  final_url:source.canonical_url, storage_bucket:'nyxi-evidence',
  storage_path:source.id+'/'+hash+'/original.html',
  fetched_at:'2026-10-20T00:00:00Z', provenance:{asset_approval_id:approval.id} };
const event = (time, holdReason) => observe({source,approval,snapshot,observedAt:time,holdReason});
const first = append([],event('2026-10-23T08:00:00Z'));
const second = append(first,event('2026-10-23T09:00:00Z','missing_rights_evidence'));
const third = append(second,event('2026-10-23T10:00:00Z','missing_retention'));
const keys = generateKeyPairSync('ed25519');
const otherKeys = generateKeyPairSync('ed25519');
const witnessId = 'independent-witness-01';
const signed = (chain,issuedAt,key=keys.privateKey) => {
  const {request,signing_payload} = createWitnessRequest(chain,{witnessId,issuedAt});
  return {request,signature_base64:sign(null,Buffer.from(signing_payload),key).toString('base64')};
};
const cp1 = signed(first,'2026-10-23T08:01:00.000Z');
const cp2 = signed(second,'2026-10-23T09:01:00.000Z');
const cp3 = signed(third,'2026-10-23T10:01:00.000Z');
const anchor = checkpointAnchor(first,cp1,keys.publicKey,witnessId);
const check = (chain=second,cp=cp2,options={}) => verifyWitnessContinuation(chain,cp,{
  pinnedPublicKey:keys.publicKey,expectedWitnessId:witnessId,previousAnchor:anchor,...options
});

test('valid independently anchored append-only successor',()=>assert.equal(check(),true));
test('longer append-only chain can advance beyond anchored root',()=>assert.equal(check(third,cp3),true));
test('candidate anchor contains metadata only and no publication authorization',()=>{
  assert.deepEqual(Object.keys(anchor).sort(),['entry_count','issued_at','public_key_fingerprint','root_sha256','witness_id'].sort());
  assert.equal(JSON.stringify(anchor).includes('original.html'),false);
  assert.equal(Object.isFrozen(anchor),true);
});
test('unchanged checkpoint is not a successor',()=>assert.equal(check(first,cp1),false));
test('truncated chain cannot pass signed successor verification',()=>assert.equal(check(first,cp2),false));
test('different anchored root is rejected',()=>assert.equal(check(second,cp2,{previousAnchor:{...anchor,root_sha256:'f'.repeat(64)}}),false));
test('incorrect anchored count is rejected',()=>assert.equal(check(second,cp2,{previousAnchor:{...anchor,entry_count:2}}),false));
test('untrusted injected anchor field rejected',()=>assert.equal(check(second,cp2,{previousAnchor:{...anchor,publication_authorized:true}}),false));
test('key rotation requires separately pinned key and anchor',()=>assert.equal(check(second,cp2,{pinnedPublicKey:otherKeys.publicKey}),false));
test('substituted witness identity rejected',()=>assert.equal(check(second,cp2,{expectedWitnessId:'another-witness'}),false));
test('signature from another private key rejected',()=>assert.equal(check(second,signed(second,'2026-10-23T09:01:00.000Z',otherKeys.privateKey)),false));
test('nonmonotonic issued-at time cannot be signed',()=>assert.throws(()=>signed(second,'2026-10-23T08:01:00.000Z'),/invalid_witness_request/));
test('older issued-at time cannot be signed',()=>assert.throws(()=>signed(second,'2026-10-23T07:59:00.000Z'),/invalid_witness_request/));
test('altered prefix of appended chain rejected',()=>{
  const altered=structuredClone(second); altered[0].event.snapshot_sha256='f'.repeat(64);
  assert.equal(check(altered,cp2),false);
});
test('pinned fingerprint must match exact public key',()=>assert.equal(check(second,cp2,{previousAnchor:{...anchor,public_key_fingerprint:'f'.repeat(64)}}),false));
test('invalid missing anchor and private-key anchor rejected',()=>{
  assert.equal(check(second,cp2,{previousAnchor:undefined}),false);
  assert.throws(()=>checkpointAnchor(first,cp1,keys.privateKey,witnessId),/invalid_checkpoint_anchor/);
});
test('candidate anchor fingerprint is deterministic',()=>assert.equal(anchor.public_key_fingerprint,publicKeyFingerprint(keys.publicKey)));
test('forged checkpoint cannot produce an independently pinnable anchor',()=>{
  const fake={request:{...cp1.request,root_sha256:'f'.repeat(64)},signature_base64:cp1.signature_base64};
  assert.throws(()=>checkpointAnchor(first,fake,keys.publicKey,witnessId),/invalid_checkpoint_anchor/);
});
test('unsigned checkpoint cannot produce a verified anchor',()=>{
  assert.throws(()=>checkpointAnchor(first,{request:cp1.request},keys.publicKey,witnessId),/invalid_checkpoint_anchor/);
});
test('truncated chain cannot produce a verified anchor',()=>{
  assert.throws(()=>checkpointAnchor([],cp1,keys.publicKey,witnessId),/invalid_checkpoint_anchor/);
});
