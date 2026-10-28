import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const aggregate=read("../../apps/web/src/lib/mazi-operations.ts");
const page=read("../../apps/web/src/app/admin/mazi/operations/page.tsx");
const governance=read("../../apps/web/src/app/admin/mazi/page.tsx");
const action=read("../../apps/web/src/app/admin/mazi/operations/actions.ts");
const sql=read("../sql/018_superadmin_release_gate_reviews.sql");
const readiness=read("../../apps/web/src/lib/mazi-readiness.ts");
const readOnlySnapshot=aggregate.slice(0,aggregate.indexOf("/** Each verification"));
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
 assert.doesNotMatch(readOnlySnapshot,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(?:INTO|FROM|TABLE|FUNCTION|public\.)/i);
 assert.doesNotMatch(aggregate,/SELECT\s+.*(?:tax_number|contact_email|representative_name)/i);
 assert.match(page,/<form action=\{reviewMaziLaunchGateAction\}/);
});

test("monitor flags delivery ambiguity and stale registry reviews rather than retrying",()=>{
 assert.match(aggregate,/status='pending_delivery' AND issued_at < now\(\)-interval '10 minutes'/);
 assert.match(aggregate,/status='delivery_failed'/);
 assert.match(aggregate,/status='email_sent' AND expires_at<=now\(\)/);
 assert.match(aggregate,/COALESCE\(\(SELECT checked_at FROM public\.mazi_interest_registry_rechecks/);
 assert.match(aggregate,/a\.registry_checked_at\) < now\(\)-interval '7 days'/);
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
 assert.match(page,/ΕΚΚΡΕΜΕΙ ΕΠΑΛΗΘΕΥΣΗ/);
 assert.doesNotMatch(page,/count=\{0\}/);
 assert.match(page,/Δεν υπάρχουν αυτόματες επαναποστολές/);
});

test("manual release gates record immutable authorization and never launch money or enrollment",()=>{
 assert.match(sql,/CREATE TABLE public\.mazi_launch_gate_reviews/);
 assert.match(sql,/ALTER TABLE public\.mazi_launch_gate_reviews ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_launch_gate_reviews FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/MAZI_LAUNCH_GATE_REVIEW_IMMUTABLE/);
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public\.mazi_launch_gate_reviews/);
 assert.match(aggregate,/await marketplaceMaziActor\(principal\)/);
 assert.match(aggregate,/INSERT INTO public\.mazi_launch_gate_reviews/);
 assert.match(aggregate,/allowedGateKeys\.has\(gateKey as MaziLaunchGateKey\)/);
 assert.match(action,/requireMarketplaceSuperAdminRole\(principal\)/);
 assert.match(action,/assertAdminCsrf\(principal/);
 assert.match(action,/form\.get\("affirmed"\)!=="on"/);
 assert.match(page,/name="gate_key" value=\{gateKey\}/);
 assert.match(page,/name="evidence" required minLength=\{40\} maxLength=\{700\}/);
 assert.match(page,/name="decision" value="verified"/);
 assert.match(page,/name="decision" value="reopened"/);
 assert.match(page,/Δεν ενεργοποιήθηκε υπηρεσία ή πληρωμή/);
 assert.doesNotMatch(sql,/UPDATE public\.mazi_(?:members|cycles|fund_ledger|grant_award_offers)/);
});

test("release readiness needs real checks, intact admission and locked financial records",()=>{
 assert.match(readiness,/assessMaziReleaseReadiness\(/);
 assert.match(readiness,/state\.finance_enabled_cycles===0&&state\.ledger_total===0&&/);
 assert.match(readiness,/state\.grant_offers_total===0&&state\.safe_founding_cycles===1/);
 assert.match(readiness,/state\.acceptances===state\.invitations_consumed/);
 assert.match(readiness,/invitations_delivery_unconfirmed\+/);
 assert.match(readiness,/invitations_delivery_failed\+state\.invitations_expired_unconsumed/);
 assert.match(readiness,/auth_email_delivery.*legal_and_retention.*consenting_business_e2e/s);
 assert.match(readiness,/manualReleaseStillRequired:true/);
 assert.match(page,/assessment\.prerequisitesRecorded/);
 assert.match(page,/απαιτεί ξεχωριστή έγκριση/);
 assert.match(page,/assessment\.blockers\.map/);
 assert.doesNotMatch(readiness,/UPDATE public\.|INSERT INTO public\.|fetch\(|\.post\(/);
});

test("immutable release history is only read following persisted Super Admin authorization",()=>{
 assert.match(aggregate,/export async function maziLaunchGateHistory/);
 assert.match(aggregate,/ORDER BY recorded_at DESC,id DESC LIMIT 30/);
 assert.match(aggregate,/SELECT id::text,gate_key,decision,evidence,recorded_at/);
 assert.match(page,/maziLaunchGateHistory\(principal\)/);
 assert.match(page,/gateHistory\.map\(item=>/);
 assert.match(page,/item\.evidence/);
 assert.match(page,/Δεν υπάρχουν ακόμη βεβαιώσεις/);
 assert.match(page,/Μην καταχωρίζετε προσωπικά δεδομένα/);
 assert.doesNotMatch(page,/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
