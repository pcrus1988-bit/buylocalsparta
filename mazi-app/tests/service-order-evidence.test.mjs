import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
const base=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(join(base,p),"utf8");
const sql=read("sql/033_service_order_acceptance.sql");
const api=read("supabase/functions/mazi-service-api/index.ts");
const member=read("app/services/page.tsx");
const admin=read("app/admin/services/page.tsx");
const actions=read("app/services/actions.ts");
const version="mazi-service-order-v1-2026-10-28";
test("service checkout explicitly accepts the same version across SQL, API and form",()=>{
 for(const source of [sql,api,member,actions])assert.ok(source.includes(version));
 assert.match(member,/name="terms_accepted" type="checkbox" value="yes" required/);
 assert.match(actions,/form.get\("terms_accepted"\)==="yes"/);
 assert.match(api,/body.terms_accepted===true/);
 assert.match(sql,/p_terms_accepted is distinct from true/);
});
test("request reservation and receipt are a single atomic database operation",()=>{
 assert.match(sql,/create table if not exists public.mazi_service_order_acceptances/);
 assert.match(sql,/request_id uuid primary key/);
 assert.match(sql,/insert into public.mazi_service_requests/);
 assert.match(sql,/insert into public.mazi_service_order_acceptances/);
 assert.match(sql,/insert into public.mazi_service_events/);
 assert.match(sql,/deliverable_snapshot/);
 assert.match(sql,/token_price_snapshot/);
 assert.match(sql,/revisions_included_snapshot/);
 assert.match(sql,/turnaround_business_days_snapshot/);
 assert.match(sql,/accepted_at timestamptz not null default now/);
});
test("no legacy bypass and no unauthorized access",()=>{
 assert.match(sql,/revoke execute on function public.mazi_services_internal_request\(uuid,text,text,uuid\)/);
 assert.match(sql,/revoke all on public.mazi_service_order_acceptances from public,anon,authenticated/);
 assert.match(sql,/grant select on public.mazi_service_order_acceptances to service_role/);
 assert.match(sql,/revoke all on function public.mazi_services_internal_request_v2/);
 assert.match(sql,/grant execute on function public.mazi_services_internal_request_v2/);
 assert.match(api,/admin.auth.getUser\(jwt\)/);
 assert.match(api,/mazi_services_internal_request_v2/);
 assert.doesNotMatch(api,/\.rpc\("mazi_services_internal_request"/);
 assert.match(sql,/subscription_not_activated/);
});
test("receipts are scoped to member request ids and displayed in both workspaces",()=>{
 assert.match(api,/\.eq\("member_user_id",user.id\)/);
 assert.match(api,/\.from\("mazi_service_order_acceptances"\)/);
 assert.match(member,/Αποδεικτικό αποδοχής παραγγελίας/);
 assert.match(admin,/Καταγεγραμμένη αποδοχή αιτήματος/);
});
test("idempotent retry does not create new charges after the period ends",()=>{
 const lookup=sql.indexOf("where member_user_id=v_uid and idempotency_key=p_idempotency_key");
 const period=sql.indexOf("select id into v_period from public.mazi_service_periods");
 assert.ok(lookup>0&&period>lookup);
 assert.match(sql,/raise exception 'idempotency_conflict'/);
 assert.match(sql,/v_spent\+v_price>250/);
 assert.match(sql,/limit 1 for update/);
});
