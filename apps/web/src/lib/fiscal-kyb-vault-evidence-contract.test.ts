import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {sealFiscalKybQuarantineInMemory} from "./fiscal-kyb-vault-core.ts";
import {
 FISCAL_VAULT_PRODUCTION_GATES,appendFiscalVaultAuditPlan,
 digestFiscalVaultEncryptedEnvelope,fiscalVaultScanSigningBytes,
 inspectFiscalVaultAuditPlan,planFiscalVaultQuarantineLocator,
 verifyFiscalVaultScanStatement
} from "./fiscal-kyb-vault-evidence-contract.ts";

const scope={
 organizationId:"11111111-1111-4111-8111-111111111111",
 evidenceId:"33333333-3333-4333-8333-333333333333",
 checkType:"business_registration"
} as const;
const other={...scope,organizationId:"22222222-2222-4222-8222-222222222222"};
const bytes=Buffer.from("%PDF-1.7\nSynthetic no real documents\n%%EOF\n");
const digest=createHash("sha256").update(bytes).digest("hex");
const encrypted=sealFiscalKybQuarantineInMemory({
 context:scope,plaintext:bytes,encryptionKey:Buffer.alloc(32,9),
 metadata:{filename:"synthetic.pdf",mimeType:"application/pdf",
  byteLength:bytes.length,sha256:digest}
});
const encDigest=digestFiscalVaultEncryptedEnvelope(encrypted);
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const clock=Date.parse("2026-10-19T08:30:00.000Z");
const unsigned={
 version:1,organizationId:scope.organizationId,evidenceId:scope.evidenceId,
 checkType:scope.checkType,encryptedDigest:encDigest,
 scannerId:"ci-scanner",scannerVersion:"0.0.1-test",
 scannedAt:"2026-10-19T08:29:05.000Z",verdict:"clean"
} as const;

function makeSigned(fields:Record<string,unknown>={...unsigned}){
 return {...fields,
  signatureHex:sign(null,fiscalVaultScanSigningBytes(fields),privateKey).toString("hex")
 };
}
function verify(statement:unknown,overrides:Record<string,unknown>={}){
 return verifyFiscalVaultScanStatement({
  statement,expectedContext:scope,encryptedDigest:encDigest,
  scannerPublicKey:publicKey,now:clock,...overrides
 });
}

test("M33 random quarantine locator is scoped and never a URL or upload grant",()=>{
 const a=planFiscalVaultQuarantineLocator(scope);
 const b=planFiscalVaultQuarantineLocator(scope);
 assert.notEqual(a.key,b.key);
 assert.match(a.key,/^kyb-quarantine\/v1\/11111111-1111-4111-8111-111111111111\/33333333-3333-4333-8333-333333333333\/[a-f0-9]{40}$/);
 assert.equal(a.canStoreProduction,false);
 assert.equal(a.signedUrlIssued,false);
 assert.equal(a.purpose,"quarantine_only");
 assert.ok(Object.isFrozen(a));
 assert.ok(!a.key.includes("synthetic.pdf"));
 for(const x of [other,{...scope,checkType:"unknown"},
  {...scope,evidenceId:"../other"}, {...scope,extra:"unauthorized"}])
  if(x===other)assert.equal(planFiscalVaultQuarantineLocator(x).organizationId,other.organizationId);
  else assert.throws(()=>planFiscalVaultQuarantineLocator(x),/VAULT_SCOPE_INVALID/);
});

test("M33 signed Ed25519 scanner verdict is authenticated but never releases quarantined data",()=>{
 assert.match(encDigest,/^[0-9a-f]{64}$/);
 const stmt=makeSigned();
 const r=verify(stmt);
 assert.equal(r.signedStatementAuthentic,true);
 assert.equal(r.verdict,"clean");
 assert.equal(r.quarantineMayOpen,false);
 assert.equal(r.canRelease,false);
 assert.equal(r.merchantApproved,false);
 assert.equal(r.statutoryIssuanceEnabled,false);
 assert.ok(Object.isFrozen(r));
 for(const verdict of ["malicious","scan_error"]){
  const result=verify(makeSigned({...unsigned,verdict}));
  assert.equal(result.verdict,verdict);
  assert.equal(result.canRelease,false);
 }
});

test("M33 detects replay, signature forgery, unknown fields, expiration and wrong trust roots",()=>{
 const good=makeSigned();
 const candidates=[
  {...good,organizationId:other.organizationId},
  {...good,evidenceId:"44444444-4444-4444-8444-444444444444"},
  {...good,checkType:"beneficial_ownership"},
  {...good,encryptedDigest:"a".repeat(64)},
  {...good,verdict:"malicious"},
  {...good,signatureHex:"0".repeat(128)},
  {...good,extra:"override"},
  {...good,signatureHex:"bad"},
  {...good,scannerId:"../oops"}
 ];
 for(const s of candidates)
  assert.throws(()=>verify(s),/VAULT_SCAN_(INVALID|SIGNATURE_INVALID)/);
 assert.throws(()=>verify(makeSigned({...unsigned,
  scannedAt:"2026-10-19T08:10:00.000Z"})),/VAULT_SCAN_STALE/);
 assert.throws(()=>verify(makeSigned({...unsigned,
  scannedAt:"2026-10-19T08:35:00.000Z"})),/VAULT_SCAN_STALE/);
 const unrelated=generateKeyPairSync("ed25519").publicKey;
 assert.throws(()=>verify(good,{scannerPublicKey:unrelated}),/VAULT_SCAN_SIGNATURE_INVALID/);
 assert.throws(()=>verify(good,{expectedContext:other}),/VAULT_SCAN_INVALID/);
 assert.throws(()=>verify(good,{now:Number.NaN}),/VAULT_SCAN_INVALID/);
});

test("M33 encrypted envelope digest is bound to the original sealed bytes",()=>{
 assert.notEqual(digestFiscalVaultEncryptedEnvelope(
  sealFiscalKybQuarantineInMemory({
   context:scope,plaintext:bytes,encryptionKey:Buffer.alloc(32,9),
   metadata:{filename:"synthetic.pdf",mimeType:"application/pdf",
    byteLength:bytes.length,sha256:digest}
  })),encDigest,"fresh nonce changes encrypted digest");
 assert.throws(()=>digestFiscalVaultEncryptedEnvelope({
  ...encrypted,releaseAuthorized:true
 }),/VAULT_ENVELOPE_DIGEST_INVALID/);
 assert.throws(()=>digestFiscalVaultEncryptedEnvelope({
  ...encrypted,unapprovedField:true
 }),/VAULT_ENVELOPE_DIGEST_INVALID/);
});

test("M33 audit chain links synthetic events and rejects modified/reordered records",()=>{
 const first=appendFiscalVaultAuditPlan({
  previous:null,scope,kind:"quarantine_planned",
  encryptedDigest:encDigest,recordedAt:"2026-10-19T08:30:00.000Z"
 });
 const second=appendFiscalVaultAuditPlan({
  previous:first,scope,kind:"ciphertext_written",
  encryptedDigest:encDigest,recordedAt:"2026-10-19T08:31:00.000Z"
 });
 const third=appendFiscalVaultAuditPlan({
  previous:second,scope,kind:"scan_attested",
  encryptedDigest:encDigest,recordedAt:"2026-10-19T08:32:00.000Z"
 });
 const evaluation=inspectFiscalVaultAuditPlan([first,second,third]);
 assert.equal(evaluation.entriesChecked,3);
 assert.equal(evaluation.chainConsistent,true);
 assert.equal(evaluation.independentlyAnchored,false);
 assert.equal(evaluation.immutableAuditConfirmed,false);
 assert.equal(evaluation.objectDeletedConfirmed,false);
 assert.equal(evaluation.canRelease,false);
 assert.ok(Object.isFrozen(evaluation));
 assert.ok(Object.isFrozen(first));
 for(const records of [
  [second,first,third],[first,third],
  [first,{...second,kind:"delete_observed"},third],
  [first,{...second,hash:"b".repeat(64)},third]
 ])assert.throws(()=>inspectFiscalVaultAuditPlan(records as never),
  /VAULT_AUDIT_CHAIN_INVALID/);
 assert.throws(()=>appendFiscalVaultAuditPlan({
  previous:first,scope:other,kind:"scan_attested",
  encryptedDigest:encDigest,recordedAt:"2026-10-19T08:32:00.000Z"
 }),/VAULT_AUDIT_CHAIN_INVALID/);
 assert.throws(()=>appendFiscalVaultAuditPlan({
  previous:first,scope,kind:"scan_attested",
  encryptedDigest:encDigest,recordedAt:"2026-10-19T08:20:00.000Z"
 }),/VAULT_AUDIT_CHAIN_INVALID/);
});

test("M33 all production connectors, authorization, and legal issuance remain disabled",()=>{
 const g=FISCAL_VAULT_PRODUCTION_GATES;
 assert.equal(Object.values(g).length,14);
 assert.ok(Object.values(g).every(x=>x===false));
 assert.ok(Object.isFrozen(g));
 const source=readFileSync(new URL("./fiscal-kyb-vault-evidence-contract.ts",
  import.meta.url),"utf8");
 assert.ok(!/fetch\s*\(|S3Client|createPresignedPost|supabase\.storage|FormData|onSubmit/.test(source));
 const admin=readFileSync(new URL("../app/timologio-admin/kyb-intake-readiness/page.tsx",
  import.meta.url),"utf8");
 assert.ok(!/type="file"|onSubmit|FormData|Blob\(|fetch\s*\(/.test(admin));
});
