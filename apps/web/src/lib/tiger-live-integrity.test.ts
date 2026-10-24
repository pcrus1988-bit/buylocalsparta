import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {verifyTigerLiveLedger} from "./tiger-live-integrity.ts";
const hash=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const id="AUTO-E07-01",owner="A02:chatgpt-interactive-tiger-e07",at="2026-10-24T09:49:42.925Z";
const baseline=()=>({schema_version:1,revision:0,last_hash:"genesis",last_event:null,tasks:{
  [id]:{engine:"E07",status:"ready",attempts:0,lease:null,updated_at:null}
}});
function real(){
 const s=baseline();
 const first:any={seq:1,at,kind:"claimed",task_id:id,owner,previous_hash:"genesis"};
 first.hash=hash(first);
 const second:any={seq:2,at,kind:"phase:running",task_id:id,owner,previous_hash:first.hash};
 second.hash=hash(second);
 s.revision=2;s.last_hash=second.hash;s.last_event=second as never;
 s.tasks[id]={engine:"E07",status:"running",attempts:1,updated_at:at,lease:{
  owner,last_heartbeat_at:Date.parse(at),expires_at:Date.parse(at)+1200000
 }} as never;
 return {s,events:[first,second]};
}
test("uninitialized branch is verifiably empty",()=>{
 assert.equal(verifyTigerLiveLedger(baseline(),[]),true);
});
test("real A02 claim and running transition maintain full hash integrity",()=>{
 const {s,events}=real();assert.equal(verifyTigerLiveLedger(s,events),true);
});
test("event truncation, digest corruption, unsupported task states and spoofed lease fail closed",()=>{
 const {s,events}=real();
 assert.throws(()=>verifyTigerLiveLedger(s,events.slice(1)));
 const changed=structuredClone(events);changed[0].owner="A08:imposter";
 assert.throws(()=>verifyTigerLiveLedger(s,changed));
 for(const mutate of [
  (x:any)=>x.tasks[id].status="accepted",
  (x:any)=>x.tasks[id].attempts=4,
  (x:any)=>x.tasks[id].lease.owner="A02:other",
  (x:any)=>x.tasks[id].lease.last_heartbeat_at=Date.parse(at)+1000,
  (x:any)=>x.tasks[id].lease.expires_at=Date.parse(at)+7200000,
  (x:any)=>x.last_hash="fake"
 ]){
  const state=structuredClone(s);mutate(state);
  assert.throws(()=>verifyTigerLiveLedger(state,events));
 }
});
test("refuses claimed worker without any recorded event",()=>{
 const s=baseline();(s.tasks[id] as any).status="running";
 assert.throws(()=>verifyTigerLiveLedger(s,[]));
});
