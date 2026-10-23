import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source = (path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=source("../sql/014_award_acceptance_foundation.sql");
const edge=source("../supabase/functions/mazi-member-api/index.ts");
const awards=source("../app/awards/page.tsx");
const actions=source("../app/actions.ts");
const lib=source("../lib/mazi-api.ts");

test("first-time priority is keyed to verified GEMI legal entity, never user account",()=>{
  assert.match(sql,/SELECT m\.gemi_number INTO legal_gemi/);
  assert.match(sql,/older_member\.gemi_number = legal_gemi/);
  assert.match(sql,/hashtextextended\(legal_gemi,39127\)/);
  assert.match(sql,/older_cycle\.kind = 'fund_allocation'/);
});

test("offers are immutable, budget bounded and impossible in nonfinancial founding cycle",()=>{
  assert.match(sql,/finance_activated IS NOT TRUE/);
  assert.match(sql,/prop\.kind <> 'fund_allocation'/);
  assert.match(sql,/prop\.cycle_status <> 'closed'/);
  assert.match(sql,/MAZI_AWARD_EXCEEDS_FUND_BUDGET/);
  assert.match(sql,/CREATE TRIGGER mazi_guard_grant_award_offers/);
  assert.match(sql,/MAZI_GRANT_OFFER_IMMUTABLE/);
  assert.match(sql,/NEW\.requested_amount_cents <> prop\.amount_cents/);
  assert.match(sql,/pg_catalog\.encode\([\s\S]*extensions\.digest/);
});

test("award term duration uses requested amount and recalculated 80 percent",()=>{
  assert.match(sql,/additional_months = \(requested_amount_cents \+ 9999\) \/ 10000/);
  assert.match(sql,/reapplication_after_months = \(additional_months \* 4 \+ 4\) \/ 5/);
  assert.match(awards,/offer\.requested_amount_cents/);
  assert.match(awards,/offer\.assigned_amount_cents/);
  assert.match(awards,/offer\.additional_months/);
});

test("recipient explicitly confirms exact text hash, multiple assertions and authenticated user",()=>{
  assert.match(awards,/name="understand_requested_amount_basis" required/);
  assert.match(awards,/name="understand_separate_disbursement" required/);
  assert.match(awards,/name="affirmatively_accepted" required/);
  assert.match(actions,/form\.get\("affirmatively_accepted"\)!=="on"/);
  assert.match(edge,/operation==="acknowledge_grant_offer"/);
  assert.match(edge,/input\.understand_requested_amount_basis!==true/);
  assert.match(edge,/input\.understand_separate_disbursement!==true/);
  assert.match(edge,/recipient_user_id:user\.id/);
  assert.match(sql,/offer\.agreement_sha256 <> NEW\.accepted_document_sha256/);
  assert.match(sql,/offer\.recipient_user_id <> NEW\.recipient_user_id/);
});

test("personal records are owner filtered and no browser table grants are created",()=>{
  assert.match(edge,/eq\("recipient_user_id",user\.id\)/);
  assert.match(edge,/grant_offers,grant_acknowledgements/);
  assert.match(lib,/grant_offers:MaziGrantOffer\[\]/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_grant_award_offers FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql,/GRANT SELECT ON TABLE public\.mazi_grant_award_offers TO service_role/);
  assert.match(sql,/GRANT SELECT, INSERT ON TABLE public\.mazi_grant_award_acknowledgements TO service_role/);
  assert.doesNotMatch(sql,/\bINSERT INTO public\.mazi_fund_ledger/);
  assert.doesNotMatch(sql,/UPDATE public\.mazi_cycles SET finance_activated/);
});

test("acknowledgement cannot be edited, deleted or treated as a payout",()=>{
  assert.match(sql,/MAZI_AWARD_ACCEPTANCE_IMMUTABLE/);
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.mazi_grant_award_acknowledgements/);
  assert.match(awards,/δεν ενεργοποιεί χρέωση/);
  assert.match(awards,/Δεν έγινε αποδοχή ή οικονομική ενέργεια/);
  assert.doesNotMatch(edge,/\.from\("mazi_fund_ledger"\)/);
});
