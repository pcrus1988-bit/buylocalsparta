import assert from "node:assert/strict";
import test from "node:test";
import {generateKeyPairSync,createPublicKey} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 inspectFiscalM43Oidc,getFiscalM43OidcReadiness
} from "./fiscal-kyb-vault-oidc-readiness.ts";

const issuer="https://issuer.kontamou.site";
const jwksUrl=issuer+"/.well-known/jwks.json";
const kid="fiscal_m43_probe_public_01";
const pair=generateKeyPairSync("rsa",{
 modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const publicJwk=createPublicKey(pair.publicKey).export({format:"jwk"}) as {
 n:string;e:string
};
const pin={issuer,keyId:kid,publicKeyPem:pair.publicKey};
const discovery={issuer,jwks_uri:jwksUrl,
 id_token_signing_alg_values_supported:["RS256"]};
const jwtKeys={keys:[{kid,kty:"RSA",alg:"RS256",use:"sig",
 n:publicJwk.n,e:publicJwk.e}]};
type Reader=(url:string,init:RequestInit)=>Promise<Response>;
function transport(discoveryValue:unknown=discovery,jwksValue:unknown=jwtKeys){
 const calls:string[]=[];
 const request:Reader=async(url,options)=>{
  assert.equal(options.method,"GET");
  assert.equal(options.redirect,"manual");
  assert.equal(options.cache,"no-store");
  assert.ok(!new Headers(options.headers).has("authorization"));
  calls.push(url);
  if(url===issuer+"/.well-known/openid-configuration")
   return Response.json(discoveryValue);
  if(url===jwksUrl)return Response.json(jwksValue);
  throw Error("Unexpected remote URL: "+url);
 };
 return {request,calls};
}
test("M43 checks a pinned RSA 3072-bit public JWKS without secrets or grants",async()=>{
 const t=transport();
 const state=await inspectFiscalM43Oidc(pin,t.request);
 assert.deepEqual(t.calls,[issuer+"/.well-known/openid-configuration",jwksUrl]);
 assert.equal(state.status,"public_jwks_verified");
 assert.equal(state.pinnedPublicKeyMatched,true);
 assert.equal(state.oidcDiscoveryVerified,true);
 for(const key of ["externalIssuerRegisteredWithSupabase",
  "customRoleMappedToAuthenticator","downstreamReplayProtectionVerified",
  "storagePolicyActivated","merchantUploadsEnabled",
  "fiscalIssuanceEnabled"] as const)assert.equal(state[key],false);
 assert.ok(!JSON.stringify(state).includes(pair.privateKey));
 assert.ok(!JSON.stringify(state).includes(publicJwk.n));
});
test("M43 rejects unsafe issuer/key pins before any DNS/network",async()=>{
 const badPins=[
  {...pin,issuer:"https://127.0.0.1"},
  {...pin,issuer:"https://localhost"},
  {...pin,issuer:"https://issuer.kontamou.site:1234"},
  {...pin,issuer:"https://issuer.kontamou.site/abc"},
  {...pin,issuer:"http://issuer.kontamou.site"},
  {...pin,issuer:"https://evil.example"},
  {...pin,issuer:"https://kontamou.site.evil.example"},
  {...pin,issuer:"https://evil@issuer.kontamou.site"},
  {...pin,keyId:"?"},
  {...pin,publicKeyPem:pair.privateKey},
  {...pin,publicKeyPem:"not-a-public-key"}
 ];
 let calls=0;
 for(const v of badPins){
  const status=await inspectFiscalM43Oidc(v,async()=>{
   calls++;throw Error("Must never fetch");
  });
  assert.equal(status.status,"invalid_pin");
 }
 assert.equal(calls,0);
});
test("M43 blocks OIDC redirect, cross-host JWKS, wrong issuer and unsupported algorithm",async()=>{
 for(const bad of [
  {...discovery,issuer:"https://other.kontamou.site"},
  {...discovery,jwks_uri:"https://attacker.example/jwks.json"},
  {...discovery,jwks_uri:"https://127.0.0.1/jwks.json"},
  {...discovery,jwks_uri:issuer+"/../jwks.json"},
  {...discovery,jwks_uri:issuer+"/jwks.json?secret=x"},
  {...discovery,id_token_signing_alg_values_supported:["HS256"]}
 ]){
  const t=transport(bad);
  const status=await inspectFiscalM43Oidc(pin,t.request);
  assert.equal(status.status,"provider_mismatch");
  assert.equal(t.calls.length,1,"must not follow untrusted JWKS URI");
 }
 const redirect=await inspectFiscalM43Oidc(pin,
  async()=>new Response(null,{status:302,headers:{location:jwksUrl}}));
 assert.equal(redirect.status,"unavailable");
 const oversized=await inspectFiscalM43Oidc(pin,async()=>new Response(
  "x".repeat(40000),{status:200,headers:{"content-type":"application/json"}}
 ));
 assert.equal(oversized.status,"unavailable");
});
test("M43 prevents a foreign key, private JWK, duplicate kid, unsigned algorithm and missing key",async()=>{
 const wrong=generateKeyPairSync("rsa",{modulusLength:3072});
 const foreign=wrong.publicKey.export({format:"jwk"}) as {
  n:string;e:string
 };
 const candidate=jwtKeys.keys[0];
 const cases=[
  {keys:[]},
  {keys:[{...candidate,n:foreign.n}]},
  {keys:[{...candidate,alg:"HS256"}]},
  {keys:[{...candidate,kty:"oct"}]},
  {keys:[{...candidate,d:"private"}]},
  {keys:[candidate,{...candidate}]},
  {keys:[{...candidate,key_ops:["sign"]}]}
 ];
 for(const keys of cases){
  const status=await inspectFiscalM43Oidc(pin,transport(discovery,keys).request);
  assert.equal(status.status,"provider_mismatch");
 }
});
test("M43 default production state is explicit not-configured and never contacts a provider",async()=>{
 const state=await getFiscalM43OidcReadiness({});
 assert.equal(state.status,"not_configured");
 const incomplete=await getFiscalM43OidcReadiness({
  FISCAL_KYB_OIDC_ISSUER:issuer
 });
 assert.equal(incomplete.status,"invalid_pin");
 const route=readFileSync(new URL(
  "../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),
  "utf8");
 assert.ok(!/type="file"|createSignedUrl|<form\b/.test(route));
});
