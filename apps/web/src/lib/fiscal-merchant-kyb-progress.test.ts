import test from "node:test";
import assert from "node:assert/strict";
import {summarizeFiscalMerchantKybProgress} from "./fiscal-merchant-kyb-progress.ts";

test("empty operator evidence is seven outstanding steps and no approval",()=>{
 const result=summarizeFiscalMerchantKybProgress([]);
 assert.equal(result.rows.length,7);
 assert.equal(result.outstandingCount,7);
 assert.equal(result.recordedCount,0);
 assert.equal(result.followUpCount,0);
 assert.equal(result.legalApproval,false);
 assert.equal(result.identityVerified,false);
 assert.equal(result.fiscalIssuanceEnabled,false);
 assert.ok(result.rows.every(x=>x.stage==="not_recorded"));
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.rows));
 assert.ok(result.rows.every(Object.isFrozen));
});
test("latest evidence only is displayed; no reviewer, references or documents leak",()=>{
 const raw=[
  {check_type:"business_registration",outcome:"discrepancy",
    source_reference:"SECRET-0001",recorded_by_ref:"REVIEWER-1"},
  {check_type:"business_registration",outcome:"evidence_recorded",
    source_reference:"SECRET-OLDER"},
  {check_type:"vat_identity",outcome:"evidence_recorded",source_kind:"aade_public_check"},
  {check_type:"registered_address",outcome:"requested"},
  {check_type:"legal_representation",outcome:"unexpected"},
  {check_type:"unknown_new_check",outcome:"evidence_recorded"},
 ];
 const unchanged=structuredClone(raw);
 const data=summarizeFiscalMerchantKybProgress(raw);
 assert.equal(data.rows.find(x=>x.checkType==="business_registration")?.stage,"discrepancy");
 assert.equal(data.rows.find(x=>x.checkType==="vat_identity")?.stage,"evidence_recorded");
 assert.equal(data.rows.find(x=>x.checkType==="registered_address")?.stage,"requested");
 assert.equal(data.rows.find(x=>x.checkType==="legal_representation")?.stage,"needs_review");
 assert.equal(data.recordedCount,1);
 assert.equal(data.followUpCount,2);
 assert.equal(data.outstandingCount,6);
 const text=JSON.stringify(data);
 assert.ok(!text.includes("SECRET"));
 assert.ok(!text.includes("REVIEWER"));
 assert.ok(!text.includes("source_reference"));
 assert.ok(!text.includes("source_kind"));
 assert.deepEqual(raw,unchanged);
});
test("all seven recorded checks still grant neither legal identity nor fiscal issuance",()=>{
 const checks=[
  "business_registration","vat_identity","registered_address","legal_representation",
  "beneficial_ownership","signing_authority","service_agreement"
 ];
 const result=summarizeFiscalMerchantKybProgress(
  checks.map(check_type=>({check_type,outcome:"evidence_recorded"}))
 );
 assert.equal(result.recordedCount,7);
 assert.equal(result.outstandingCount,0);
 assert.equal(result.legalApproval,false);
 assert.equal(result.identityVerified,false);
 assert.equal(result.fiscalIssuanceEnabled,false);
});
test("rejects malformed and excessive event lists",()=>{
 for(const malformed of [null,{}, "abc",Array(101).fill({check_type:"vat_identity",outcome:"requested"})]){
  assert.throws(()=>summarizeFiscalMerchantKybProgress(malformed as never),/FISCAL_KYB_SUMMARY_INVALID/);
 }
});
test("unknown status or null row cannot be interpreted as reviewed",()=>{
 const x=summarizeFiscalMerchantKybProgress([
  null as never,
  {check_type:"vat_identity",outcome:null},
  {check_type:"vat_identity",outcome:"evidence_recorded"}
 ]);
 assert.equal(x.rows.find(row=>row.checkType==="vat_identity")?.stage,"needs_review");
 assert.equal(x.recordedCount,0);
 assert.equal(x.fiscalIssuanceEnabled,false);
});
