import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parsePublicFundReport,financeStatus} from "../lib/fund-transparency.ts";

const file=(name)=>readFileSync(new URL(name,import.meta.url),"utf8");
const blank={
 as_of:"2026-10-28T00:00:00Z",currency:"EUR",
 financial_operations_enabled:false,financial_cycles:0,
 receipts_cents:0,expenses_cents:0,allocation_entries_cents:0,
 reversal_entries_cents:0,reserved_offers_cents:0,
 offer_count:0,ledger_entries:0,last_entry_at:null,
 book_cash_balance_cents:0,reconciliation:null,
 available_for_new_awards_cents:null,ledger_semantics_review_required:false,
 public_events:[],monthly:[],evidence_notice:"Only reviewed public data"
};
test("missing or invalid finance response never becomes a reassuring zero balance",()=>{
 assert.equal(parsePublicFundReport(null),null);
 assert.equal(parsePublicFundReport({}),null);
 assert.equal(parsePublicFundReport({...blank,receipts_cents:"0"}),null);
 assert.equal(parsePublicFundReport({...blank,available_for_new_awards_cents:"0"}),null);
 assert.equal(parsePublicFundReport({...blank,public_events:[{id:"test",kind:"receipt",summary:"private",amount_cents:-2}]}),null);
});
test("genuine zero ledger and absent bank reconciliation remain separate facts",()=>{
 const result=parsePublicFundReport(blank);
 assert.ok(result);
 assert.equal(result?.book_cash_balance_cents,0);
 assert.equal(result?.available_for_new_awards_cents,null);
 assert.match(financeStatus(result),/δεν έχει ενεργοποιηθεί/);
});
test("financial tables are never directly exposed to browser identities",()=>{
 const sql=file("../sql/028_growth_fund_transparency.sql");
 assert.match(sql,/revoke all on public\.mazi_fund_public_events from public, anon, authenticated, service_role/);
 assert.match(sql,/revoke all on function public\.mazi_fund_public_report\(\) from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.mazi_fund_public_report\(\) to service_role/);
});
test("funded ballots are immutable and unique per legal entity, with snapshotted eligibility",()=>{
 const ballot=file("../sql/029_growth_fund_democratic_ballots.sql");
 const control=file("../sql/033_fund_frozen_electorate_and_public_results.sql");
 assert.match(ballot,/unique\(cycle_id,voter_gemi_number\)/);
 assert.match(ballot,/mazi_fund_ballots_immutable/);
 assert.match(control,/mazi_fund_electorate_immutable/);
 assert.match(control,/MAZI_FUNDED_ELECTORATE_NOT_FROZEN_OR_INELIGIBLE/);
 assert.match(control,/mazi_fund_finalizations_immutable/);
});
test("member operations never create money or change the finance_activated flag",()=>{
 const member=file("../supabase/functions/mazi-fund-member/index.ts");
 assert.match(member,/admin\.auth\.getUser\(match\[1\]\)/);
 assert.match(member,/mazi_fund_electorate/);
 assert.doesNotMatch(member,/\.from\("mazi_fund_ledger"\)/);
 assert.doesNotMatch(member,/finance_activated\s*:/);
 assert.doesNotMatch(member,/\.rpc\("mazi_fund_public_report"\)/);
});
test("only the existing marketplace superadmin can issue finance governance commands",()=>{
 const admin=file("../../apps/web/src/app/admin/mazi/fund/actions.ts");
 assert.match(admin,/marketplaceMaziActor\(principal\)/);
 assert.match(admin,/assertAdminCsrf\(principal/);
 assert.match(admin,/for update/);
 assert.match(admin,/final_tally_sealed/);
 assert.doesNotMatch(admin,/update public\.mazi_cycles set finance_activated/);
});
