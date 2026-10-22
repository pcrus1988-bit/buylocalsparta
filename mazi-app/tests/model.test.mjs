import test from "node:test";
import assert from "node:assert/strict";
import { allocationPreview, validateDraft } from "../lib/model.ts";

test("500 members at €250 excluding VAT allocate €50,000 at 40%",()=>{
  assert.deepEqual(allocationPreview(500),{totalEuro:125000,fundEuro:50000,remainderEuro:75000});
});
test("no imaginary money for zero members",()=>{
  assert.deepEqual(allocationPreview(0),{totalEuro:0,fundEuro:0,remainderEuro:0});
});
test("invalid member count, share and fee rejected",()=>{
  assert.throws(()=>allocationPreview(-1),RangeError);
  assert.throws(()=>allocationPreview(10.5),RangeError);
  assert.throws(()=>allocationPreview(5,250,1.1),RangeError);
  assert.throws(()=>allocationPreview(5,Number.NaN),RangeError);
});
test("valid draft and malformed requests",()=>{
 const ok={title:"Αναβάθμιση εξοπλισμού",category:"growth",amountEuro:6500,description:"Χρειαζόμαστε εξοπλισμό για την παραγωγή μας."};
 assert.equal(validateDraft(ok),null);
 assert.ok(validateDraft({...ok,amountEuro:500000}));
 assert.ok(validateDraft({...ok,description:"short"}));
 assert.ok(validateDraft({...ok,category:"invalid"}));
});
