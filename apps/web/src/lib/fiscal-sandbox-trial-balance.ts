/**
 * Read-only trial balance for at most the 20 latest saved non-fiscal test journals.
 * This is NOT a statutory ledger, a full-history balance, a VAT calculation
 * or accounting posting. Inputs must already have been tenant-scoped by the DB.
 */
import type {FiscalSandboxAccount} from "./fiscal-sandbox-journal";
export type TrialBalanceLine=Readonly<{
 account_code:string; side:"debit"|"credit"; amount_minor:string;
}>;
export type TrialBalanceJournal=Readonly<{id:string;lines:ReadonlyArray<TrialBalanceLine>}>;
export type TrialBalanceRow=Readonly<{
 account:FiscalSandboxAccount;
 debitMinor:string;creditMinor:string;netDebitMinor:string;
}>;
export type TrialBalanceSummary=Readonly<{
 scope:"latest_20_sandbox_snapshots";
 snapshotCount:number; rows:TrialBalanceRow[];
 totalDebitMinor:string;totalCreditMinor:string;
 balanced:boolean; officialAccounting:false; completeHistory:false;
}>;
const codes=[
 "cash_test","bank_test","receivable_test","payable_test",
 "sales_test","purchases_test","inventory_test","adjustment_test"
] as const satisfies readonly FiscalSandboxAccount[];
const valid=new Set<string>(codes);
const MAX=1_000_000_000n;
export function summarizeFiscalSandboxJournals(
 journals:ReadonlyArray<TrialBalanceJournal>
):TrialBalanceSummary{
 if(journals.length>20)throw new Error("TRIAL_BALANCE_SCOPE_EXCEEDED");
 const seen=new Set<string>();
 const totals=new Map<FiscalSandboxAccount,{debit:bigint;credit:bigint}>();
 for(const journal of journals){
  if(!journal.id||seen.has(journal.id)||journal.lines.length<2||journal.lines.length>40)
   throw new Error("TRIAL_BALANCE_INVALID_JOURNAL");
  seen.add(journal.id);
  let debit=0n,credit=0n;
  for(const line of journal.lines){
   if(!valid.has(line.account_code)||!["debit","credit"].includes(line.side)||
    !/^[1-9][0-9]*$/.test(line.amount_minor))
    throw new Error("TRIAL_BALANCE_INVALID_LINE");
   const amount=BigInt(line.amount_minor);
   if(amount>MAX)throw new Error("TRIAL_BALANCE_AMOUNT_OUT_OF_RANGE");
   const code=line.account_code as FiscalSandboxAccount;
   const row=totals.get(code)??{debit:0n,credit:0n};
   row[line.side]+=amount;
   totals.set(code,row);
   if(line.side==="debit")debit+=amount;else credit+=amount;
  }
  if(debit!==credit)throw new Error("TRIAL_BALANCE_UNBALANCED_JOURNAL");
 }
 let totalDebit=0n,totalCredit=0n;
 const rows:TrialBalanceRow[]=[];
 for(const account of codes){
  const balance=totals.get(account);
  if(!balance)continue;
  totalDebit+=balance.debit;totalCredit+=balance.credit;
  rows.push({account,debitMinor:String(balance.debit),
   creditMinor:String(balance.credit),
   netDebitMinor:String(balance.debit-balance.credit)});
 }
 return {
  scope:"latest_20_sandbox_snapshots",snapshotCount:journals.length,
  rows,totalDebitMinor:String(totalDebit),totalCreditMinor:String(totalCredit),
  balanced:totalDebit===totalCredit,officialAccounting:false,completeHistory:false
 };
}
