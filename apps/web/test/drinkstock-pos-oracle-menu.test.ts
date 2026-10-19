import assert from "node:assert/strict";
import test from "node:test";
import {oracleReadMenuSummary,OraclePosAdapterError} from "../src/lib/drinkstock-pos-oracle-menu.ts";
const config={
 baseUrl:"https://simphony.example.com/",
 orgShortName:"test-org",locationRef:"venue-a",
 revenueCenterRef:3,idToken:"server-issued-id-token"
};
test("Oracle Simphony menu summary uses documented STS Gen2 endpoint with venue context",async()=>{
 let calls=0;
 const fake=async (input:RequestInfo|URL,init?:RequestInit)=>{
  calls++;
  assert.equal(String(input),"https://simphony.example.com/api/v1/menus/summary");
  assert.equal(init?.method,"GET");
  assert.equal(init?.redirect,"error");
  const headers=new Headers(init?.headers);
  assert.equal(headers.get("authorization"),"Bearer server-issued-id-token");
  assert.equal(headers.get("Simphony-OrgShortName"),"test-org");
  assert.equal(headers.get("Simphony-LocRef"),"venue-a");
  assert.equal(headers.get("Simphony-RvcRef"),"3");
  return Response.json({menus:[]});
 };
 assert.deepEqual(await oracleReadMenuSummary(config,fake as typeof fetch),{menus:[]});
 assert.equal(calls,1);
});
test("Oracle adapter rejects any non HTTPS or unsafe endpoint before network",async()=>{
 const fake=(async()=>{assert.fail("No network for invalid config");}) as typeof fetch;
 for(const baseUrl of [
  "http://simphony.example.com/","https://user:pass@simphony.example.com/",
  "https://simphony.example.com/wrong","https://127.0.0.1/",
  "https://localhost/","https://simphony.example.com/?q=1"
 ]){
  await assert.rejects(()=>oracleReadMenuSummary({...config,baseUrl},fake),OraclePosAdapterError);
 }
});
test("Oracle adapter checks required location, authorization and numeric revenue center",async()=>{
 const fake=(async()=>{assert.fail("Invalid config reached fetch");}) as typeof fetch;
 await assert.rejects(()=>oracleReadMenuSummary({...config,orgShortName:"invalid\nheader"},fake),OraclePosAdapterError);
 await assert.rejects(()=>oracleReadMenuSummary({...config,revenueCenterRef:0},fake),OraclePosAdapterError);
 await assert.rejects(()=>oracleReadMenuSummary({...config,idToken:"token\nInjection"},fake),OraclePosAdapterError);
});
test("Oracle adapter never treats unauthorized/HTML/outage as a successful menu",async()=>{
 const denied=(async()=>new Response("",{status:403})) as typeof fetch;
 const html=(async()=>new Response("<html/>",{headers:{"content-type":"text/html"}})) as typeof fetch;
 const outage=(async()=>{throw new Error("socket error");}) as typeof fetch;
 await assert.rejects(()=>oracleReadMenuSummary(config,denied),(e:unknown)=>e instanceof OraclePosAdapterError&&e.code==="ORACLE_NOT_AUTHORIZED");
 await assert.rejects(()=>oracleReadMenuSummary(config,html),(e:unknown)=>e instanceof OraclePosAdapterError&&e.code==="ORACLE_NON_JSON_RESPONSE");
 await assert.rejects(()=>oracleReadMenuSummary(config,outage),(e:unknown)=>e instanceof OraclePosAdapterError&&e.code==="ORACLE_UNAVAILABLE");
});
