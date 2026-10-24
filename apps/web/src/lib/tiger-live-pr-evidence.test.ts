import test from "node:test";
import assert from "node:assert/strict";
import {projectVerifiedPulls} from "./tiger-live-pr-evidence.ts";
const now="2026-10-24T08:30:00.000Z";
const good=(input:unknown):string|undefined=>typeof input==="string"&&
  /^https:\/\/github\.com\/pcrus1988-bit\/Tiger-2-0\/pull\/[0-9]+$/.test(input)?input:undefined;
test("merged PR creates a new evidence event and a code-only achievement",()=>{
  const item={number:81,created_at:"2026-10-24T08:15:18Z",merged_at:"2026-10-24T08:29:00Z",
    html_url:"https://github.com/pcrus1988-bit/Tiger-2-0/pull/81",head:{ref:"feature/e05-eligibility"}};
  const result=projectVerifiedPulls([item],now,good);
  assert.equal(result.events[0].id,"gh:pr:81:merged");
  assert.equal(result.events[0].eventType,"pr.merged");
  assert.equal(result.events[0].occurredAt,"2026-10-24T08:29:00.000Z");
  assert.equal(result.events[0].engineId,"E05");
  assert.equal(result.achievements.length,1);
  assert.match(result.achievements[0].title,/code evidence only/);
  assert.ok(!JSON.stringify(result).includes("accepted"));
});
test("draft PR is not a merge achievement and yields a distinct event ID",()=>{
  const result=projectVerifiedPulls([{number:81,created_at:"2026-10-24T08:15:18Z",
    merged_at:null,html_url:"https://github.com/pcrus1988-bit/Tiger-2-0/pull/81"}],now,good);
  assert.equal(result.events[0].id,"gh:pr:81:created");
  assert.equal(result.achievements.length,0);
});
test("invalid or outside-repository links never become events",()=>{
  const input=[{number:81,created_at:now,merged_at:now,html_url:"https://evil.test/pull/81"},
    {number:0,created_at:now,html_url:"https://github.com/pcrus1988-bit/Tiger-2-0/pull/0"},
    {number:82,created_at:"bad",html_url:"https://github.com/pcrus1988-bit/Tiger-2-0/pull/82"}];
  assert.deepEqual(projectVerifiedPulls(input,now,good),{events:[],achievements:[]});
});
test("malformed data cannot fabricate workers, messages or task states",()=>{
  const result=projectVerifiedPulls([{number:12,created_at:now,
    html_url:"https://github.com/pcrus1988-bit/Tiger-2-0/pull/12",head:{ref:"e99"}}
  ],now,good);
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].engineId,undefined);
  assert.equal("agentId" in result.events[0],false);
  assert.equal("taskId" in result.events[0],false);
});
