import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const lib=read("./mazi-auth-probe.ts");
const action=read("../app/admin/mazi/operations/actions.ts");
const page=read("../app/admin/mazi/operations/page.tsx");
const migration=read("../../../../mazi-app/sql/026_auth_delivery_probes.sql");

test("one existing and email-confirmed approved business recipient only",()=>{
 assert.ok(lib.includes("JOIN auth.users"));
 assert.ok(lib.includes("u.email_confirmed_at IS NOT NULL"));
 assert.ok(lib.includes("a.status='approved_pending_invite'"));
 assert.ok(lib.includes("a.business_contact_verified_at IS NOT NULL"));
 assert.ok(lib.includes("sendMaziExistingAccountResendLogin(recipient)"));
 assert.ok(!lib.includes("signUp("));
 assert.ok(!lib.includes('"/auth/v1/invite"'));
 assert.ok(lib.includes("marketplaceMaziActor(principal)"));
});

test("Supabase Auth probe is real, rate-limited, and cannot confer membership",()=>{
 assert.ok(lib.includes("15 minutes"));
 assert.ok(lib.includes("pg_advisory_xact_lock"));
 assert.ok(lib.includes("sendMaziExistingAccountResendLogin(recipient)"));
 assert.ok(!lib.includes('"/auth/v1/otp"'));

 assert.ok(lib.includes("provider_accepted"));
 assert.ok(lib.includes("request_unavailable"));
 assert.ok(!lib.includes("UPDATE public.mazi_launch_gate_reviews"));
 assert.ok(!lib.includes("INSERT INTO public.mazi_invitations"));
 assert.ok(action.includes("requireMarketplaceSuperAdminRole(principal)"));
 assert.ok(action.includes('assertAdminCsrf(principal,field(form,"csrf"))'));
 assert.ok(action.includes('form.get("recipient_has_consented")'));
});

test("probe evidence table and admin UI keep secrets out of logs",()=>{
 assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
 assert.ok(migration.includes("REVOKE ALL ON TABLE public.mazi_auth_delivery_probes"));
 assert.ok(!migration.includes("recipient_email"));
 assert.ok(!migration.includes("access_token"));
 assert.ok(page.includes("getMaziAuthEmailProbes"));
 assert.ok(page.includes("Δοκιμαστική αποστολή μέσω Supabase Auth"));
 assert.ok(page.includes("όχι επιβεβαιωμένη παράδοση"));
 assert.ok(page.includes("recipient_has_consented"));
 assert.ok(!lib.includes("console.log(recipient)"));
});
