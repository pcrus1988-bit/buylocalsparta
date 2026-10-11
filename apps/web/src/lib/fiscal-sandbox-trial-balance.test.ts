import test from "node:test";
import assert from "node:assert/strict";
import {summarizeFiscalSandboxJournals} from "./fiscal-sandbox-trial-balance.ts";
const entry=(account_code:string,side:"debit"|"credit",amount_minor:string)=>({account_code,side,amount_minor});
const sample=[
 {id:"first",lines:[entry("cash_test","debit","12500"),entry("sales_test","credit","12500")]},
 {id:"second",lines:[entry("receivable_test","debit","5000"),entry("sales_test","credit","5000")]}
];
test("balances all entries for latest 20 test snapshots without implying legal books",()=>{
 const result=summarizeFiscalSandboxJournals(sample);
 assert.equal(result.scope,"latest_20_sandbox_snapshots");
 assert.equal(result.snapshotCount,2);
 assert.deepEqual([result.totalDebitMinor,result.totalCreditMinor],["17500","17500"]);
 assert.equal(result.balanced,true);
 assert.equal(result.officialAccounting,false);
 assert.equal(result.completeHistory,false);
 assert.deepEqual(result.rows.map(r=>[r.account,r.netDebitMinor]),[
  ["cash_test","12500"],["receivable_test","5000"],["sales_test","-17500"]]);
});
test("empty snapshot history is supported, not treated as a full ledger",()=>{
 const result=summarizeFiscalSandboxJournals([]);
 assert.equal(result.snapshotCount,0);
 assert.deepEqual(result.rows,[]);
 assert.equal(result.completeHistory,false);
});
test("enforces bounded input and rejects duplicate snapshots",()=>{
 assert.throws(()=>summarizeFiscalSandboxJournals(Array(21).fill(sample[0])),/TRIAL_BALANCE_SCOPE_EXCEEDED/);
 assert.throws(()=>summarizeFiscalSandboxJournals([sample[0],sample[0]]),/TRIAL_BALANCE_INVALID_JOURNAL/);
});
test("rejects invalid test accounts, amounts, and unbalanced journals",()=>{
 for(const lines of [
  [entry("real_bank","debit","100"),entry("sales_test","credit","100")],
  [entry("cash_test","debit","1.5"),entry("sales_test","credit","1.5")],
  [entry("cash_test","debit","1000000001"),entry("sales_test","credit","1000000001")],
  [entry("cash_test","debit","100"),entry("sales_test","credit","99")]
 ]){
  assert.throws(()=>summarizeFiscalSandboxJournals([{id:"bad",lines}]),/TRIAL_BALANCE_/);
 }
});
