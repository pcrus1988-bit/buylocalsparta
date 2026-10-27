import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const form=read("../app/interest/interest-form.tsx");
const page=read("../app/interest/page.tsx");
const actions=read("../app/actions.ts");
const nav=read("../app/layout.tsx");
const existing=read("../app/join/page.tsx");
const marketplaceRoute=read("../../apps/web/src/app/api/mazi-interest/route.ts");
const securityConfig=read("../next.config.ts");

test("first contact is an actual marketplace AFM/GEMI intake, not new Auth registration",()=>{
 assert.match(form,/https:\/\/kontamou\.site\/api\/mazi-interest/);
 assert.match(form,/normalizeGreekAfm\(afm\)/);
 assert.match(form,/"X-BLS-Visitor"/);
 assert.match(form,/credentials:"omit"/);
 assert.match(form,/method:"POST"/);
 assert.match(marketplaceRoute,/await saveMaziInterest/);
 assert.doesNotMatch(form,/auth\.signInWithOtp|auth\.signUp|supabase\.auth/);
});
test("browser CSP permits the exact external intake API origin",()=>{
 const endpoint=form.match(/const ENDPOINT="([^"]+)"/)?.[1];
 assert.ok(endpoint, "interest form must expose an intake endpoint");
 const permittedOrigins=securityConfig.match(/connect-src ([^;]+);/)?.[1]?.split(/\s+/);
 assert.ok(permittedOrigins, "explicit connect-src is required");
 assert.ok(permittedOrigins.includes(new URL(endpoint).origin), "CSP must permit the actual intake origin");
 assert.ok(!permittedOrigins.includes("*")&&!permittedOrigins.includes("https:"), "do not weaken CSP with wildcard schemes");
 assert.match(marketplaceRoute,/Access-Control-Allow-Origin/);
});
test("privacy and representation require separate, affirmative confirmation",()=>{
 assert.match(form,/name="acceptProcessing" required/);
 assert.match(form,/name="confirmAccuracy" required/);
 assert.match(form,/acceptProcessing:true,confirmAccuracy:true/);
 assert.match(form,/companyWebsiteCheck/);
 assert.match(form,/res\.status===202/);
 assert.match(form,/Η αίτηση δεν αποτελεί έγκριση ή πρόσκληση/);
});
test("public email links do not create unknown Supabase Auth users",()=>{
 assert.match(actions,/MAZI_AUTH_BRIDGE_SECRET/);
 assert.match(actions,/createHmac\("sha256",secret\)/);
 assert.doesNotMatch(actions,/auth\.signUp\(/);
 assert.doesNotMatch(actions,/auth\.signInWithOtp\(/);
 assert.match(existing,/ήδη καταχωρισμένους λογαριασμούς/);
});
test("public website leads applicants to verified interest; existing login stays available",()=>{
 assert.match(nav,/href="\/interest"/);
 assert.match(nav,/href="\/join"/);
 assert.match(page,/Μόνο μετά από έγκριση/i);
});
