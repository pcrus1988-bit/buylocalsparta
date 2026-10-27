import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const fromRoot=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const action=fromRoot("../app/actions.ts");
const backend=fromRoot("../../apps/web/src/app/api/mazi-auth-email/route.ts");
const delivery=fromRoot("../../apps/web/src/lib/mazi-passwordless-resend.ts");
const callback=fromRoot("../app/auth/callback/route.ts");
const invitation=fromRoot("../../apps/web/src/lib/mazi-invitation-admin.ts");

test("MAZI public login uses authenticated server relay, not broken hosted redirect",()=>{
 assert.ok(action.includes('createHmac("sha256",secret)'));
 assert.ok(action.includes("MAZI_AUTH_BRIDGE_SECRET"));
 assert.ok(action.includes("https://kontamou.site/api/mazi-auth-email"));
 assert.ok(!action.includes("signInWithOtp("));
 assert.ok(backend.includes('timingSafeEqual(expected,received)'));
 assert.ok(backend.includes("120000"));
 assert.ok(backend.includes("sendMaziExistingAccountResendLogin(email)"));
 assert.ok(backend.includes('return fixedResponse(202)'));
});

test("passwordless flow never creates or authorizes unapproved accounts and cannot spam",()=>{
 assert.ok(delivery.includes("auth.users"));
 assert.ok(delivery.includes("u.email_confirmed_at IS NOT NULL"));
 assert.ok(delivery.includes("a.status='approved_pending_invite'"));
 assert.ok(delivery.includes("m.status='verified'"));
 assert.ok(delivery.includes("pg_advisory_xact_lock"));
 assert.ok(delivery.includes("COOLDOWN_SECONDS=180"));
 assert.ok(delivery.includes("Number(recent.rows[0]?.daily??\"0\")>=5"));
 assert.ok(delivery.includes('type:"magiclink"'));
 assert.ok(!delivery.includes("auth/v1/otp"));
});

test("Resend email points directly at safe production callback, bypassing localhost",()=>{
 assert.ok(delivery.includes('FIXED_MAZI_CALLBACK="https://mazi.kontamou.site/auth/callback"'));
 assert.ok(delivery.includes('loginUrl.searchParams.set("token_hash",token)'));
 assert.ok(delivery.includes('loginUrl.searchParams.set("type","magiclink")'));
 assert.ok(delivery.includes("https://api.resend.com/emails"));
 assert.ok(delivery.includes("RESEND_API_KEY"));
 assert.ok(!delivery.includes("localhost:3000"));
 assert.ok(callback.includes('db.auth.verifyOtp({ token_hash: hash, type })'));
 assert.ok(invitation.includes('type=existing?"magiclink":"invite"'));
 assert.ok(invitation.includes("resend_invite_new"));
});


test("failed provider stages are auditable without exposing account or token data",()=>{
 assert.ok(delivery.includes('let deliveryStage:"auth_generate"|"auth_payload"|"resend_send"'));
 assert.ok(delivery.includes('upstreamStatus=auth.status'));
 assert.ok(delivery.includes('upstreamStatus=delivery.status'));
 assert.ok(delivery.includes('stage:deliveryStage,http_status:upstreamStatus||null'));
 assert.ok(!delivery.includes('console.warn(email'));
 assert.ok(!delivery.includes('console.warn(token'));
 assert.ok(!delivery.includes('console.warn(raw'));
});
