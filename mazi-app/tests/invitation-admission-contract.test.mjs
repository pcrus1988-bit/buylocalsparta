import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=read("../sql/016_verified_single_use_invitations.sql");
const edge=read("../supabase/functions/mazi-member-api/index.ts");
const admin=read("../../apps/web/src/lib/mazi-invitation-admin.ts");
const action=read("../../apps/web/src/app/admin/mazi/interest/actions.ts");
const review=read("../../apps/web/src/app/admin/mazi/interest/page.tsx");
const callback=read("../app/auth/callback/route.ts");
const onboard=read("../app/onboarding/page.tsx");
const members=read("../app/members/page.tsx");
const signIn=read("../app/actions.ts");

test("no ordinary Auth account can apply for membership without a reviewed invitation",()=>{
 assert.match(edge,/if\(operation==="apply"\)return out\(\{error:"invitation_required"\},403\)/);
 assert.doesNotMatch(members,/action=\{applyForMembership\}/);
 assert.doesNotMatch(signIn,/export async function applyForMembership/);
 assert.match(members,/redirect\("\/onboarding"\)/);
});

test("invitation is delivered only by the existing verified Super Admin to verified contact",()=>{
 assert.match(admin,/await marketplaceMaziActor\(principal\)/);
 assert.match(admin,/approved_pending_invite/);
 assert.match(admin,/registry_lookup_status!=="matched"/);
 assert.match(admin,/!app\.representation_verified_at\|\|!app\.business_contact_verified_at/);
 assert.match(admin,/MAZI_SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(admin,/url!==AUTH_PROJECT_URL/);
 assert.ok(admin.includes("/auth/v1/admin/generate_link"));
 assert.ok(admin.includes("https://api.resend.com/emails"));
 assert.match(action,/assertAdminCsrf\(principal/);
 assert.match(review,/action=\{issueMaziInvitationAction\}/);
 assert.match(review,/!latest/);
});

test("single-use and legal-entity uniqueness are guarded within PostgreSQL transaction",()=>{
 assert.match(sql,/CREATE UNIQUE INDEX mazi_one_live_invite_per_business/);
 assert.match(sql,/WHERE status IN \('pending_delivery','email_sent'\)/);
 assert.match(sql,/FOR UPDATE OF i,a/);
 assert.match(sql,/email_confirmed_at IS NULL/);
 assert.match(sql,/lower\(btrim\(v_auth\.email\)\)<>v\.recipient_email/);
 assert.match(sql,/left\(m\.gemi_number,9\)=left\(v\.gemi_number,9\)/);
 assert.match(sql,/CREATE TABLE public\.mazi_invitation_acceptances/);
 assert.match(sql,/MAZI_INVITATION_ACCEPTANCE_IMMUTABLE/);
 assert.match(sql,/UPDATE public\.mazi_invitations\s+SET status='consumed'/);
});

test("RPC cannot be called directly by browsers and fund remains untouched",()=>{
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.mazi_complete_invitation\(uuid,uuid,text,boolean,boolean\)\s+FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.mazi_complete_invitation\(uuid,uuid,text,boolean,boolean\)\s+TO service_role/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_invitations FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/voting_eligible[\s\S]*?false/);
 assert.doesNotMatch(sql,/INSERT INTO public\.mazi_fund_ledger|UPDATE public\.mazi_cycles|finance_activated\s*=\s*true/i);
});

test("JWT verified by Edge, acceptance is explicit and versioned",()=>{
 assert.match(edge,/admin\.auth\.getUser\(match\[1\]\)/);
 assert.match(edge,/if\(operation==="invitation_state"\)/);
 assert.match(edge,/\.eq\("recipient_email",recipient\)/);
 assert.doesNotMatch(edge,/\.eq\("contact_email",/);
 assert.match(edge,/if\(operation==="accept_invitation"\)/);
 assert.match(edge,/admin\.rpc\("mazi_complete_invitation"/);
 assert.match(onboard,/name="accept_charter" required/);
 assert.match(onboard,/name="accept_processing" required/);
 assert.match(signIn,/acceptMaziInvitation/);
 assert.match(callback,/type === "invite"/);
});

test("public privacy notice discloses AFM/GEMI verification, invite records and nonmarketing purpose",()=>{
 const route=read("../app/privacy/page.tsx");
 assert.match(route,/LegalView slug="privacy"/);
 const notice=read("../lib/legal/v3-data.ts");
 assert.match(notice,/ΑΦΜ/);
 assert.match(notice,/ΓΕΜΗ/);
 assert.match(notice,/Supabase Authentication/);
 assert.match(notice,/ταυτοποιητικά πρόσκλησης/);
 assert.match(notice,/διεύθυνση IP/);
 assert.match(notice,/δεν αποτελούν από μόνα τους συγκατάθεση/);
});

test("ambiguous invite delivery never silently retries and revocation is documented",()=>{
 assert.match(admin,/MAZI_INVITATION_PROVIDER_RECONCILIATION_REQUIRED/);
 assert.match(admin,/export async function revokeMaziInvitation/);
 assert.match(admin,/MAZI_INVITATION_NOT_REVOCABLE/);
 assert.match(admin,/UPDATE public\.mazi_invitations SET status='revoked'/);
 assert.match(action,/form\.get\("provider_reconciled"\)==="on"/);
 assert.match(action,/form\.get\("confirm_revocation"\)!=="on"/);
 assert.match(review,/name="reconciliation_reason"/);
 assert.match(review,/name="revocation_reason"/);
 assert.match(sql,/OLD\.status='email_sent' AND NEW\.status IN \('consumed','revoked'\)/);
});

test("invitation expiry is capped below Supabase Auth's default one-hour invite link",()=>{
 const expiry=read("../sql/017_invitation_expiry_shorter_than_auth.sql");
 assert.match(expiry,/expires_at <= issued_at \+ interval '45 minutes'/);
 assert.match(admin,/now\(\)\+interval '45 minutes'/);
 assert.doesNotMatch(admin,/now\(\)\+interval '24 hours'/);
});

test("confirmed existing Auth accounts receive magic links through Resend, never re-invitations",()=>{
 assert.match(admin,/email_confirmed_at IS NOT NULL/);
 assert.match(admin,/const type=existing\?"magiclink":"invite"/);
 assert.match(admin,/callback\.searchParams\.set\("token_hash",hash\)/);
 assert.match(admin,/callback\.searchParams\.set\("type",type\)/);
 assert.ok(admin.includes("https://api.resend.com/emails"));
 assert.match(admin,/providerMethod=await sendVerifiedAuthInvitation/);
 assert.doesNotMatch(admin,/create_user:true/);
});

test("onboarding admission guard does not depend on cycle, ledger, voting or dashboard loading",()=>{
 assert.match(edge,/if\(operation==="admission_status"\)/);
 assert.match(onboard,/maziMemberRequest<\{has_existing_application:boolean;already_member:boolean\}>\("admission_status"\)/);
 assert.doesNotMatch(onboard,/maziMemberRequest<MaziState>\("state"\)/);
 const section=edge.slice(edge.indexOf('if(operation==="admission_status")'),edge.indexOf('if(operation==="invitation_state")'));
 assert.match(section,/eq\("applicant_user_id",user.id\)/);
 assert.match(section,/eq\("user_id",user.id\)/);
 assert.doesNotMatch(section,/currentCycle|mazi_grant_award_offers|mazi_proposals|mazi_fund_ledger/);
});

test("production invite issuance is held until verified Auth, legal and zero-funded checks",()=>{
 assert.match(admin,/MAZI_INVITATION_RELEASE_NOT_VERIFIED/);
 assert.match(admin,/MAZI_FINANCIAL_LOCK_NOT_VERIFIED/);
 assert.match(admin,/SELECT decision FROM public\.mazi_launch_gate_reviews/);
 assert.match(admin,/ORDER BY r\.recorded_at DESC,r\.id DESC LIMIT 1/);
 assert.match(admin,/auth_email_delivery/);
 assert.match(admin,/legal_and_retention/);
 assert.match(admin,/NOT finance_activated AND funding_budget_cents=0/);
 assert.match(admin,/public\.mazi_fund_ledger/);
 assert.match(admin,/public\.mazi_grant_award_offers/);
 assert.doesNotMatch(admin,/required\(gate_key\)[\s\S]*consenting_business_e2e/);
});
