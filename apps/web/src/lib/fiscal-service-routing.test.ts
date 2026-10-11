import test from "node:test";
import assert from "node:assert/strict";
import {fiscalMarketplaceRoute} from "./fiscal-service-routing.ts";

const base={fiscalBaseUrl:"https://konta-moy-fiscal.vercel.app",
 marketplaceOrigin:"https://kontamou.site",search:"",method:"GET"} as const;
const route=(pathname:string,other:Record<string,string>={})=>
 fiscalMarketplaceRoute({...base,pathname,...other});

test("merchant FISCAL pages redirect to independent service, preserving search",()=>{
 for(const path of ["/timologio","/timologio/login","/timologio/register",
   "/timologio/drafts","/timologio/drafts/test-id","/timologio/journal"]){
  assert.deepEqual(route(path),{kind:"redirect",url:base.fiscalBaseUrl+path});
 }
 assert.deepEqual(route("/timologio/drafts",{search:"?organizationId=123&lane=b2g"}),
  {kind:"redirect",url:base.fiscalBaseUrl+"/timologio/drafts?organizationId=123&lane=b2g"});
});
test("standalone navigation never redirects the active marketplace's unrelated routes",()=>{
 for(const path of ["/","/shop","/admin/fiscal-access","/vendor/claim",
  "/timologio-extra","/timologio-admin-extra"]){
  assert.equal(route(path).kind,"marketplace");
 }
});
test("marketplace vendor consent stays on marketplace, including signed POST endpoint",()=>{
 assert.deepEqual(route("/timologio/marketplace-link"),{kind:"marketplace"});
 assert.deepEqual(route("/timologio/api/marketplace-link/confirm",{method:"POST"}),{kind:"marketplace"});
 assert.equal(route("/timologio/marketplace-link",{method:"POST"}).kind,"deny");
});
test("marketplace super-admin screens always go to local signed SSO handoff",()=>{
 for(const path of ["/timologio-admin","/timologio-admin/login",
  "/timologio-admin/compliance"]){
  assert.deepEqual(route(path),{kind:"local_admin_sso",path:"/admin/fiscal-access"});
 }
});
test("never redirect state-changing methods, callbacks or API requests",()=>{
 for(const path of ["/timologio/api/auth","/timologio/api/v1/drafts",
  "/timologio/api/internal/marketplace-links/status",
  "/timologio-admin/api/login","/timologio-admin/sso/callback"]){
  assert.equal(route(path,{method:"POST"}).kind,"deny",path);
  assert.equal(route(path).kind,"deny",path);
 }
 assert.equal(route("/timologio/login",{method:"POST"}).kind,"deny");
});
test("fail closed when service is missing, insecure, malformed or loops to marketplace",()=>{
 for(const url of ["","http://konta-moy-fiscal.vercel.app",
  "https://kontamou.site","https://bad.example/path","https://user:pass@host.example",
  "https://good.example/?secret=1","https://good.example/#section","%"]){
  assert.equal(route("/timologio",{fiscalBaseUrl:url}).kind,"unavailable",url);
 }
 assert.equal(route("/timologio",{search:"//evil"}).kind,"deny");
});
test("HEAD navigations may redirect but never mutate non-fiscal endpoints",()=>{
 assert.equal(route("/timologio/login",{method:"HEAD"}).kind,"redirect");
 assert.equal(route("/timologio/api/auth",{method:"HEAD"}).kind,"deny");
});
