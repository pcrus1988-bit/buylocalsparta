import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const page=readFileSync(new URL("../app/admin/mazi/interest/page.tsx",import.meta.url),"utf8");
const action=readFileSync(new URL("../app/admin/mazi/interest/actions.ts",import.meta.url),"utf8");

test("MAZI approval requires each independently attested verification",()=>{
 for(const flag of ["representativeVerified","emailVerified","companyActiveVerified"]){
  assert.match(page,new RegExp('name="'+flag+'" type="checkbox" required'));
  assert.match(action,new RegExp(flag+':form.get\\("'+flag+'"\\)==="on"'));
 }
 assert.match(page,/disabled=\{!registryCurrent\(a\)\}/);
 assert.match(page,/Date\.now\(\)-new Date\(row\.registry_checked_at!\)\.getTime\(\)<=7\*86400000/);
});

test("declining an application does not require approving its verification",()=>{
 assert.equal((page.match(/<form action=\{reviewMaziInterestAction\}/g)||[]).length,2);
 assert.match(page,/name="decision" value="decline"/);
 assert.equal((page.match(/name="reason" required minLength=\{20\}/g)||[]).length,2);
});

test("business validation failures return safe notices without bypassing security",()=>{
 for(const code of ["MAZI_INTEREST_VERIFICATION_REQUIRED","MAZI_INTEREST_DECISION_INVALID","MAZI_INTEREST_NOT_REVIEWABLE","MAZI_ALREADY_MEMBER"]){
  assert.ok(action.includes(code),code);
 }
 assert.match(action,/requireMarketplaceSuperAdminRole\(principal\)/);
 assert.match(action,/assertAdminCsrf\(principal,value\(form,"csrf"\)\)/);
 assert.match(action,/throw error;/);
 assert.match(page,/params\.notice==="verification_required"/);
});
