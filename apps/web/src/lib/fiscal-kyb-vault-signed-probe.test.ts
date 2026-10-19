import assert from "node:assert/strict";
import test from "node:test";
import {
 generateKeyPairSync,sign
} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 inspectFiscalM40Readiness,runFiscalVerifiedSyntheticStorageProbe,
 verifyFiscalSyntheticProbeJwt
} from "./fiscal-kyb-vault-signed-probe.ts";

const now=Date.parse("2026-10-19T12:00:00.000Z");
const sec=Math.floor(now/1000);
const keyId="m40_test_key_01";
const issuer="https://fiscal-issuer.example";
const {publicKey,privateKey}=generateKeyPairSync("rsa",{
 modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const other=generateKeyPairSync("rsa",{
 modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const trust={issuer,keyId,publicKeyPem:publicKey};
const claims={
 iss:issuer,aud:"fiscal-kyb-synthetic-probe",sub:"fiscal_kyb_probe",
 role:"fiscal_kyb_probe",purpose:"fiscal_kyb_synthetic_probe_v1",
 probe_run_id:"123e4567-e89b-42d3-a456-426614174000",
 jti:"72d1ab0a-29df-49da-b00a-3d63c0d619f6",
 iat:sec-5,nbf:sec-5,exp:sec+180
};
function signed(payload:Record<string,unknown>=claims,
 header:Record<string,unknown>={alg:"RS256",typ:"JWT",kid:keyId},
 key=privateKey){
 const input=[header,payload].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
 return input+"."+sign("RSA-SHA256",Buffer.from(input),key).toString("base64url");
}
function transport(){
 const objects=new Map<string,Uint8Array>();
 let calls=0;
 const request=async(url:string,init:RequestInit)=>{
  calls++;
  assert.equal(new URL(url).origin,"https://kcpwxplxqtqdsfwlfsaa.supabase.co");
  assert.equal(new Headers(init.headers).get("authorization"),"Bearer "+signed());
  const path="/storage/v1/object/fiscal-kyb-quarantine/";
  const read="/storage/v1/object/authenticated/fiscal-kyb-quarantine/";
  if(init.method==="POST"){
   assert.ok(new URL(url).pathname.startsWith(path+"__synthetic_m37__/"));
   const key=new URL(url).pathname.slice(path.length);
   objects.set(key,new Uint8Array(init.body as Uint8Array));
   return new Response(null,{status:201});
  }
  if(init.method==="GET"){
   const key=new URL(url).pathname.slice(read.length);
   const bytes=objects.get(key);
   return bytes?new Response(new Uint8Array(bytes),{status:200}):
    new Response(null,{status:404});
  }
  if(init.method==="DELETE"){
   const {prefixes}=JSON.parse(String(init.body));
   for(const key of prefixes)objects.delete(key);
   return new Response(null,{status:200});
  }
  throw Error("Unexpected method");
 };
 return {request,objects,get calls(){return calls;}};
}
test("M40 pinned 3072-bit RSA signature verifies and preserves run binding",()=>{
 const token=signed();
 const verified=verifyFiscalSyntheticProbeJwt(token,trust,now);
 assert.equal(verified.runId,claims.probe_run_id);
 assert.equal(verified.tokenId,claims.jti);
 assert.equal(verified.expiresAt,claims.exp);
 assert.equal(verified.signatureVerified,true);
 assert.equal(verified.syntheticOnly,true);
 assert.ok(Object.isFrozen(verified));
 assert.ok(!("jwt" in verified)&&!("privateKey" in verified));
});

test("M40 allows verified token into synthetic-only M37 HTTP lifecycle",async()=>{
 const t=transport();
 const result=await runFiscalVerifiedSyntheticStorageProbe({
  projectUrl:"https://kcpwxplxqtqdsfwlfsaa.supabase.co",
  publishableKey:"sb_publishable_test_only",
  scopedJwt:signed(),now,trust,request:t.request
 });
 assert.equal(result.status,"passed");
 assert.equal(result.notFoundAfterDeletion,true);
 assert.equal(t.calls,4);
 assert.equal(t.objects.size,0);
 assert.equal(result.merchantUploadsEnabled,false);
});

test("M40 rejects tampering, alg confusion, fake issuers, scope and time before any HTTP",async()=>{
 const bad=[
  signed({...claims,role:"authenticated"}),
  signed({...claims,purpose:"real_customer_document"}),
  signed({...claims,probe_run_id:"another-run"}),
  signed({...claims,probe_run_id:"00000000-0000-0000-0000-000000000000"}),
  signed({...claims,jti:"not-uuid"}),
  signed({...claims,iss:"https://attacker.example"}),
  signed({...claims,aud:"different"}),
  signed({...claims,sub:"user"}),
  signed({...claims,iat:sec-500}),
  signed({...claims,nbf:sec+1}),
  signed({...claims,exp:sec-1}),
  signed({...claims,exp:sec+400}),
  signed({...claims,iat:sec-5,exp:sec+301}),
  signed(claims,{alg:"none",typ:"JWT",kid:keyId}),
  signed(claims,{alg:"HS256",typ:"JWT",kid:keyId}),
  signed(claims,{alg:"RS256",typ:"JWT",kid:"unknown_key_01"}),
  signed(claims,{alg:"RS256",typ:"JWT",kid:keyId,jku:"https://attacker.example"}),
  signed(claims,undefined,other.privateKey),
  signed().slice(0,-1)+"A",
  "not-a-token"
 ];
 const wrongTrust=[
  {...trust,publicKeyPem:other.publicKey},
  {...trust,issuer:"http://fiscal-issuer.example"},
  {...trust,keyId:"x"},
  {...trust,publicKeyPem:"not a key"},
  {...trust,publicKeyPem:privateKey}
 ];
 for(const token of bad){
  const t=transport();
  await assert.rejects(()=>runFiscalVerifiedSyntheticStorageProbe({
   projectUrl:"https://kcpwxplxqtqdsfwlfsaa.supabase.co",
   publishableKey:"sb_publishable_test_only",
   scopedJwt:token,now,trust,request:t.request
  }),/FISCAL_M40_TOKEN_NOT_VERIFIED/);
  assert.equal(t.calls,0);
 }
 for(const changed of wrongTrust){
  assert.throws(()=>verifyFiscalSyntheticProbeJwt(signed(),changed,now),
   /FISCAL_M40_TOKEN_NOT_VERIFIED/);
 }
});

test("M40 never presents token-verification rehearsal as production readiness",()=>{
 const readiness=inspectFiscalM40Readiness();
 assert.equal(readiness.offlineSignatureVerifierTested,true);
 for(const name of [
  "externallyProvisionedIssuer","supabaseKeyTrustVerified",
  "liveProbeAuthorized","policyActivated","merchantDocumentUploads",
  "aadeIssuanceEnabled"
 ] as const)assert.equal(readiness[name],false);
 const route=readFileSync(
  new URL("../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),
  "utf8");
 assert.ok(!/type="file"|createSignedUrl|<form\b/.test(route));
});
