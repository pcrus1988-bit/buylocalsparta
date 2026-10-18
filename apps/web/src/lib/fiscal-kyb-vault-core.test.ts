import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 FISCAL_KYB_VAULT_MAX_BYTES,sealFiscalKybQuarantineInMemory,
 verifyFiscalKybQuarantineIntegrity,planFiscalKybVaultTransition,
 fiscalKybVaultLifecycle
} from "./fiscal-kyb-vault-core.ts";

const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const E="33333333-3333-4333-8333-333333333333";
const context={organizationId:A,evidenceId:E,checkType:"business_registration"};
const pdf=Buffer.from("%PDF-1.7\n%Synthetic test only\ntrailer\n%%EOF\n");
const metadata=(body:Buffer,mimeType="application/pdf",filename="sample.pdf")=>({
 filename,mimeType,byteLength:body.length,
 sha256:createHash("sha256").update(body).digest("hex")
});
const key=Buffer.alloc(32,7);
const seal=(overrides:Record<string,unknown>={})=>
 sealFiscalKybQuarantineInMemory({
  context,metadata:metadata(pdf),plaintext:pdf,encryptionKey:key,...overrides
 });

test("M32 AES-256-GCM seals synthetic PDFs and never grants release",()=>{
 const first=seal(),second=seal();
 assert.equal(first.version,1);
 assert.equal(first.algorithm,"AES-256-GCM");
 assert.equal(first.scanStatus,"unscanned");
 assert.equal(first.quarantineOnly,true);
 assert.equal(first.releaseAuthorized,false);
 assert.equal(first.fiscalIssuanceEnabled,false);
 assert.notEqual(first.nonceHex,second.nonceHex);
 assert.notEqual(first.ciphertextHex,second.ciphertextHex);
 assert.ok(!JSON.stringify(first).includes("Synthetic test only"));
 assert.equal(first.ciphertextHex.length,pdf.length*2);
 assert.ok(Object.isFrozen(first));
 assert.deepEqual(verifyFiscalKybQuarantineIntegrity({
  expectedContext:context,encryptionKey:key,envelope:first
 }),{
  integrityValid:true,tenantBound:true,scanStatus:"unscanned",
  releaseAuthorized:false,bytesExposed:false,canPersist:false,
  fiscalIssuanceEnabled:false
 });
});

test("M32 rejects cross-tenant and cross-document replay, even with original key",()=>{
 const e=seal();
 for(const expectedContext of [
  {...context,organizationId:B},
  {...context,evidenceId:"44444444-4444-4444-8444-444444444444"},
  {...context,checkType:"vat_identity"}
 ])assert.throws(()=>verifyFiscalKybQuarantineIntegrity({
  expectedContext,envelope:e,encryptionKey:key
 }),/VAULT_ENVELOPE_INVALID/);
});

test("M32 authenticated encryption rejects ciphertext/tag/nonce/digest/metadata tampering",()=>{
 const e=seal();
 const modified=[
  {...e,ciphertextHex:(e.ciphertextHex[0]==="a"?"b":"a")+e.ciphertextHex.slice(1)},
  {...e,tagHex:"a".repeat(32)},
  {...e,nonceHex:"a".repeat(24)},
  {...e,sha256:"b".repeat(64)},
  {...e,mimeType:"image/png"},
  {...e,byteLength:e.byteLength+1},
  {...e,scanStatus:"clean"},
  {...e,quarantineOnly:false},
  {...e,releaseAuthorized:true},
  {...e,fiscalIssuanceEnabled:true},
  {...e,extra:"unexpected"}
 ];
 for(const envelope of modified){
  assert.throws(()=>verifyFiscalKybQuarantineIntegrity({
   expectedContext:context,envelope,encryptionKey:key
  }),/VAULT_(ENVELOPE_INVALID|INTEGRITY_FAILED)/);
 }
 assert.throws(()=>verifyFiscalKybQuarantineIntegrity({
  expectedContext:context,envelope:e,encryptionKey:randomBytes(32)
 }),/VAULT_INTEGRITY_FAILED/);
});

test("M32 rejects malformed keys, mismatched length/checksum and spoofed magic bytes",()=>{
 assert.throws(()=>seal({encryptionKey:Buffer.alloc(16)}),/VAULT_KEY_INVALID/);
 assert.throws(()=>seal({plaintext:"not buffer"}),/VAULT_BYTES_INVALID/);
 assert.throws(()=>seal({metadata:{...metadata(pdf),byteLength:pdf.length+1}}),
  /VAULT_BYTES_INVALID/);
 assert.throws(()=>seal({metadata:{...metadata(pdf),sha256:"b".repeat(64)}}),
  /VAULT_CHECKSUM_MISMATCH/);
 assert.throws(()=>seal({metadata:metadata(pdf,"image/png","sample.png")}),
  /VAULT_SIGNATURE_MISMATCH/);
 assert.throws(()=>seal({context:{...context,additionalApproval:true}}),
  /VAULT_CONTEXT_INVALID/);
 assert.throws(()=>seal({metadata:{...metadata(pdf),extra:"yes"}}),
  /VAULT_METADATA_INVALID/);
 const oversized=Buffer.alloc(FISCAL_KYB_VAULT_MAX_BYTES+1,65);
 assert.throws(()=>seal({plaintext:oversized,metadata:metadata(oversized)}),
  /VAULT_METADATA_INVALID/);
});

test("M32 accepts only matching synthetic PNG/JPEG signatures",()=>{
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
   Buffer.from("synthetic-png")]);
 const jpeg=Buffer.from([255,216,255,224,1,2,3,255,217]);
 for(const [bytes,mime,name] of [
  [png,"image/png","sample.png"],[jpeg,"image/jpeg","sample.jpg"]
 ] as const){
  const e=seal({plaintext:bytes,metadata:metadata(bytes,mime,name)});
  assert.equal(e.mimeType,mime);
  assert.equal(verifyFiscalKybQuarantineIntegrity({
   expectedContext:context,envelope:e,encryptionKey:key
  }).releaseAuthorized,false);
 }
});

test("M32 lifecycle is an unexecutable plan, not document workflow",()=>{
 assert.deepEqual([...fiscalKybVaultLifecycle],[
  "quarantined","scan_rejected","clean_hold","pending_deletion","deleted"
 ]);
 for(const [a,b] of [
  ["quarantined","scan_rejected"],["quarantined","clean_hold"],
  ["quarantined","pending_deletion"],["scan_rejected","pending_deletion"],
  ["clean_hold","pending_deletion"],["pending_deletion","deleted"]
 ]){
  const r=planFiscalKybVaultTransition(a,b);
  assert.equal(r.transitionIsRecognized,true);
  assert.equal(r.mayExecute,false);
  assert.equal(r.mayRelease,false);
  assert.equal(r.mayIssue,false);
  assert.equal(r.requiresIndependentScanAttestation,b==="clean_hold");
  assert.equal(r.requiresVerifiedDeletion,b==="deleted");
  assert.ok(Object.isFrozen(r));
 }
 for(const [a,b] of [
  ["quarantined","deleted"],["scan_rejected","clean_hold"],
  ["clean_hold","quarantined"],["deleted","clean_hold"],
  ["fake","quarantined"],["quarantined","quarantined"]
 ])assert.throws(()=>planFiscalKybVaultTransition(a,b),/VAULT_STATE_TRANSITION_INVALID/);
});

test("M32 implementation remains offline with no public upload or storage adapter",()=>{
 const source=readFileSync(new URL("./fiscal-kyb-vault-core.ts",import.meta.url),"utf8");
 assert.ok(!/fetch\s*\(|axios\.|\bS3Client\b|supabase\.storage|FormData|createPresignedPost|generatePresignedUrl/.test(source));
 const page=readFileSync(new URL("../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),"utf8");
 assert.ok(!/type="file"|onSubmit|FormData|Blob\(|fetch\s*\(/.test(page));
});
