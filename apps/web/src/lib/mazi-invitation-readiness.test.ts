import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const lib=read("./mazi-invitation-admin.ts");
const page=read("../app/admin/mazi/interest/page.tsx");
const action=read("../app/admin/mazi/interest/actions.ts");

test("the Super Admin can see required invitation gate failures",()=>{
 assert.ok(lib.includes("maziInvitationPreflight(principal:SessionPrincipal)"));
 for(const gate of ["auth_email_delivery","legal_and_retention"]){
  assert.ok(lib.includes("gate_key='"+gate+"'"));
 }
 assert.ok(page.includes("Έλεγχος ετοιμότητας προσωπικών προσκλήσεων"));
 assert.ok(page.includes("Αναμένεται πραγματική επαλήθευση"));
 assert.ok(page.includes('href="/admin/mazi/operations"'));
 assert.ok(page.includes('disabled={!invitationReady}'));
 assert.ok(page.includes('aria-disabled={!invitationReady}'));
});

test("preflight still requires server-only configuration and financial safety",()=>{
 assert.ok(lib.includes("MAZI_SUPABASE_SERVICE_ROLE_KEY"));
 assert.ok(lib.includes("SUPABASE_SERVICE_ROLE_KEY"));
 assert.ok(lib.includes("===AUTH_PROJECT_URL"));
 assert.ok(lib.includes("public.mazi_fund_ledger"));
 assert.ok(lib.includes("public.mazi_grant_award_offers"));
 assert.ok(lib.includes("NOT finance_activated AND funding_budget_cents=0"));
 assert.ok(lib.includes('throw Error("MAZI_INVITATION_RELEASE_NOT_VERIFIED")'));
 assert.ok(lib.includes('throw Error("MAZI_FINANCIAL_LOCK_NOT_VERIFIED")'));
});

test("server action explains fail-closed invite failures without bypassing checks",()=>{
 for(const code of ["MAZI_INVITATION_RELEASE_NOT_VERIFIED","MAZI_INVITATION_DELIVERY_NOT_READY",
 "MAZI_INVITATION_BUSINESS_NOT_VERIFIED","MAZI_INVITATION_ALREADY_ACTIVE"]){
  assert.ok(action.includes(code));
 }
 assert.ok(action.includes('assertAdminCsrf(principal,value(form,"csrf"))'));
 assert.ok(action.includes("requireMarketplaceSuperAdminRole(principal)"));
 assert.ok(page.includes('params.notice==="invitation_release_not_verified"'));
 assert.ok(page.includes('params.notice==="invitation_finance_not_locked"'));
 assert.ok(page.includes('params.notice==="invitation_auth_not_configured"'));
});
