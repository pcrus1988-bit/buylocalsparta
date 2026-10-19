import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 inspectFiscalM37IntegrationReadiness,runFiscalSyntheticStorageApiProbe
} from "./fiscal-kyb-vault-storage-api-probe.ts";

const projectUrl="https://kcpwxplxqtqdsfwlfsaa.supabase.co";
const now=Date.parse("2026-10-19T11:00:00.000Z");
function token(role:string,extras:Record<string,unknown>={}){
 const header=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
 const claim=Buffer.from(JSON.stringify({
  role,purpose:"fiscal_kyb_synthetic_probe_v1",
  iat:Math.floor(now/1000)-5,exp:Math.floor(now/1000)+300,...extras
 })).toString("base64url");
 return header+"."+claim+"."+Buffer.from("test-only-not-a-real-signature").toString("base64url");
}

function fakeStorage(options:{error?:string,corrupt?:boolean,deleteError?:boolean,redirect?:boolean}={}){
 const objects=new Map<string,Uint8Array>();
 const history:{method:string,url:string,headers:Headers}[]=[];
 const fn=async(url:string,init:RequestInit)=>{
  const method=init.method??"GET";
  const headers=new Headers(init.headers);
  history.push({method,url,headers});
  assert.equal(init.redirect,"manual");
  assert.equal(init.cache,"no-store");
  assert.equal(headers.get("authorization"),"Bearer "+token("fiscal_kyb_probe"));
  assert.equal(headers.get("apikey"),"sb_publishable_test_only");
  const parsed=new URL(url);
  assert.equal(parsed.origin,projectUrl);
  const base="/storage/v1/object/fiscal-kyb-quarantine/";
  const read="/storage/v1/object/authenticated/fiscal-kyb-quarantine/";
  if(method==="POST"){
   assert.ok(parsed.pathname.startsWith(base+"__synthetic_m37__/"));
   assert.equal(headers.get("content-type"),"application/octet-stream");
   assert.equal(headers.get("x-upsert"),"false");
   if(options.redirect)return new Response(null,{status:307,headers:{location:"https://example.com/unsafe"}});
   if(options.error==="upload")return new Response(null,{status:403});
   const body=Buffer.from(init.body as Uint8Array);
   assert.ok(body.length<=512);
   assert.ok(body.subarray(0,7).equals(Buffer.from("KMFS37\0","ascii")));
   assert.ok(!body.toString("utf8").includes("merchant"));
   objects.set(parsed.pathname.slice(base.length),new Uint8Array(body));
   return new Response(null,{status:201});
  }
  if(method==="GET"){
   assert.ok(parsed.pathname.startsWith(read+"__synthetic_m37__/"));
   const key=parsed.pathname.slice(read.length);
   const bytes=objects.get(key);
   if(!bytes)return new Response(null,{status:404});
   const result=new Uint8Array(bytes);
   if(options.corrupt)result[result.length-1]^=255;
   return new Response(result,{status:200,headers:{"content-type":"application/octet-stream"}});
  }
  if(method==="DELETE"){
   assert.equal(parsed.pathname,"/storage/v1/object/fiscal-kyb-quarantine");
   const {prefixes}=JSON.parse(String(init.body));
   assert.equal(prefixes.length,1);
   if(options.deleteError)return new Response(null,{status:500});
   objects.delete(prefixes[0]);
   return new Response(null,{status:200});
  }
  throw Error("Unexpected request");
 };
 return {request:fn,history,objects};
}
const args=(request:(url:string,init:RequestInit)=>Promise<Response>)=>({
 projectUrl,publishableKey:"sb_publishable_test_only",
 scopedJwt:token("fiscal_kyb_probe"),now,request
});

test("M37 encrypted synthetic write/read/delete and final 404 over Storage API contract",async()=>{
 const storage=fakeStorage();
 const result=await runFiscalSyntheticStorageApiProbe(args(storage.request));
 assert.equal(result.status,"passed");
 assert.equal(result.uploadAccepted,true);
 assert.equal(result.ciphertextRoundTripVerified,true);
 assert.equal(result.deletionRequestAccepted,true);
 assert.equal(result.notFoundAfterDeletion,true);
 assert.equal(result.cleanupUncertain,false);
 assert.equal(storage.objects.size,0);
 assert.deepEqual(storage.history.map(x=>x.method),["POST","GET","DELETE","GET"]);
 assert.ok(Object.isFrozen(result));
 for(const k of [
  "externallyVerifiedKms","liveKybEvidenceAccepted","merchantUploadsEnabled",
  "documentReadAuthorized","fiscalIssuanceEnabled"
 ] as const)assert.equal(result[k],false,k);
});

test("M37 rejects service_role, anon user tokens, external hosts, stale scopes and unsafe apikey",async()=>{
 const s=fakeStorage();
 for(const patch of [
  {projectUrl:"http://kcpwxplxqtqdsfwlfsaa.supabase.co"},
  {projectUrl:"https://evil.example.com"},
  {projectUrl:"https://kcpwxplxqtqdsfwlfsaa.supabase.co.evil.test"},
  {projectUrl:projectUrl+"/"},
  {publishableKey:"sb_secret_admin"},
  {publishableKey:token("service_role")},
  {scopedJwt:token("service_role")},
  {scopedJwt:token("anon")},
  {scopedJwt:token("authenticated")},
  {scopedJwt:token("fiscal_kyb_probe",{purpose:"real_documents"})},
  {scopedJwt:token("fiscal_kyb_probe",{exp:Math.floor(now/1000)-1})},
  {scopedJwt:token("fiscal_kyb_probe",{exp:Math.floor(now/1000)+3600})},
  {scopedJwt:token("fiscal_kyb_probe",{iat:Math.floor(now/1000)-1800})},
  {scopedJwt:"not-a-jwt"}
 ]){
  await assert.rejects(()=>runFiscalSyntheticStorageApiProbe({...args(s.request),...patch}));
 }
 assert.equal(s.history.length,0,"invalid authorization must never issue network requests");
});

test("M37 corrupted ciphertext is never treated as passing, cleanup is still attempted",async()=>{
 const s=fakeStorage({corrupt:true});
 const result=await runFiscalSyntheticStorageApiProbe(args(s.request));
 assert.equal(result.status,"failed");
 assert.equal(result.uploadAccepted,true);
 assert.equal(result.ciphertextRoundTripVerified,false);
 assert.equal(result.deletionRequestAccepted,true);
 assert.equal(result.notFoundAfterDeletion,true);
 assert.equal(result.cleanupUncertain,false);
 assert.equal(s.objects.size,0);
 assert.deepEqual(s.history.map(x=>x.method),["POST","GET","DELETE","GET"]);
});

test("M37 failed upload and redirect never cause an apparent successful probe",async()=>{
 for(const opt of [{error:"upload"},{redirect:true}]){
  const s=fakeStorage(opt);
  const result=await runFiscalSyntheticStorageApiProbe(args(s.request));
  assert.equal(result.status,"failed");
  assert.equal(result.uploadAccepted,false);
  assert.equal(result.ciphertextRoundTripVerified,false);
  assert.equal(result.cleanupUncertain,false);
  assert.equal(s.objects.size,0);
 }
});

test("M37 deletion failure is reported as uncertain and must never be silently accepted",async()=>{
 const s=fakeStorage({deleteError:true});
 const result=await runFiscalSyntheticStorageApiProbe(args(s.request));
 assert.equal(result.status,"failed");
 assert.equal(result.uploadAccepted,true);
 assert.equal(result.ciphertextRoundTripVerified,true);
 assert.equal(result.cleanupUncertain,true);
 assert.equal(result.notFoundAfterDeletion,false);
 assert.equal(s.objects.size,1,"synthetic fake demonstrates cleanup failure");
 assert.deepEqual(s.history.map(x=>x.method),["POST","GET","DELETE","DELETE"]);
});

test("M37 server readiness remains OFF even with supposedly present credentials",()=>{
 for(const env of [
  {},
  {FISCAL_VAULT_SCOPED_STORAGE_JWT:"fake",
   FISCAL_VAULT_PUBLIC_STORAGE_KEY:"fake"}
 ]){
  const r=inspectFiscalM37IntegrationReadiness(env);
  assert.equal(r.actualScopedCredentialVerified,false);
  assert.equal(r.independentKmsIntegrationVerified,false);
  assert.equal(r.productionProbeExecuted,false);
  assert.equal(r.manualDeploymentApprovalObtained,false);
  assert.equal(r.productionIntegrationEnabled,false);
  assert.equal(r.realDocumentsAccepted,false);
  assert.ok(Object.isFrozen(r));
 }
 const route=readFileSync(new URL(
  "../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),"utf8");
 assert.ok(!/onSubmit|type="file"|createSignedUrl|storage\.from/.test(route));
 const source=readFileSync(
  new URL("./fiscal-kyb-vault-storage-api-probe.ts",import.meta.url),"utf8");
 assert.ok(!/service_role.*Bearer|storage\.objects\s+DELETE|NEXT_PUBLIC_FISCAL|createSignedUrl/.test(source));
});
