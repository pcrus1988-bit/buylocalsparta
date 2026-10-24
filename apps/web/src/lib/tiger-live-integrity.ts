/**
 * Pure server-side verifier for the private AUTOPILOT Git event ledger.
 * Read-only: never commits, rewrites events or invents role activity.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
type Task={engine?:string;status?:string;attempts?:number;
  lease?:{owner?:string;expires_at?:number;last_heartbeat_at?:number}|null;
  updated_at?:string|null};
export type LedgerSnapshot={schema_version?:number;revision?:number;last_hash?:string;
  last_event?:unknown;tasks?:Record<string,Task>};
export type LedgerRecord={seq?:number;at?:string;kind?:string;task_id?:string;
  owner?:string;previous_hash?:string;hash?:string};
const ID=/^AUTO-E(?:0[1-9]|1[0-9]|20)-[0-9]{2}$/;
const OWNER=/^A(?:0[0-9]|10)(?::[A-Za-z0-9_.-]{1,100})?$/;
const active=new Set(["claimed","running","tested","reviewed"]);
const phases:Record<string,[string,string]>={
  "phase:running":["claimed","running"],"phase:tested":["running","tested"],
  "phase:reviewed":["tested","reviewed"],"phase:submitted":["reviewed","submitted"]
};
const digest=(obj:unknown)=>createHash("sha256").update(JSON.stringify(obj)).digest("hex");
export function verifyTigerLiveLedger(state:LedgerSnapshot,events:LedgerRecord[]):true{
  assert.equal(state?.schema_version,1,"State schema");
  assert.ok(state.tasks&&typeof state.tasks==="object","Tasks missing");
  assert.ok(typeof state.revision==="number"&&Number.isSafeInteger(state.revision)&&state.revision>=0,"State revision");
  assert.ok(Array.isArray(events)&&events.length<=10000,"Event history bound");
  assert.equal(state.revision,events.length,"Truncated or divergent event history");
  const history=new Map<string,{status:string;attempts:number;owner?:string;beat?:number;at?:string}>();
  let previous="genesis";
  for(let i=0;i<events.length;i++){
    const ev=events[i];
    assert.equal(ev.seq,i+1,"Event sequence");
    assert.equal(ev.previous_hash,previous,"Hash chain link");
    const {hash,...unsigned}=ev;
    assert.equal(hash,digest(unsigned),"Event content hash");
    previous=hash!;
    assert.ok(typeof ev.task_id==="string"&&ID.test(ev.task_id),"Unknown task id");
    assert.ok(typeof ev.at==="string"&&Number.isFinite(Date.parse(ev.at)),"Timestamp invalid");
    assert.ok(state.tasks[ev.task_id],"Event task not in state");
    const h:{status:string;attempts:number;owner?:string;beat?:number;at?:string}=history.get(ev.task_id)||{status:"initial",attempts:0};
    if(ev.kind==="claimed"){
      assert.ok(h.status==="initial"||h.status==="ready","Claim out of order");
      assert.ok(typeof ev.owner==="string"&&OWNER.test(ev.owner),"Claim owner invalid");
      h.status="claimed";h.attempts++;h.owner=ev.owner;h.beat=Date.parse(ev.at);
    }else if(ev.kind==="heartbeat"){
      assert.ok(active.has(h.status),"Orphan heartbeat");
      assert.equal(ev.owner,h.owner,"Heartbeat owner mismatch");
      h.beat=Date.parse(ev.at);
    }else if(typeof ev.kind==="string"&&phases[ev.kind]){
      const [from,to]=phases[ev.kind];
      assert.equal(h.status,from,"Phase out of order");
      assert.equal(ev.owner,h.owner,"Phase owner mismatch");
      h.status=to;
      if(to==="submitted"){h.owner=undefined;h.beat=undefined}
    }else if(ev.kind==="failed"||ev.kind==="lease_expired"){
      assert.ok(active.has(h.status),"Orphan failure");
      assert.equal(ev.owner,h.owner,"Failure owner mismatch");
      h.status=h.attempts>=3?"dead_letter":"ready";h.owner=undefined;h.beat=undefined;
    }else throw new Error("Unexpected ledger event");
    h.at=ev.at;history.set(ev.task_id,h);
  }
  assert.equal(state.last_hash,previous,"State/event digest mismatch");
  assert.deepEqual(state.last_event??null,events.at(-1)??null,"State/event tail mismatch");
  for(const [id,task] of Object.entries(state.tasks)){
    assert.ok(ID.test(id)&&task.engine===id.slice(5,8),"Task engine mismatch");
    const h=history.get(id);
    if(!h){
      assert.ok(task.status==="ready"||task.status==="blocked","Unrecorded active state");
      assert.equal(task.attempts,0,"Unrecorded attempts");
      assert.equal(task.lease,null,"Unrecorded lease");
      assert.equal(task.updated_at,null,"Unrecorded update");
      continue;
    }
    assert.equal(task.status,h.status,"Task state not backed by events");
    assert.equal(task.attempts,h.attempts,"Attempt count not backed by events");
    assert.equal(task.updated_at,h.at,"Update time not backed by events");
    if(active.has(h.status)){
      assert.ok(task.lease,"Active state without lease");
      assert.equal(task.lease.owner,h.owner,"Lease owner mismatch");
      assert.equal(task.lease.last_heartbeat_at,h.beat,"Heartbeat not backed by event");
      assert.ok(Number.isSafeInteger(task.lease.expires_at)&&
        typeof task.lease.expires_at==="number"&&typeof h.beat==="number"&&task.lease.expires_at>=h.beat+300000&&task.lease.expires_at<=h.beat+3600000,
        "Unbounded lease");
    }else assert.equal(task.lease,null,"Unexpected lease on inactive task");
  }
  return true;
}
