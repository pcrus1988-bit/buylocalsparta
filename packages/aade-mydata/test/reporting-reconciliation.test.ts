import assert from "node:assert/strict";
import test from "node:test";
import { reconcileMyDataReporting } from "../src/public.ts";

const local=[
  {id:"tax_1",mark:"100",issueDate:"2026-08-19",invoiceTypeCode:"11.1",documentNumber:"KMR26/1"},
  {id:"tax_2",mark:"200",issueDate:"2026-08-20",invoiceTypeCode:"11.1",documentNumber:"KMR26/2"}
] as const;

const vatRecord=(mark:string)=>({mark,cancelled:false,amounts:{},fields:{Mark:mark}});
const e3Record=(mark:string)=>({mark,fields:{V_Mark:mark}});

test("reporting reconciliation is matched when every local MARK exists in VAT and E3",()=>{
  const result=reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("100"),vatRecord("200")],pages:1,complete:true},
    e3:{records:[e3Record("100"),e3Record("100"),e3Record("200")],pages:1,complete:true}
  });
  assert.equal(result.status,"matched");
  assert.equal(result.matchedVat,2);
  assert.equal(result.matchedE3,2);
  assert.deepEqual(result.localMissingInVat,[]);
  assert.deepEqual(result.localMissingInE3,[]);
});

test("missing local MARKs are drift while remote-only AADE records remain separate diagnostics",()=>{
  const result=reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("100"),vatRecord("900")],pages:1,complete:true},
    e3:{records:[e3Record("200"),e3Record("800")],pages:1,complete:true}
  });
  assert.equal(result.status,"drift");
  assert.deepEqual(result.localMissingInVat.map(row=>row.mark),["200"]);
  assert.deepEqual(result.localMissingInE3.map(row=>row.mark),["100"]);
  assert.deepEqual(result.unmatchedVatMarks,["900"]);
  assert.deepEqual(result.unmatchedE3Marks,["800"]);
});

test("an incomplete AADE collection can never report a green reconciliation",()=>{
  const result=reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("100"),vatRecord("200")],pages:25,complete:false,continuation:{nextPartitionKey:"p",nextRowKey:"r"}},
    e3:{records:[e3Record("100"),e3Record("200")],pages:1,complete:true}
  });
  assert.equal(result.status,"incomplete");
  assert.equal(result.complete,false);
});

test("duplicate local MARKs and malformed remote MARKs fail closed",()=>{
  assert.throws(()=>reconcileMyDataReporting({
    local:[...local,{...local[0],id:"tax_duplicate"}],
    vat:{records:[],pages:1,complete:true},
    e3:{records:[],pages:1,complete:true}
  }),/Duplicate local AADE MARK/);
  assert.throws(()=>reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("not-a-mark")],pages:1,complete:true},
    e3:{records:[],pages:1,complete:true}
  }),/AADE reporting MARK must be numeric/);
});
