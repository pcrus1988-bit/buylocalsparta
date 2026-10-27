import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const text=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const api=text("../app/api/mazi-auth-email/route.ts");
const sender=text("./mazi-passwordless-resend.ts");
const invitation=text("./mazi-invitation-admin.ts");
const migration=text("../../../../mazi-app/sql/027_passwordless_mail_rate_limit.sql");

test("public email relay uses constant-time authenticated MAC, narrow window and indistinguishable replies",()=>{
 assert.ok(api.includes('createHmac("sha256",configured)'));
 assert.ok(api.includes("timingSafeEqual(expected,received)"));
 assert.ok(api.includes("MAZI_AUTH_BRIDGE_SECRET"));
 assert.ok(api.includes('Math.abs(Date.now()-ts)>120000'));
 assert.ok(api.includes('return fixedResponse(202)'));
 assert.ok(!api.includes("serviceKey"));
});
test("only confirmed approved or verified existing accounts can receive magic link through Resend",()=>{
 assert.ok(sender.includes("auth.users"));
 assert.ok(sender.includes("u.email_confirmed_at IS NOT NULL"));
 assert.ok(sender.includes("a.status='approved_pending_invite'"));
 assert.ok(sender.includes("m.status='verified'"));
 assert.ok(sender.includes('type:"magiclink"'));
 assert.ok(sender.includes('loginUrl.searchParams.set("token_hash",token)'));
 assert.ok(sender.includes('loginUrl.searchParams.set("type","magiclink")'));
 assert.ok(sender.includes("https://api.resend.com/emails"));
 assert.ok(!sender.includes("localhost:3000"));
 assert.ok(invitation.includes('type=existing?"magiclink":"invite"'));
 assert.ok(invitation.includes('callback.searchParams.set("type",type)'));
 assert.ok(invitation.includes('RESEND_API_KEY'));
});
test("database throttle remains private with no email/token at rest",()=>{
 assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
 assert.ok(migration.includes("REVOKE ALL"));
 assert.ok(migration.includes("recipient_digest"));
 assert.ok(!migration.includes("recipient_email"));
 assert.ok(!migration.includes("access_token"));
 assert.ok(sender.includes("COOLDOWN_SECONDS=180"));
 assert.ok(sender.includes("pg_advisory_xact_lock"));
});
