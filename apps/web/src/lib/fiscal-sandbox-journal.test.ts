import test from "node:test";
import assert from "node:assert/strict";
import {previewFiscalSandboxJournal} from "./fiscal-sandbox-journal.ts";

const posting=(account="cash_test",side="debit",amountMinor=12500)=>({account,side,amountMinor});
const balanced=()=>({entries:[posting(),posting("sales_test","credit")]});

test("balances a test sale with fixed integer cents, never posts",()=>{
  const preview=previewFiscalSandboxJournal(balanced());
  assert.deepEqual([preview.totalDebitMinor,preview.totalCreditMinor,preview.balanceMinor],[12500,12500,0]);
  assert.equal(preview.kind,"non_fiscal_test_journal_preview");
  for(const gate of ["postingEnabled","certifiedBookkeeping","legalTaxClassification","fiscalIssuanceEnabled"] as const)
    assert.equal(preview[gate],false);
});
test("supports balanced multi-entry internal prototypes",()=>{
  const input={entries:[posting("cash_test","debit",7000),posting("receivable_test","debit",5000),posting("sales_test","credit",12000)]};
  assert.equal(previewFiscalSandboxJournal(input).totalDebitMinor,12000);
});
test("rejects unbalanced, one-sided and zero transactions",()=>{
  for(const entries of [
    [posting(),posting("sales_test","credit",12499)],
    [posting(),posting("bank_test","debit")],
    [posting("cash_test","debit",0),posting("sales_test","credit",0)]
  ])assert.throws(()=>previewFiscalSandboxJournal({entries}),/JOURNAL_/);
});
test("rejects unknown fields, tax assertions, floating point and out-of-scope accounts",()=>{
  for(const input of [
    {...balanced(),issued:true},
    {...balanced(),vatRateBps:2400},
    {entries:[{...posting(),legalInvoiceId:"test"},posting("sales_test","credit")]},
    {entries:[posting("cash_test","debit",1.5),posting("sales_test","credit")]},
    {entries:[posting("official_tax_liability","debit"),posting("sales_test","credit")]},
    {entries:[posting("cash_test","debit",-1),posting("sales_test","credit",-1)]},
    {entries:[posting("cash_test","debit",NaN),posting("sales_test","credit")]}
  ])assert.throws(()=>previewFiscalSandboxJournal(input),/JOURNAL_/);
});
test("caps size and amount and rejects malformed payloads",()=>{
  assert.throws(()=>previewFiscalSandboxJournal(null),/JOURNAL_INVALID_INPUT/);
  assert.throws(()=>previewFiscalSandboxJournal({entries:[]}),/JOURNAL_INVALID_ENTRY_COUNT/);
  assert.throws(()=>previewFiscalSandboxJournal({entries:Array.from({length:41},()=>posting())}),/JOURNAL_INVALID_ENTRY_COUNT/);
  assert.throws(()=>previewFiscalSandboxJournal({entries:[posting("cash_test","debit",1_000_000_001),posting("sales_test","credit")]}),/JOURNAL_INVALID_ENTRY/);
  assert.throws(()=>previewFiscalSandboxJournal({entries:["bad",posting("sales_test","credit")]}),/JOURNAL_INVALID_ENTRY/);
});
