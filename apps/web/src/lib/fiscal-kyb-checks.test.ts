import assert from "node:assert/strict";
import {test} from "node:test";
import {parseFiscalKybInput,FiscalKybInputError,fiscalKybChecks,fiscalKybCounts} from "./fiscal-kyb-checks.ts";
const id="a0000000-0000-4000-8000-000000000111";
const requested={organizationId:id,checkType:"business_registration",outcome:"requested",
 sourceKind:"none",sourceReference:null};
const recorded={organizationId:id,checkType:"vat_identity",outcome:"evidence_recorded",
 sourceKind:"aade_public_check",sourceReference:"AADE:PUBLIC_REF_123"};
test("Only strict pending KYB review evidence requests can be recorded",()=>{
 assert.deepEqual(parseFiscalKybInput(requested),requested);
 assert.deepEqual(parseFiscalKybInput(recorded),recorded);
 assert.deepEqual(parseFiscalKybInput({...recorded,outcome:"discrepancy"}),{
  ...recorded,outcome:"discrepancy"
 });
});
test("Disallow PII, URLs, unverified sources, fake approvals and cross-tenant fields",()=>{
 for(const value of [
  {...recorded,sourceReference:"https://external.example/identity"},
  {...recorded,sourceReference:"Greek name with spaces"},
  {...recorded,sourceReference:"AB12"},
  {...recorded,sourceReference:"X".repeat(161)},
  {...recorded,sourceKind:"none"},
  {...requested,sourceKind:"gemi_public_registry"},
  {...requested,sourceReference:"SOME_REFERENCE"},
  {...recorded,organizationId:"foreign"},
  {...recorded,outcome:"approved"},
  {...recorded,checkType:"income_certified"},
  {...recorded,verified:true},
  {...recorded,legalApproval:true},
  {...recorded,identityDocuments:["forbidden"]},
  null,[],
 ]){
  assert.throws(()=>parseFiscalKybInput(value),FiscalKybInputError);
 }
});
test("Evidence inventory never automatically certifies a business",()=>{
 const events=fiscalKybChecks.map(check_type=>({check_type,outcome:"evidence_recorded"}));
 const counts=fiscalKybCounts(events);
 assert.deepEqual(counts,{total:7,recorded:7,discrepancies:0,outstanding:0,legalApproval:false});
 const changed=fiscalKybCounts([
  {check_type:"vat_identity",outcome:"discrepancy"},
  {check_type:"vat_identity",outcome:"evidence_recorded"},
  ...events.filter(x=>x.check_type!=="vat_identity")
 ]);
 assert.equal(changed.recorded,6);
 assert.equal(changed.discrepancies,1);
 assert.equal(changed.outstanding,1);
 assert.equal(changed.legalApproval,false);
});
