import assert from "node:assert/strict";
import {test} from "node:test";
import {parseTaskAllocation,inspectTaskAllocations} from "./tiger-live-claims.ts";
const claim={
  repo:"pcrus1988-bit/Tiger-2-0",task_id:"AUTO-E06-01",engine:"E06",
  owner:"A02:chatgpt-task-tiger-engineering",status:"claimed",attempt:1,
  created_at:"2026-10-24T08:00:00Z",expires_at:"2026-10-24T09:30:00Z"
};
const now=Date.parse("2026-10-24T08:30:00Z");
test("a bounded real claim is an allocation, not a worker heartbeat",()=>{
  const v=parseTaskAllocation(claim,"AUTO-E06-01.json",now);
  assert.equal(v.status,"allocated");
  assert.equal(v.engineId,"E06");
  assert.ok(!("agentId" in v));
  assert.ok(!("heartbeatAt" in v));
});
test("expired claims remain visible for reconciliation, not reassigned",()=>{
  const v=parseTaskAllocation(claim,"AUTO-E06-01.json",Date.parse("2026-10-24T10:00:00Z"));
  assert.equal(v.status,"expired");
});
test("claims with invented role, mismatched name, blocked scope or overlong lease fail closed",()=>{
  assert.throws(()=>parseTaskAllocation({...claim,owner:"A08:reviewer"},"AUTO-E06-01.json",now));
  assert.throws(()=>parseTaskAllocation({...claim,task_id:"AUTO-E01-01",engine:"E01"},"AUTO-E06-01.json",now));
  assert.throws(()=>parseTaskAllocation({...claim,expires_at:"2026-10-24T11:30:00Z"},"AUTO-E06-01.json",now));
  assert.throws(()=>parseTaskAllocation({...claim,engine:"E01"},"AUTO-E06-01.json",now));
  assert.throws(()=>parseTaskAllocation({...claim,extra:"unsafe"},"AUTO-E06-01.json",now));
  assert.throws(()=>parseTaskAllocation({...claim,created_at:"2026-02-30T08:00:00Z"},"AUTO-E06-01.json",now));
});
test("claim inspection is deterministic, duplicate protected and bounded",()=>{
  const doc={filename:"AUTO-E06-01.json",content:claim};
  assert.equal(inspectTaskAllocations([doc],now).length,1);
  assert.throws(()=>inspectTaskAllocations([doc,doc],now));
  assert.throws(()=>inspectTaskAllocations(Array(21).fill(doc),now));
  assert.deepEqual(inspectTaskAllocations([],now),[]);
});
