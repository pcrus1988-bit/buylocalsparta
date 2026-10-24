import {test} from "node:test";
import assert from "node:assert/strict";
import {openEngineCandidates} from "./tiger-live-candidates.ts";
const repo="pcrus1988-bit/Tiger-2-0";
const pr=(number:number,title:string,headRef:string,options:Record<string,unknown>={})=>({
 number,state:"open",draft:true,title,updated_at:"2026-10-24T08:15:18Z",
 head:{ref:headRef,sha:"a".repeat(40),repo:{full_name:repo}},
 html_url:"https://github.com/"+repo+"/pull/"+number,...options
});
test("real E05 draft appears as candidate without modifying engine task status",()=>{
  const items=openEngineCandidates([pr(81,"TIGER-5 / E05: eligibility core","agent/e05-geography-offline")]);
  assert.deepEqual(items.get("E05"),{
    number:81,url:"https://github.com/"+repo+"/pull/81",
    draft:true,updatedAt:"2026-10-24T08:15:18Z",headSha:"a".repeat(40)
  });
  assert.equal(items.get("E04"),undefined);
});
test("closed PRs, spoofed URLs, foreign heads or invalid commit are not candidates",()=>{
  const rows=[
    pr(1,"E05 test","agent/e05",{state:"closed"}),
    pr(2,"E06 test","agent/e06",{html_url:"https://attacker.example/pr/2"}),
    pr(3,"E07 test","agent/e07",{head:{ref:"agent/e07",sha:"a".repeat(40),repo:{full_name:"attacker/repo"}}}),
    pr(4,"E08 test","agent/e08",{head:{ref:"agent/e08",sha:"fake",repo:{full_name:repo}}})
  ];
  assert.equal(openEngineCandidates(rows).size,0);
  assert.throws(()=>openEngineCandidates({items:rows}));
});
test("latest updated candidate wins; ambiguity doesn't falsely imply acceptance",()=>{
  const items=openEngineCandidates([
    pr(81,"TIGER E05 first","agent/e05"),
    pr(96,"TIGER E05 follow-up","agent/e05-followup",{updated_at:"2026-10-24T09:00:00Z",draft:false})
  ]);
  assert.equal(items.get("E05")?.number,96);
  assert.equal(items.get("E05")?.draft,false);
});
test("engine identifiers are exact; no fabricated E21 or odd-number hits",()=>{
  const items=openEngineCandidates([pr(90,"E01 E20 E21 build","agent/e20")]);
  assert.deepEqual([...items.keys()].sort(),["E01","E20"]);
});
