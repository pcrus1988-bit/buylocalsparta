import assert from "node:assert/strict";
import test from "node:test";
import { reconcileMyDataReporting } from "../src/public.ts";

const local=[
  {id:"tax_1",mark:"100",issueDate:"2026-08-19",invoiceTypeCode:"11.1",documentNumber:"KMR26/1",incomeCategory:"category1_1",e3Code:"E3_561_003",classificationValueMinor:81},
  {id:"tax_2",mark:"200",issueDate:"2026-08-20",invoiceTypeCode:"11.1",documentNumber:"KMR26/2",incomeCategory:"category1_1",e3Code:"E3_561_003",classificationValueMinor:163}
] as const;

const vatRecord=(mark:string)=>({mark,cancelled:false,amounts:{},fields:{Mark:mark}});
const e3Record=(mark:string,value:number,category="category1_1",type="E3_561_003")=>({mark,classificationCategory:category,classificationType:type,classificationValue:value,fields:{V_Mark:mark,V_Class_Category:category,V_Class_Type:type,V_Class_Value:String(value)}});

test("reporting reconciliation is matched when MARKs and E3 classifications match",()=>{
  const result=reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("100"),vatRecord("200")],pages:1,complete:true},
    e3:{records:[e3Record("100",0.40),e3Record("100",0.41),e3Record("200",1.63)],pages:1,complete:true}
  });
  assert.equal(result.status,"matched");
  assert.equal(result.matchedVat,2);
  assert.equal(result.matchedE3,2);
  assert.equal(result.e3ClassificationChecked,2);
  assert.deepEqual(result.e3ClassificationMismatches,[]);
  assert.deepEqual(result.localMissingInVat,[]);
  assert.deepEqual(result.localMissingInE3,[]);
});

test("wrong E3 category/type or classification value is reported as drift",()=>{
  const result=reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("100"),vatRecord("200")],pages:1,complete:true},
    e3:{records:[e3Record("100",0.81,"category1_3","E3_561_003"),e3Record("200",1.00)],pages:1,complete:true}
  });
  assert.equal(result.status,"drift");
  assert.equal(result.e3ClassificationMismatches.length,2);
  assert.equal(result.e3ClassificationMismatches[0]?.reason,"expected_classification_missing");
  assert.equal(result.e3ClassificationMismatches[1]?.reason,"classification_value_mismatch");
});

test("missing local MARKs are drift while remote-only AADE records remain separate diagnostics",()=>{
  const result=reconcileMyDataReporting({
    local,
    vat:{records:[vatRecord("100"),vatRecord("900")],pages:1,complete:true},
    e3:{records:[e3Record("200",1.63),e3Record("800",1)],pages:1,complete:true}
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
    e3:{records:[e3Record("100",0.81),e3Record("200",1.63)],pages:1,complete:true}
  });
  assert.equal(result.status,"incomplete");
  assert.equal(result.complete,false);
});

test("a local accepted MARK without E3 expectation metadata keeps reconciliation incomplete",()=>{
  const incompleteLocal=[{id:"legacy",mark:"300",issueDate:"2026-08-20"}] as const;
  const result=reconcileMyDataReporting({
    local:incompleteLocal,
    vat:{records:[vatRecord("300")],pages:1,complete:true},
    e3:{records:[e3Record("300",1)],pages:1,complete:true}
  });
  assert.equal(result.status,"incomplete");
  assert.equal(result.localWithoutE3Expectation.length,1);
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
