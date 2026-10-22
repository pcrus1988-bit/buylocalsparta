import test from "node:test";
import assert from "node:assert/strict";
import {
 FISCAL_PROJECT_REF,FISCAL_BACKUP_LIST_URL,
 classifyFiscalBackups,validateFiscalBackupInventoryContext,fetchFiscalBackups
} from "./fiscal-backup-inventory.mjs";

const NOW=new Date("2026-10-22T09:00:00.000Z");
const row=(x={})=>({
 id:123,status:"COMPLETED",inserted_at:"2026-10-22T04:00:00.000Z",
 is_physical_backup:true,...x
});
const payload=(b=[row()])=>({
 region:"eu-central-1",walg_enabled:true,pitr_enabled:false,
 backups:b,physical_backup_data:{earliest_physical_backup_date_unix:1,latest_physical_backup_date_unix:2}
});

test("reads exact Pro daily backup inventory but never claims restored recovery",()=>{
 const v=classifyFiscalBackups(payload(),NOW);
 assert.equal(v.projectRef,FISCAL_PROJECT_REF);
 assert.equal(v.inventoryEndpointVerified,true);
 assert.equal(v.recentCompletedBackupPresent,true);
 assert.equal(v.latestCompletedBackupAgeHours,5);
 assert.equal(v.latestCompletedBackupType,"physical");
 assert.equal(v.backedUpDataRestoreVerified,false);
 assert.equal(v.restoredProductionBackupId,null);
 assert.equal(v.productionMigrationWritesAuthorized,false);
 assert.equal(v.statutoryIssuanceAuthorized,false);
 assert.equal(Object.isFrozen(v),true);
});
test("recent pending, failed or stale backups never count as completed recent",()=>{
 for(const rows of [[],[row({status:"IN_PROGRESS"})],[row({status:"FAILED"})],
  [row({inserted_at:"2026-10-19T00:00:00.000Z"})]]){
  const v=classifyFiscalBackups(payload(rows),NOW);
  assert.equal(v.recentCompletedBackupPresent,false);
  assert.equal(v.backedUpDataRestoreVerified,false);
 }
});
test("sorts completed backups, never picks a newer pending one",()=>{
 const v=classifyFiscalBackups(payload([
  row({id:200,inserted_at:"2026-10-21T10:00:00.000Z"}),
  row({id:202,status:"IN_PROGRESS",inserted_at:"2026-10-22T08:00:00.000Z"}),
  row({id:201,inserted_at:"2026-10-22T03:00:00.000Z"})
 ]),NOW);
 assert.equal(v.latestCompletedBackupId,"201");
 assert.equal(v.completedBackupCount,2);
});
test("PITR enabled without completed backup inventory never proves restored recovery",()=>{
 const v=classifyFiscalBackups({...payload([]),pitr_enabled:true},NOW);
 assert.equal(v.pitrEnabled,true);
 assert.equal(v.recentCompletedBackupPresent,false);
 assert.equal(v.backedUpDataRestoreVerified,false);
});
test("rejects malformed records, future timestamps and duplicate backup IDs",()=>{
 for(const bad of [
  null,{},[],{...payload(),pitr_enabled:"yes"},payload([row(),row()]),
  payload([row({id:"a/b"})]),payload([row({id:Infinity})]),
  payload([row({inserted_at:"2026-10-22T11:00:00.000Z"})]),
  payload([row({inserted_at:"not-a-timestamp"})]),
  payload([row({is_physical_backup:null})]),
  payload([row({status:32})])
 ]){
  assert.throws(()=>classifyFiscalBackups(bad,NOW),/FISCAL_M50_/);
 }
});
test("no token, arbitrary project or action flags are ever accepted",()=>{
 const token="test-only-mock-token-value";
 assert.deepEqual(validateFiscalBackupInventoryContext({token,args:["--require-recent"]}),
  {token,strict:true});
 for(const c of [
  {token:undefined},{token:"short"},{token:"token-with-\n-newline"},
  {token,projectRef:"eemihhfreggbigxejjhj"},
  {token,args:["--restore"]},{token,args:["--require-recent","--require-recent"]}
 ]) assert.throws(()=>validateFiscalBackupInventoryContext(c),/FISCAL_M50_/);
});
const mockFetch=(p,status=200,headers={"content-type":"application/json"})=>
 async (url,options)=>{
  assert.equal(url,FISCAL_BACKUP_LIST_URL);
  assert.equal(options.method,"GET");
  assert.equal(options.redirect,"error");
  assert.equal(options.cache,"no-store");
  assert.equal(options.headers.Authorization,"Bearer mock-private-token");
  return new Response(typeof p==="string"?p:JSON.stringify(p),{status,headers});
 };
test("real HTTP fetch contract accepts only fixed GET endpoint and valid JSON",async()=>{
 const p=await fetchFiscalBackups({token:"mock-private-token",fetchImpl:mockFetch(payload())});
 assert.equal(p.backups[0].status,"COMPLETED");
});
test("API failures and invalid JSON never reveal response, host or bearer",async()=>{
 const evil="very-secret-sensitive-key";
 for(const fetchImpl of [
  mockFetch({key:evil},401),
  mockFetch("<html>"+evil+"</html>",200,{"content-type":"text/html"}),
  mockFetch("{"+evil,200),
  async()=>{throw Error(evil);}
 ]){
  await assert.rejects(
   ()=>fetchFiscalBackups({token:"mock-private-token",fetchImpl}),
   error=>error.message.startsWith("FISCAL_M50_")&&!error.message.includes(evil));
 }
});
test("bounded response rejects oversized provider payload without exposing it",async()=>{
 await assert.rejects(()=>fetchFiscalBackups({
  token:"mock-private-token",
  fetchImpl:mockFetch("x".repeat(70_000))
 }),/FISCAL_M50_BACKUP_API_TOO_LARGE/);
});
