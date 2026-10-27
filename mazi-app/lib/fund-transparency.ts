/**
 * Financial accountability presentation boundary.
 * No client money mutations, no inferred bank balances and no fake demo data.
 */
export type PublicFundDisclosure = {
 id:string; kind:"receipt"|"award"|"disbursement"|"expense"|"reconciliation"|"correction"|"milestone";
 date:string;amount_cents:number|null;summary:string;
 evidence_sha256:string|null;supersedes_id:string|null;
};
export type PublicFundMonth = {
 month:string;receipts_cents:number;expenses_cents:number;allocations_cents:number
};
export type PublicFundReport = {
 as_of:string;currency:"EUR";
 financial_operations_enabled:boolean;financial_cycles:number;
 receipts_cents:number;expenses_cents:number;allocation_entries_cents:number;
 reversal_entries_cents:number;reserved_offers_cents:number;
 offer_count:number;ledger_entries:number;last_entry_at:string|null;
 book_cash_balance_cents:number;
 reconciliation:{period_end:string;statement_balance_cents:number;reviewed_at:string;scope:string}|null;
 available_for_new_awards_cents:number|null;
 ledger_semantics_review_required:boolean;
 public_events:PublicFundDisclosure[];monthly:PublicFundMonth[];
 evidence_notice:string;
};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const money=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&Math.abs(v)<9e15;
const count=(v:unknown):v is number=>money(v)&&v>=0;
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0;
const validDate=(v:unknown)=>text(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const validMonth=(v:unknown)=>text(v)&&/^\d{4}-\d{2}$/.test(v);
const kinds=new Set(["receipt","award","disbursement","expense","reconciliation","correction","milestone"]);
/** Fail closed: malformed or unreachable reporting must never appear as a zero balance. */
export function parsePublicFundReport(v:unknown):PublicFundReport|null{
 if(!object(v)||!text(v.as_of)||v.currency!=="EUR"
  ||typeof v.financial_operations_enabled!=="boolean"
  ||typeof v.ledger_semantics_review_required!=="boolean"
  ||!count(v.financial_cycles)||!count(v.receipts_cents)||!count(v.expenses_cents)
  ||!count(v.allocation_entries_cents)||!count(v.reversal_entries_cents)
  ||!count(v.reserved_offers_cents)||!count(v.offer_count)||!count(v.ledger_entries)
  ||!money(v.book_cash_balance_cents)
  ||(v.available_for_new_awards_cents!==null&&!count(v.available_for_new_awards_cents))
  ||(v.last_entry_at!==null&&!text(v.last_entry_at))
  ||!Array.isArray(v.public_events)||!Array.isArray(v.monthly)
  ||v.public_events.length>100||v.monthly.length>24||!text(v.evidence_notice))return null;
 if(v.reconciliation!==null){
  if(!object(v.reconciliation)||!validDate(v.reconciliation.period_end)
   ||!count(v.reconciliation.statement_balance_cents)
   ||!text(v.reconciliation.reviewed_at)||!text(v.reconciliation.scope))return null;
 }
 for(const row of v.public_events){
  if(!object(row)||!text(row.id)||!kinds.has(String(row.kind))
   ||!validDate(row.date)||!text(row.summary)||row.summary.length>320
   ||(row.amount_cents!==null&&!count(row.amount_cents))
   ||(row.evidence_sha256!==null&&(!text(row.evidence_sha256)||! /^[a-f0-9]{64}$/.test(row.evidence_sha256)))
   ||(row.supersedes_id!==null&&!text(row.supersedes_id)))return null;
 }
 for(const row of v.monthly){
  if(!object(row)||!validMonth(row.month)||!count(row.receipts_cents)
   ||!count(row.expenses_cents)||!count(row.allocations_cents))return null;
 }
 return v as unknown as PublicFundReport;
}
export const euroCents=(cents:number)=>new Intl.NumberFormat("el-GR",{
 style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2
}).format(cents/100);
export const financeStatus=(report:PublicFundReport)=>{
 if(!report.financial_operations_enabled)return "Το Ταμείο δεν έχει ενεργοποιηθεί για χρηματοδότηση.";
 if(report.ledger_semantics_review_required)return "Υπάρχουν εγγραφές αντιλογισμού που απαιτούν συμφωνία.";
 if(!report.reconciliation)return "Δεν έχει δημοσιευτεί συμφωνία βιβλίου και τραπεζικής κατάστασης.";
 return "Υπάρχει εσωτερική συμφωνία βιβλίου και τραπεζικής κατάστασης για την αναγραφόμενη περίοδο.";
};
