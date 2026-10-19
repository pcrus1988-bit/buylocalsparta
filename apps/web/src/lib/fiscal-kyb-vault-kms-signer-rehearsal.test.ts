import assert from "node:assert/strict";
import test from "node:test";
import {generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 mintFiscalSyntheticProbeJwtInRehearsal,
 inspectFiscalM41Readiness,
 type FiscalKmsProbeSignRequest,
 type FiscalKmsProbeSignResponse
} from "./fiscal-kyb-vault-kms-signer-rehearsal.ts";
import {verifyFiscalSyntheticProbeJwt}
 from "./fiscal-kyb-vault-signed-probe.ts";

const now=Date.parse("2026-10-19T12:30:00.000Z");
const keyArn="arn:aws:kms:eu-central-1:123456789012:key/67ee4578-bb6a-4704-8bf9-92e0f496236e";
const issuer="https://fiscal-issuer.example";
const {publicKey,privateKey}=generateKeyPairSync("rsa",{
 modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const wrong=generateKeyPairSync("rsa",{
 modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const trust={issuer,keyId:"fiscal_m41_test_kid",publicKeyPem:publicKey};
const runId="a42e102c-0c91-4571-a902-ad6b31dc71df";
const fakeKms=async(request:FiscalKmsProbeSignRequest):Promise<FiscalKmsProbeSignResponse>=>{
 assert.equal(request.KeyId,keyArn);
 assert.equal(request.SigningAlgorithm,"RSASSA_PKCS1_V1_5_SHA_256");
 assert.equal(request.MessageType,"RAW");
 const [header,claims]=Buffer.from(request.Message).toString("utf8").split(".");
 assert.equal(JSON.parse(Buffer.from(header,"base64url").toString("utf8")).alg,"RS256");
 const body=JSON.parse(Buffer.from(claims,"base64url").toString("utf8"));
 assert.equal(body.role,"fiscal_kyb_probe");
 assert.equal(body.purpose,"fiscal_kyb_synthetic_probe_v1");
 assert.equal(body.probe_run_id,runId);
 assert.equal(body.exp-body.iat,180);
 assert.ok(!("merchantId" in body)&&!("file" in body));
 return {
  KeyId:request.KeyId,
  SigningAlgorithm:request.SigningAlgorithm,
  Signature:new Uint8Array(sign("RSA-SHA256",request.Message,privateKey))
 };
};
function params(signing=fakeKms){
 return {trust,kmsKeyArn:keyArn,runId,now,sign:signing};
}

test("M41 KMS RAW/RS256 mock signs strict synthetic claims for independently pinned M40 verifier",async()=>{
 const issued=await mintFiscalSyntheticProbeJwtInRehearsal(params());
 const accepted=verifyFiscalSyntheticProbeJwt(issued.jwt,trust,now);
 assert.equal(issued.runId,runId);
 assert.equal(issued.tokenId,accepted.tokenId);
 assert.equal(issued.expiresAt,accepted.expiresAt);
 assert.equal(issued.expiresAt,Math.floor(now/1000)+180);
 assert.equal(issued.syntheticOnly,true);
 assert.ok(Object.isFrozen(issued));
 assert.equal(Object.keys(issued).includes("privateKey"),false);
 const second=await mintFiscalSyntheticProbeJwtInRehearsal(params());
 assert.notEqual(issued.jwt,second.jwt);
 assert.notEqual(issued.tokenId,second.tokenId);
});

test("M41 rejects malformed inputs before invoking even fake KMS",async()=>{
 let calls=0;
 const signer=async(_:FiscalKmsProbeSignRequest)=>{
  calls++;
  throw Error("signer should never be reached");
 };
 const invalid=[
  {kmsKeyArn:"alias/probe_key"},
  {kmsKeyArn:"arn:aws:kms:us-east-1:123456789012:key/67ee4578-bb6a-4704-8bf9-92e0f496236e"},
  {kmsKeyArn:"arn:aws:kms:eu-central-1:wrong:key/67ee4578-bb6a-4704-8bf9-92e0f496236e"},
  {runId:"other"},
  {runId:"00000000-0000-0000-0000-000000000000"},
  {trust:{...trust,issuer:"https://evil.example/path"}},
  {trust:{...trust,issuer:"http://fiscal-issuer.example"}},
  {trust:{...trust,keyId:"?"}},
  {trust:{...trust,publicKeyPem:"not-a-key"}},
  {now:-1},
  {now:NaN}
 ];
 for(const patch of invalid){
  await assert.rejects(()=>mintFiscalSyntheticProbeJwtInRehearsal(
   {...params(signer),...patch}
  ),/FISCAL_M41_KMS_REHEARSAL_DENIED/);
 }
 assert.equal(calls,0);
});

test("M41 fails closed on mismatched KMS response, failed signing and signature/key substitution",async()=>{
 const response=await fakeKms({
  KeyId:keyArn,Message:new Uint8Array(Buffer.from("test","utf8")),
  MessageType:"RAW",SigningAlgorithm:"RSASSA_PKCS1_V1_5_SHA_256"
 }).catch(()=>undefined);
 assert.equal(response,undefined,"fake sign function must only accept full probe contract");
 const incorrect=[
  async (_:FiscalKmsProbeSignRequest)=>({...await fakeKms(_),KeyId:"arn:aws:kms:eu-central-1:123456789012:key/67ee4578-bb6a-4704-8bf9-92e0f4962300"}),
  async (_:FiscalKmsProbeSignRequest)=>({...await fakeKms(_),SigningAlgorithm:"RSASSA_PSS_SHA_256"}),
  async (_:FiscalKmsProbeSignRequest)=>({...await fakeKms(_),Signature:new Uint8Array(10)}),
  async (_:FiscalKmsProbeSignRequest)=>({...await fakeKms(_),Signature:new Uint8Array(sign("RSA-SHA256",_.Message,wrong.privateKey))}),
  async (_:FiscalKmsProbeSignRequest)=>{throw Error("KMS unavailable");}
 ];
 for(const bad of incorrect){
  await assert.rejects(()=>mintFiscalSyntheticProbeJwtInRehearsal(params(bad)),
   /FISCAL_M41_KMS_REHEARSAL_DENIED/);
 }
 await assert.rejects(()=>mintFiscalSyntheticProbeJwtInRehearsal({
  ...params(),trust:{...trust,publicKeyPem:wrong.publicKey}
 }),/FISCAL_M41_KMS_REHEARSAL_DENIED/);
});

test("M41 is rehearsal-only and does not grant live Storage access",()=>{
 const r=inspectFiscalM41Readiness();
 assert.equal(r.kmsSigningContractInCi,true);
 for(const field of [
  "liveKmsKeyProvisioned","externalIssuerConfigured",
  "oidcDiscoveryPublished","supabaseIssuerTrustVerified",
  "replayPreventionVerified","storagePoliciesActivated",
  "merchantDocumentUploads","legalFiscalIssuance"
 ] as const)assert.equal(r[field],false);
 const route=readFileSync(
  new URL("../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),"utf8");
 assert.ok(!/<input[^>]+type="file"|createSignedUrl|<form\b/.test(route));
});
