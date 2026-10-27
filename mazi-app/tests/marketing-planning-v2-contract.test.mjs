import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("marketing financial execution is not activated by campaign planning",()=>{
 const sql=read("sql/033_marketing_campaign_planning.sql");
 assert.match(sql,/status in \('draft','review','archived'\)/);
 assert.doesNotMatch(sql,/status in \([^)]*'active'/);
 assert.match(sql,/mazi_marketing_brief_events/);
 assert.match(sql,/MAZI_MARKETING_AUDIT_APPEND_ONLY/);
 assert.match(sql,/revoke all on public.mazi_marketing_briefs from PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/mazi_marketing_preference_self_insert/);
 assert.match(sql,/member_user_id=\(select auth.uid\(\)\)/);
 assert.match(sql,/identity_verified_at is not null/);
});
test("member marketing stores voluntary preferences without enabling paid ads",()=>{
 const a=read("app/dashboard/marketing/actions.ts");
 assert.match(a,/maziMemberRequest/);
 assert.match(a,/marketing_preferences/);
 assert.match(a,/verified/);
 assert.doesNotMatch(a,/service_role/);
});
test("marketing admin operations enforce persisted superadmin and CSRF",()=>{
 const server=read("../apps/web/src/app/admin/mazi/marketing/actions.ts");
 const db=read("../apps/web/src/lib/mazi-marketing-admin.ts");
 assert.match(server,/assertAdminCsrf/);
 assert.match(db,/marketplaceMaziActor/);
 assert.match(db,/proposed_budget_cents/);
 assert.match(server,/createMaziMarketingBrief/);
 assert.doesNotMatch(server,/MOLLIE_API_KEY|STRIPE_SECRET_KEY|createPayment/);
});
