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
 assert.match(admin,/auth\/v1\/invite/);
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
