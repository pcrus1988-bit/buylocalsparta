import assert from "node:assert/strict";
import {test} from "node:test";
import {latestWorkflowOutcomes,verifiedContractRun} from "./tiger-live-evidence.ts";

const url=(id:number)=>"https://github.com/pcrus1988-bit/Tiger-2-0/actions/runs/"+id;
test("one verification trophy kind despite many passing runs",()=>{
  const runs=[4,3,2].map((id)=>({
    id,name:"TIGER isolated contract and legacy reuse verification",status:"completed",
    conclusion:"success",created_at:"2026-10-24T08:00:0"+id+"Z",html_url:url(id)
  }));
  assert.equal(verifiedContractRun(runs)?.id,4);
  assert.equal(verifiedContractRun([]),undefined);
});
test("latest workflow outcome supersedes old failure",()=>{
  const runs=[
    {name:"TIGER checks",status:"completed",conclusion:"failure",created_at:"2026-10-24T07:00:00Z"},
    {name:"TIGER checks",status:"completed",conclusion:"success",created_at:"2026-10-24T08:00:00Z"},
    {name:"Other checks",status:"completed",conclusion:"failure",created_at:"2026-10-24T07:10:00Z"}
  ];
  const latest=latestWorkflowOutcomes(runs);
  assert.equal(latest.length,2);
  assert.equal(latest.find(r=>r.name==="TIGER checks")?.conclusion,"success");
  assert.deepEqual(latest.filter(r=>r.conclusion==="failure").map(r=>r.name),["Other checks"]);
});
test("ongoing retry prevents stale workflow failure from appearing unresolved",()=>{
  const latest=latestWorkflowOutcomes([
    {name:"Build",status:"completed",conclusion:"failure",created_at:"2026-10-24T07:00:00Z"},
    {name:"Build",status:"in_progress",conclusion:null,created_at:"2026-10-24T09:00:00Z"}
  ]);
  assert.equal(latest.length,1);
  assert.equal(latest[0].status,"in_progress");
});
test("missing and malformed workflow names cannot produce synthetic workflow issues",()=>{
  assert.deepEqual(latestWorkflowOutcomes([{status:"completed",conclusion:"failure"}]),[]);
  assert.equal(verifiedContractRun([{name:"Other",status:"completed",conclusion:"success"}]),undefined);
});
