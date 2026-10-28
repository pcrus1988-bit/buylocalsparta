import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(join(root,p),"utf8");
const report=read("sql/034_service_operations_reconciliation.sql");
const edge=read("supabase/functions/mazi-service-api/index.ts");
const admin=read("app/admin/services/page.tsx");
const ops=read("app/admin/services/operations/page.tsx");

test("all-history report uses complete database tables rather than truncated recent UI batches",()=>{
 assert.match(report,/from public.mazi_service_periods p/);
 assert.match(report,/left join public.mazi_service_requests r on r.period_id=p.id/);
 assert.match(report,/from public.mazi_service_requests r/);
 assert.match(report,/from public.mazi_service_events/);
 assert.match(report,/from public.mazi_service_order_acceptances/);
 assert.match(report,/from public.mazi_service_messages/);
 assert.match(report,/from \(select \* from period_usage order by starts_at desc limit 30\) p/);
 assert.match(ops,/όλα τα σύνολα παραπάνω υπολογίζονται από το πλήρες μητρώο/);
});
test("period math distinguishes committed, reserved, consumed, expired and future",()=>{
 for(const status of ["'requested'","'accepted'","'in_progress'","'completed'"]) assert.ok(report.includes(status));
 for(const column of ["issued_tokens","committed_tokens","reserved_tokens","completed_tokens","available_active_tokens","expired_unused_tokens","future_allocated_tokens","overdrawn_periods"])assert.ok(report.includes(column));
 assert.match(report,/greatest\(allowance_tokens-committed,0\)/);
 assert.match(report,/ends_at<=clock_timestamp\(\)/);
 assert.match(report,/starts_at>clock_timestamp\(\)/);
 assert.match(report,/ledger_difference_tokens/);
 assert.match(report,/\(-l.event_delta\)-p.committed_tokens/);
});
test("only verified administrators can read the financial report, without broad schema grants",()=>{
 assert.match(report,/security invoker/);
 assert.match(report,/not exists\(\s*select 1 from public.mazi_administrators where user_id=p_actor/);
 assert.match(report,/revoke all on function public.mazi_services_internal_admin_health\(uuid\) from public,anon,authenticated/);
 assert.match(report,/grant execute on function public.mazi_services_internal_admin_health\(uuid\) to service_role/);
 assert.doesNotMatch(report,/grant usage on schema public to (anon|authenticated)/);
 assert.match(edge,/if\(!await isAdmin\(user.id\)\)/);
 assert.match(edge,/operation==="admin_health"/);
 assert.match(edge,/admin.rpc\("mazi_services_internal_admin_health",\{p_actor:user.id\}\)/);
 assert.match(ops,/maziServiceRequest<\{report:Report\}>\("admin_health"\)/);
});
test("ops readiness is distinct from money, VAT or automatically verified payment",()=>{
 for(const state of ["legal_approved","accounting_approved","payment_verified","paid_enabled"])assert.ok(ops.includes(state));
 assert.match(ops,/Μονάδα μέτρησης: Tokens, όχι ευρώ ταμείου/);
 assert.match(ops,/δεν επιβεβαιώνει την είσπραξη της συνδρομής/);
 assert.match(admin,/href="\/admin\/services\/operations"/);
});
test("operational warnings cover old requests, incomplete contracts and missing delivery proof",()=>{
 for(const flag of ["waiting_over_48_hours","open_over_14_days","missing_order_acceptances","completed_without_delivery","revisions_in_progress"])assert.ok(report.includes(flag));
 assert.match(report,/kind='delivery'/);
 assert.match(ops,/χωρίς παραδοτέο/);
});
