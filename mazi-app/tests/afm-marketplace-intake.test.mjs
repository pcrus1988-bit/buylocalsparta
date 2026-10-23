import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=source("../sql/015_afm_interest_intake.sql");
const runtime=source("../../apps/web/src/lib/mazi-interest-runtime.ts");
const route=source("../../apps/web/src/app/api/mazi-interest/route.ts");
const admin=source("../../apps/web/src/lib/mazi-interest-admin.ts");
const review=source("../../apps/web/src/app/admin/mazi/interest/page.tsx");
const action=source("../../apps/web/src/app/admin/mazi/interest/actions.ts");

test("unauthenticated AFM interest is NOT an account registration",()=>{
 assert.match(runtime,/resolveGemiCompanyByAfm\(candidate\.afm\)/);
 assert.match(runtime,/on conflict\(tax_number\) do nothing/);
 assert.doesNotMatch(runtime,/auth\.signUp|auth\.admin\.createUser|auth\.signInWithOtp/);
 assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|setSession|createUser/);
 assert.match(route,/const MAZI_ORIGIN="https:\/\/mazi\.kontamou\.site"/);
});
test("rate-control and CSRF-origin barriers precede intake",()=>{
 assert.match(route,/req\.headers\.get\("origin"\)!==MAZI_ORIGIN/);
 assert.match(route,/x-vercel-forwarded-for/);
 assert.match(route,/await consumeMaziInterestLimit/);
 assert.match(runtime,/limit:4,windowMs:86400000/);
 assert.match(runtime,/limit:12,windowMs:86400000/);
 assert.match(route,/companyWebsiteCheck/);
});
test("business applications and audit are private with unique AFM",()=>{
 assert.match(sql,/tax_number text NOT NULL UNIQUE/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_interest_applications FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_interest_events FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/MAZI_INTEREST_EVENT_IMMUTABLE/);
});
test("Super Admin review requires independently verified representative and email",()=>{
 assert.match(admin,/await marketplaceMaziActor\(principal\)/);
 assert.match(admin,/!input\.representativeVerified\|\|!input\.emailVerified/);
 assert.match(admin,/registry_lookup_status!=="matched"/);
 assert.match(admin,/approved_pending_invite/);
 assert.match(admin,/INSERT INTO public\.mazi_interest_events/);
 assert.match(action,/assertAdminCsrf\(principal/);
 assert.match(review,/name="representativeVerified"/);
 assert.match(review,/name="emailVerified"/);
 assert.match(review,/name="companyActiveVerified"/);
 assert.match(review,/Δεν έχει σταλεί πρόσκληση/);
});
test("no finance, membership or invitations are minted",()=>{
 for(const file of [runtime,route,admin,sql]){
  assert.doesNotMatch(file,/INSERT INTO public\.mazi_members\b/i);
  assert.doesNotMatch(file,/INSERT INTO public\.mazi_fund_ledger\b/i);
  assert.doesNotMatch(file,/INSERT INTO public\.mazi_invitations\b/i);
  assert.doesNotMatch(file,/finance_activated\s*=\s*true/);
 }
});
