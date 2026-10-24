import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const aggregate=read("../../apps/web/src/lib/mazi-operations.ts");
const page=read("../../apps/web/src/app/admin/mazi/operations/page.tsx");
const governance=read("../../apps/web/src/app/admin/mazi/page.tsx");
const review=read("../../apps/web/src/app/admin/mazi/interest/page.tsx");

test("MAZI operations are available only to verified marketplace Super Admin",()=>{
 assert.match(aggregate,/await marketplaceMaziActor\(principal\)/);
 assert.match(page,/getAdminSession\(\)/);
 assert.match(page,/isMaziSuperAdmin\(principal\)/);
 assert.match(page,/maziOperationsSnapshot\(principal\)/);
 assert.match(page,/if\(!state\)/);
 assert.doesNotMatch(aggregate,/service_role|NEXT_PUBLIC_|createClient/);
});

test("read-only aggregate query cannot expose applicants' identifiers or write records",()=>{
 assert.match(aggregate,/count\(\*\)::int FROM public\.mazi_interest_applications/);
 assert.match(aggregate,/count\(\*\)::int FROM public\.mazi_invitations/);
 assert.match(aggregate,/count\(\*\)::int FROM public\.mazi_invitation_acceptances/);
 assert.match(aggregate,/count\(\*\)::int FROM public\.mazi_fund_ledger/);
 assert.match(aggregate,/count\(\*\)::int FROM public\.mazi_grant_award_offers/);
 assert.match(aggregate,/getAdminPostgresRuntime\(\)\.nativePool\.query/);
 assert.doesNotMatch(aggregate,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(?:INTO|FROM|TABLE|FUNCTION|public\.)/i);
 assert.doesNotMatch(aggregate,/SELECT\s+.*(?:tax_number|contact_email|representative_name)/i);
 assert.doesNotMatch(page,/<form\s+action=/);
});

test("monitor flags delivery ambiguity and stale registry reviews rather than retrying",()=>{
 assert.match(aggregate,/status='pending_delivery' AND issued_at < now\(\)-interval '10 minutes'/);
 assert.match(aggregate,/status='delivery_failed'/);
 assert.match(aggregate,/status='email_sent' AND expires_at<=now\(\)/);
 assert.match(aggregate,/registry_checked_at < now\(\)-interval '7 days'/);
 assert.match(page,/invitations_delivery_unconfirmed/);
 assert.match(page,/invitations_delivery_failed/);
 assert.match(page,/invitations_expired_unconsumed/);
 assert.match(page,/interest_registry_stale/);
 assert.match(page,/state\.acceptances===state\.invitations_consumed/);
});

test("financial lock checks fund rows, grant offers and every activated cycle",()=>{
 assert.match(aggregate,/finance_activated OR funding_budget_cents<>0/);
 assert.match(aggregate,/slug='founding-needs-2026' AND kind='needs_assessment' AND NOT finance_activated AND funding_budget_cents=0/);
 assert.match(page,/state\.finance_enabled_cycles===0&&state\.ledger_total===0&&/);
 assert.match(page,/state\.grant_offers_total===0&&state\.safe_founding_cycles===1/);
 assert.match(page,/ΑΠΑΙΤΕΙΤΑΙ ΑΜΕΣΟΣ ΕΛΕΓΧΟΣ/);
});

test("the operations view is navigable, safe on database failure, and external gates remain unverified",()=>{
 assert.match(governance,/href="\/admin\/mazi\/operations"/);
 assert.match(review,/href="\/admin\/mazi\/operations"/);
 assert.match(page,/dynamic="force-dynamic"/);
 assert.match(page,/Δεν εμφανίζουμε προγενέστερα ή δοκιμαστικά νούμερα/);
 assert.match(page,/ΑΝΕΠΙΒΕΒΑΙΩΤΟ/);
 assert.doesNotMatch(page,/count=\{0\}/);
 assert.match(page,/Δεν υπάρχουν αυτόματες επαναποστολές/);
});
