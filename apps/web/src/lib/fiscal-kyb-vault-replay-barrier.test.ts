import assert from "node:assert/strict";
import test from "node:test";
import {generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 fiscalSqlReplayReservation,inspectFiscalM42Readiness,
 runFiscalReplayGuardedSyntheticStorageProbe
} from "./fiscal-kyb-vault-replay-barrier.ts";

const now=Date.parse("2026-10-20T08:00:00.000Z");
const sec=Math.floor(now/1000);
const keyId="fiscal_m42_fixture";
const issuer="https://fiscal-issuer.example";
const kp=generateKeyPairSync("rsa",{
 modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const trust={issuer,keyId,publicKeyPem:kp.publicKey};
const runId="85628c94-6bd1-4860-8a66-5b792bed20d1";
const tokenId="8f6ddc14-0124-48f7-a2a8-7ca4f5f89e51";
function jwt(patch:Record<string,unknown>={}){
 const header={typ:"JWT",alg:"RS256",kid:keyId};
 const body={iss:issuer,aud:"fiscal-kyb-synthetic-probe",
  sub:"fiscal_kyb_probe",role:"fiscal_kyb_probe",
  purpose:"fiscal_kyb_synthetic_probe_v1",probe_run_id:runId,jti:tokenId,
  iat:sec,nbf:sec,exp:sec+180,...patch};
 const input=[header,body].map(v=>Buffer.from(JSON.stringify(v))
  .toString("base64url")).join(".");
 return input+"."+sign("RSA-SHA256",Buffer.from(input),
  kp.privateKey).toString("base64url");
}
function args(scopedJwt=jwt()){
 let calls=0;
 const value={projectUrl:"https://kcpwxplxqtqdsfwlfsaa.supabase.co",
  publishableKey:"sb_publishable_synthetic_test",scopedJwt,trust,now,
  request:async (_url:string,_init:RequestInit)=>{
   calls++;
   // Simulate an unavailable Storage API. Failed dispatch is still consumed.
   return new Response(null,{status:503});
  }};
 return {value,get calls(){return calls;}};
}

test("M42 single-use gate consumes before HTTP, refuses replay after failed API",async()=>{
 const saved=new Set<string>();
 let reservations=0;
 const reserveOnce=async ({runId,tokenId}: {runId:string;tokenId:string})=>{
  reservations++;
  const key=runId+"|"+tokenId;
  if(saved.has(key))return false;
  saved.add(key);
  return true;
 };
 const t=args();
 const first=await runFiscalReplayGuardedSyntheticStorageProbe({
  ...t.value,reserveOnce
 });
 assert.equal(first.status,"failed");
 assert.ok(t.calls>0);
 const calls=t.calls;
 await assert.rejects(()=>runFiscalReplayGuardedSyntheticStorageProbe({
  ...t.value,reserveOnce
 }),/FISCAL_M42_REPLAY_OR_UNAVAILABLE/);
 assert.equal(t.calls,calls);
 assert.equal(reservations,2);
});

test("M42 checks pinned signature/scope before touching lease DB or HTTP",async()=>{
 let reservations=0;
 const reserveOnce=async ()=>{reservations++;return true;};
 for(const candidate of [
  jwt({role:"service_role"}),
  jwt({purpose:"merchant_upload"}),
  jwt({exp:sec-1}),
  jwt({jti:"000"}),
  jwt({iss:"https://spoofed.example"}),
  jwt().slice(0,-3)+"abc"
 ]){
  const t=args(candidate);
  await assert.rejects(()=>runFiscalReplayGuardedSyntheticStorageProbe({
   ...t.value,reserveOnce
  }),/FISCAL_M40_TOKEN_NOT_VERIFIED/);
  assert.equal(t.calls,0);
 }
 assert.equal(reservations,0);
});

test("M42 SQL reservation binds claims and refuses DB failure, duplicates or malformed state",async()=>{
 let captured:{sql:string;params:readonly (string|number)[]}|undefined;
 const good={runId,tokenId,expiresAt:sec+180,
  signatureVerified:true as const,syntheticOnly:true as const};
 const reserve=fiscalSqlReplayReservation({
  query:async(sql,params)=>{
   captured={sql,params};
   return {rowCount:1};
  }
 });
 assert.equal(await reserve(good),true);
 assert.ok(captured?.sql.includes("ON CONFLICT DO NOTHING"));
 assert.deepEqual(captured?.params,[tokenId,runId,sec+180]);
 assert.equal(await fiscalSqlReplayReservation({
  query:async()=>({rowCount:0})
 })(good),false);
 await assert.rejects(()=>fiscalSqlReplayReservation({
  query:async()=>{throw Error("sensitive DB error");}
 })(good),/FISCAL_M42_REPLAY_OR_UNAVAILABLE/);
 await assert.rejects(()=>reserve({...good,tokenId:"INVALID"}),
  /FISCAL_M42_REPLAY_OR_UNAVAILABLE/);
 await assert.rejects(()=>fiscalSqlReplayReservation({
  query:async()=>({rowCount:2})
 })(good),/FISCAL_M42_REPLAY_OR_UNAVAILABLE/);
});

test("M42 remains disconnected: no merchant uploads, issuer trust or production claims",()=>{
 const r=inspectFiscalM42Readiness();
 assert.equal(r.atomicReplayDispatchContractInCi,true);
 assert.equal(r.sqlReviewOnly,true);
 for(const k of ["liveReplayLedgerDeployed",
  "providerLevelReplayPreventionVerified","independentIssuerTrusted",
  "supabaseStoragePoliciesActivated","liveKybDocumentIntake",
  "legalFiscalIssuance"] as const)assert.equal(r[k],false);
 const route=readFileSync(new URL(
  "../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),"utf8");
 assert.ok(!/type="file"|createSignedUrl|<form\b/.test(route));
});
