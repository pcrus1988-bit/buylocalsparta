import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const sql=readFileSync(join(root,"sql/030_member_service_tokens.sql"),"utf8");
const member=readFileSync(join(root,"app/services/page.tsx"),"utf8");
const admin=readFileSync(join(root,"app/admin/services/page.tsx"),"utf8");
const actions=readFileSync(join(root,"app/services/actions.ts"),"utf8");
const publicCatalogue=readFileSync(join(root,"app/services/catalogue/page.tsx"),"utf8");
const homepage=readFileSync(join(root,"app/page.tsx"),"utf8");

test("catalogue contains 22 bounded fixed-price services",()=>{
 const seed=sql.match(/insert into public\.mazi_service_catalog\s*\([\s\S]+?on conflict \(id\) do nothing;/);
 assert.ok(seed);
 const values=[...seed[0].matchAll(/^\('([a-z0-9-]+)','[^\n]+',\d+,\d+,([0-9]+)\)/gm)];
 assert.equal(values.length,22);
 assert.equal(new Set(values.map(x=>x[1])).size,22);
 for(const v of values)assert.ok(+v[2]>=5&&+v[2]<=250);
});
test("allowance never auto-activates or rolls over",()=>{
 assert.match(sql,/allowance_tokens integer not null default 250 check \(allowance_tokens=250\)/);
 assert.match(sql,/verified_invoice_ref text not null unique/);
 assert.match(sql,/not public\.mazi_is_administrator\(\)/);
 assert.match(sql,/overlapping_period/);
 assert.match(sql,/starts_at<=clock_timestamp\(\) and ends_at>clock_timestamp\(\)/);
 assert.match(member,/Δεν υπάρχει ενεργός πληρωμένος κύκλος/);
 assert.match(member,/δεν μεταφέρονται/);
});
test("atomic reservation, idempotency, immutable client permissions",()=>{
 assert.match(sql,/limit 1 for update/);
 assert.match(sql,/unique\(member_user_id,idempotency_key\)/);
 assert.match(sql,/v_spent\+v_price>250/);
 assert.match(sql,/status in \('requested','accepted','in_progress','completed'\)/);
 assert.match(sql,/revoke all on public\.mazi_service_catalog,public\.mazi_service_periods,public\.mazi_service_requests,public\.mazi_service_events/);
 assert.match(sql,/grant select on public\.mazi_service_periods,public\.mazi_service_requests,public\.mazi_service_events to authenticated/);
 assert.doesNotMatch(sql,/grant (insert|update|delete) on public\.mazi_service_/);
});
test("access control and member UI never submits service without active entitlement",()=>{
 assert.match(sql,/mazi_services_catalogue_anon/);
 assert.match(sql,/for select to anon using \(is_active\)/);
 assert.match(sql,/member_user_id=\(select auth\.uid\(\)\)/);
 assert.match(member,/verified&&active&&available>=s\.tokens/);
 assert.match(actions,/await db\.auth\.getUser\(\)/);
 assert.match(actions,/mazi_services_request/);
 assert.match(actions,/mazi_services_cancel_request/);
 assert.match(admin,/mazi_is_administrator/);
 assert.match(sql,/reason_required/);
});

test("public catalogue displays only active service definitions, no member records",()=>{
 assert.match(homepage,/href="\\/services\\/catalogue"/);
 assert.match(publicCatalogue,/from\("mazi_service_catalog"\)/);
 assert.match(publicCatalogue,/eq\("is_active",true\)/);
 assert.doesNotMatch(publicCatalogue,/mazi_service_periods|mazi_service_requests|mazi_service_events/);
 assert.match(publicCatalogue,/μη οικονομική πιλοτική/);
});
