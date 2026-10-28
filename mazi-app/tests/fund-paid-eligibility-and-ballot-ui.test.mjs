import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
test("only funded cycles require verified paid membership: founding pilot remains nonfinancial",()=>{
 const sql=read("sql/038_fund_paid_membership_gate.sql");
 assert.match(sql,/kind is distinct from 'fund_allocation'/);
 assert.match(sql,/r\.paid_enabled=true/);
 assert.match(sql,/r\.activated_at is not null/);
 assert.match(sql,/p\.member_user_id=member_id/);
 assert.match(sql,/p\.ends_at>now\(\)/);
 assert.match(sql,/p\.verified_invoice_ref/);
 assert.match(sql,/zz_mazi_fund_paid_application/);
 assert.match(sql,/zz_mazi_fund_paid_ballot/);
 assert.doesNotMatch(sql,/update public\.mazi_service_release_state/);
 assert.doesNotMatch(sql,/insert into public\.mazi_service_periods/);
});
test("funded vote electorate is frozen exclusively from active paid members",()=>{
 const admin=read("../apps/web/src/app/admin/mazi/fund/actions.ts");
 assert.match(admin,/mazi_service_release_state release/);
 assert.match(admin,/release\.paid_enabled=true/);
 assert.match(admin,/mazi_service_periods period/);
 assert.match(admin,/period\.ends_at>now\(\)/);
 assert.match(admin,/mazi_fund_electorate/);
});
test("funded member service has a second independent paid entitlement guard",()=>{
 const api=read("supabase/functions/mazi-fund-member/index.ts");
 assert.match(api,/mazi_service_release_state/);
 assert.match(api,/mazi_service_periods/);
 assert.match(api,/paidEligible/);
 assert.match(api,/paid_membership_required/);
 assert.match(api,/memberEligible=paidEligible/);
 assert.doesNotMatch(api,/insert into public\.mazi_fund_ledger/);
});
test("funded ballot UI requires explicit confirmation before irreversible submit",()=>{
 const form=read("app/fund/vote/fund-vote-form.tsx");
 const page=read("app/fund/vote/page.tsx");
 assert.match(form,/useFormStatus/);
 assert.match(form,/selected\.length>0&&confirmed/);
 assert.match(form,/current\.length>=20/);
 assert.match(form,/disabled=\{!available\|\|pending\}/);
 assert.match(form,/checked=\{confirmed\}/);
 assert.match(page,/result\.paid_eligible/);
 assert.match(page,/enabled=\{!result\.has_voted/);
});

test("member ballot choices hide own legal entity and recorded conflicts",()=>{
 const api=read("supabase/functions/mazi-fund-member/index.ts");
 assert.match(api,/mazi_vote_conflicts/);
 assert.match(api,/\.eq\("gemi_number",member\.gemi_number\)/);
 assert.match(api,/connectedIds\.has\(p\.created_by\)/);
 assert.match(api,/conflictIds\.has\(p\.id\)/);
 assert.match(api,/input\.proposal_ids\.some\(x=>!proposals\.some/);
});
