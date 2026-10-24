import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,generateKeyPairSync,sign } from 'node:crypto';
import { append,observe } from './attestation-ledger.mjs';
import { createWitnessRequest,verifyWitnessCheckpoint,publicKeyFingerprint } from './witness-checkpoint.mjs';

const uuid = c => [8,4,4,4,12].map(n=>c.repeat(n)).join('-');
const original=Buffer.from('synthetic private original');
const hash=createHash('sha256').update(original).digest('hex');
const source={id:uuid('a'),canonical_url:'https://agency.gov/document'};
const approval={id:uuid('b'),source_id:source.id,asset_url:source.canonical_url,approved_final_url:source.canonical_url,acquisition_authorized:true,approved_at:'2026-10-01T00:00:00Z',expires_at:'2026-10-31T00:00:00Z'};
const snapshot={id:uuid('c'),source_id:source.id,sha256:hash,byte_length:original.length,final_url:source.canonical_url,storage_bucket:'nyxi-evidence',storage_path:source.id+'/'+hash+'/original.html',fetched_at:'2026-10-20T00:00:00Z',provenance:{asset_approval_id:approval.id}};
const makeEvent=()=>observe({source,approval,snapshot,observedAt:'2026-10-23T09:13:00Z'});
const chain=append([],makeEvent());
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const other=generateKeyPairSync('ed25519');
const requestArgs={witnessId:'external-witness-01',issuedAt:'2026-10-23T09:13:07.000Z'};
const makeCheckpoint=(c=chain,issuedAt=requestArgs.issuedAt)=>{const {request,signing_payload}=createWitnessRequest(c,{...requestArgs,issuedAt});return {request,signature_base64:sign(null,Buffer.from(signing_payload),privateKey).toString('base64')}};
const check=(c,cp,key=publicKey,id='external-witness-01')=>verifyWitnessCheckpoint(c,cp,{pinnedPublicKey:key,expectedWitnessId:id});

test('external Ed25519 signature and pinned witness verify',()=>assert.equal(check(chain,makeCheckpoint()),true));
test('metadata-only request excludes original bytes, private paths, and rights grants',()=>{const r=createWitnessRequest(chain,requestArgs);const serialized=JSON.stringify(r);assert.ok(!serialized.includes('original.html'));assert.ok(!serialized.includes('synthetic private original'));assert.ok(!serialized.includes('storage_path'));assert.equal(r.request.publication_authorized,false)});
test('unsigned request is not a valid checkpoint',()=>assert.equal(check(chain,{request:makeCheckpoint().request}),false));
test('untrusted substituted witness public key is rejected',()=>assert.equal(check(chain,makeCheckpoint(),other.publicKey),false));
test('expected witness identity must match',()=>assert.equal(check(chain,makeCheckpoint(),publicKey,'different-witness'),false));
test('altered checkpoint root is rejected',()=>{const c=makeCheckpoint();c.request.root_sha256='f'.repeat(64);assert.equal(check(chain,c),false)});
test('altered checkpoint timestamp is rejected',()=>{const c=makeCheckpoint();c.request.issued_at='2026-10-23T09:13:08.000Z';assert.equal(check(chain,c),false)});
test('tampered or truncated chain is rejected against signed checkpoint',()=>{const c=makeCheckpoint();assert.equal(check([],c),false);const broken=structuredClone(chain);broken[0].event.snapshot_sha256='f'.repeat(64);assert.equal(check(broken,c),false)});
test('chain extension requires a new independent signature',()=>{const c=makeCheckpoint();const extended=append(chain,observe({source,approval,snapshot,observedAt:'2026-10-23T09:14:00Z',holdReason:'missing_rights_evidence'}));assert.equal(check(extended,c),false);assert.equal(check(extended,makeCheckpoint(extended,'2026-10-23T09:14:01.000Z')),true)});
test('arbitrary injected metadata fails closed',()=>{const c=makeCheckpoint();c.request.body_text='private';assert.equal(check(chain,c),false)});
test('signature mutation fails closed',()=>{const c=makeCheckpoint();c.signature_base64=Buffer.alloc(64).toString('base64');assert.equal(check(chain,c),false)});
test('noncanonical base64 and malformed signatures fail closed',()=>{const c=makeCheckpoint();c.signature_base64='x';assert.equal(check(chain,c),false)});
test('invalid witness identifiers and dates rejected',()=>{assert.throws(()=>createWitnessRequest(chain,{...requestArgs,witnessId:'../../x'}),/invalid_witness_request/);assert.throws(()=>createWitnessRequest(chain,{...requestArgs,issuedAt:'yesterday'}),/invalid_witness_request/)});
test('corrupted chain cannot be prepared for external signing',()=>{const c=structuredClone(chain);c[0].event.byte_length++;assert.throws(()=>createWitnessRequest(c,requestArgs),/invalid_existing_chain/)});
test('pinned key fingerprint stable and key type enforced',()=>{assert.match(publicKeyFingerprint(publicKey),/^[0-9a-f]{64}$/);assert.throws(()=>publicKeyFingerprint(privateKey),/invalid_pinned_witness_key/)});
test('public release cannot be smuggled into signed checkpoint',()=>{const c=makeCheckpoint();c.request.publication_authorized=true;assert.equal(check(chain,c),false)});

test('request rejects witness issue time before observed event',()=>{
  assert.throws(()=>createWitnessRequest(chain,{...requestArgs,issuedAt:'2026-10-23T09:12:59.000Z'}),/invalid_witness_request/);
});
test('even independently signed backdated checkpoint fails verification',()=>{
  const request={...makeCheckpoint().request,issued_at:'2026-10-23T09:12:59.000Z'};
  const signingPayload='NYXI_AGENT1_EXTERNAL_WITNESS_V1\\n'+JSON.stringify(request);
  const cp={request,signature_base64:sign(null,Buffer.from(signingPayload),privateKey).toString('base64')};
  assert.equal(check(chain,cp),false);
});
test('all observations must predate witness, not only last appended row',()=>{
  const future=append(chain,observe({source,approval,snapshot,observedAt:'2026-10-23T09:15:00Z'}));
  const outOfOrder=append(future,observe({source,approval,snapshot,observedAt:'2026-10-23T09:12:00Z'}));
  assert.throws(()=>createWitnessRequest(outOfOrder,{...requestArgs,issuedAt:'2026-10-23T09:14:00.000Z'}),/invalid_witness_request/);
});
