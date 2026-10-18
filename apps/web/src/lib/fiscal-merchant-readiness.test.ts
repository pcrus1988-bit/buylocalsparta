import test from "node:test";
import assert from "node:assert/strict";
import {fiscalMerchantReadiness} from "./fiscal-merchant-readiness.ts";

const account=(status:string,role:string="owner")=>({
 id:"11111111-1111-4111-8111-111111111111",
 legal_name:"Demo Retail",vat_number:"000000000",
 status,role
});
const email={verified:false,verificationEnabled:true};

test("does not grant fiscal issuance under any organization state or role",()=>{
 for(const status of ["pending_review","under_review","approved","rejected","suspended","invented"]) {
  for(const role of ["owner","accountant","viewer","admin"]) {
   const x=fiscalMerchantReadiness(account(status,role),email);
   assert.equal(x.legalIssuanceEnabled,false);
   assert.equal(x.steps.find(s=>s.id==="issuance")?.state,"unavailable");
   assert.equal(x.syntheticCreditLabAvailable,true);
   assert.equal(Object.isFrozen(x),true);
   assert.equal(Object.isFrozen(x.steps),true);
   assert.ok(x.steps.every(s=>Object.isFrozen(s)));
  }
 }
});
test("matches the server's non-fiscal draft and journal write gates",()=>{
 for(const status of ["pending_review","under_review","approved","rejected","suspended","unknown"]) {
  for(const role of ["owner","accountant","viewer","admin"]) {
   const expected=status==="approved"&&["owner","accountant"].includes(role);
   for(const verified of [true,false]) {
    const r=fiscalMerchantReadiness(account(status,role),{verified,verificationEnabled:true});
    assert.equal(r.testDraftWritesAllowed,expected);
    assert.equal(r.testJournalWritesAllowed,expected);
    assert.equal(r.steps.find(s=>s.id==="test_access")?.state,expected?"complete":"restricted");
   }
  }
 }
});
test("unverified email is distinct from disabled email delivery and business approval",()=>{
 let x=fiscalMerchantReadiness(account("approved"),{verified:false,verificationEnabled:false});
 assert.equal(x.steps.find(s=>s.id==="email")?.state,"unavailable");
 assert.equal(x.testDraftWritesAllowed,true);
 x=fiscalMerchantReadiness(account("approved"),email);
 assert.equal(x.steps.find(s=>s.id==="email")?.state,"pending");
 x=fiscalMerchantReadiness(account("under_review"),{verified:true,verificationEnabled:false});
 assert.equal(x.steps.find(s=>s.id==="email")?.state,"complete");
 assert.equal(x.steps.find(s=>s.id==="organization")?.state,"pending");
 assert.equal(x.testDraftWritesAllowed,false);
});
test("missing, unknown and malformed state fails closed without claiming approvals",()=>{
 const x=fiscalMerchantReadiness(account("APPROVED","owner"),email);
 assert.equal(x.testDraftWritesAllowed,false);
 assert.equal(x.steps.find(s=>s.id==="organization")?.state,"restricted");
 for(const bad of [null,{}, {status:null,role:"owner"}, {status:"approved",role:null}]) {
  assert.throws(()=>fiscalMerchantReadiness(bad as never,email),/FISCAL_READINESS_INPUT_INVALID/);
 }
});
