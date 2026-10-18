import test from "node:test";
import assert from "node:assert/strict";
import {parseFiscalCreditLabEuro,previewFiscalCreditLab} from "./fiscal-credit-lab.ts";

const sample=()=>({
 lane:"b2c" as const,
 rows:[
  {original:"50,00",previouslyCredited:"20,00",proposedCredit:"12,00"},
  {original:"25,00",previouslyCredited:"0",proposedCredit:"5,00"},
  {original:"12,50",previouslyCredited:"0",proposedCredit:"0"}
 ]
});
test("converts Greek and international decimal notation to exact integer cents",()=>{
 assert.equal(parseFiscalCreditLabEuro("12,50"),1250);
 assert.equal(parseFiscalCreditLabEuro("12.5"),1250);
 assert.equal(parseFiscalCreditLabEuro(" 1 "),100);
 assert.equal(parseFiscalCreditLabEuro("0,01"),1);
 assert.equal(parseFiscalCreditLabEuro("0",true),0);
 assert.equal(parseFiscalCreditLabEuro("10000000000"),1000000000000);
});
test("rejects ambiguous grouping, extra decimals, negatives, empty, overflow and non-numbers",()=>{
 for(const value of ["1.234,56","1,234.56","0.001","1.005","-1","NaN",
  "Infinity","", "01,00","10000000000.01","1 000"]) {
  assert.throws(()=>parseFiscalCreditLabEuro(value),/LAB_INVALID_AMOUNT/);
 }
 assert.throws(()=>parseFiscalCreditLabEuro("0"),/LAB_INVALID_AMOUNT/);
 assert.throws(()=>parseFiscalCreditLabEuro(12),/LAB_INVALID_AMOUNT/);
});
test("offers all four lanes with no legal, refund, payment or persistent side effects",()=>{
 for(const lane of ["b2c","pos","b2b","b2g"] as const){
  const request={...sample(),lane};
  const prior=structuredClone(request);
  const result=previewFiscalCreditLab(request);
  assert.deepEqual(result.totals,{
   originalGrossMinor:"8750",previouslyAllocatedMinor:"2000",
   proposedCreditMinor:"1700",remainingGrossMinor:"5050"
  });
  assert.equal(result.lane,lane);
  assert.equal(result.legalCreditNoteIssued,false);
  assert.equal(result.taxReversalDetermined,false);
  assert.equal(result.refundExecuted,false);
  assert.equal(result.officialAccounting,false);
  assert.equal(result.fiscalIssuanceEnabled,false);
  assert.equal(Object.isFrozen(result),true);
  assert.deepEqual(request,prior);
 }
});
test("rejects an over-credit and empty proposal",()=>{
 const row=sample().rows[0];
 assert.throws(()=>previewFiscalCreditLab({...sample(),rows:[
  {...row,proposedCredit:"30,01"}]}),/LAB_OVERALLOCATED/);
 assert.throws(()=>previewFiscalCreditLab({...sample(),rows:[
  {...row,proposedCredit:"0"}]}),/LAB_EMPTY_PROPOSAL/);
});
test("rejects oversized or invalid synthetic inputs",()=>{
 assert.throws(()=>previewFiscalCreditLab({...sample(),rows:[]}),/LAB_INVALID_INPUT/);
 assert.throws(()=>previewFiscalCreditLab({...sample(),rows:Array(13).fill(sample().rows[0])}),/LAB_INVALID_INPUT/);
 assert.throws(()=>previewFiscalCreditLab({...sample(),rows:[
  {original:"10000000000",previouslyCredited:"0",proposedCredit:"1"},
  {original:"0,01",previouslyCredited:"0",proposedCredit:"0"}
 ]}),/LAB_TOTAL_TOO_LARGE/);
 assert.throws(()=>previewFiscalCreditLab({...sample(),lane:"official" as "b2c"}),/LAB_INVALID_INPUT/);
 assert.throws(()=>previewFiscalCreditLab({...sample(),rows:[
  {...sample().rows[0],taxNumber:"123456789"}
 ]}),/LAB_INVALID_INPUT/);
});
test("handles zero historical allocation and fully allocates a synthetic original",()=>{
 const result=previewFiscalCreditLab({lane:"b2g",rows:[
  {original:"5,55",previouslyCredited:"0",proposedCredit:"5,55"}
 ]});
 assert.equal(result.totals.remainingGrossMinor,"0");
 assert.equal(result.totals.previouslyAllocatedMinor,"0");
});
