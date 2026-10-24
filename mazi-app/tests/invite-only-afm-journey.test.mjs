import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const form=read("../app/join/join-form.tsx");
const join=read("../app/join/page.tsx");
const login=read("../app/member-login/page.tsx");
const actions=read("../app/actions.ts");
const edge=read("../supabase/functions/mazi-member-api/index.ts");
const portal=read("../app/members/page.tsx");
const api=read("../../apps/web/src/app/api/mazi-interest/route.ts");
const back=read("../../apps/web/src/lib/mazi-interest-runtime.ts");
const privacy=read("../app/privacy/page.tsx");

test("MAZI public enrollment is AFM-first, not Supabase public signup",()=>{
 assert.match(join,/import JoinForm from "\.\/join-form"/);
 assert.match(join,/ένταξη γίνεται μόνο με πρόσκληση/);
 assert.doesNotMatch(join,/if\(user\)redirect\("\/members"\)/);
 assert.match(form,/normalizeGreekAfm/);
 assert.match(form,/operation:"lookup"/);
 assert.match(form,/operation:"submit"/);
 assert.match(form,/https:\/\/kontamou\.site\/api\/mazi-interest/);
 assert.match(form,/id="mazi-afm" name="afm"/);
 assert.match(form,/acceptProcessing,confirmAccuracy/);
});

test("existing-member login cannot create auth users or self-apply",()=>{
 assert.match(login,/emailSignIn/);
 assert.match(actions,/shouldCreateUser:false/);
 assert.doesNotMatch(actions,/shouldCreateUser:true/);
 assert.doesNotMatch(actions,/function applyForMembership|export async function applyForMembership/);
 assert.match(edge,/if\(operation==="apply"\)\{[\s\S]*?error:"invitation_only"/);
 assert.doesNotMatch(portal,/action=\{applyForMembership\}/);
 assert.match(portal,/ΠΡΟΣΚΛΗΣΗ ΑΠΑΡΑΙΤΗΤΗ/);
});

test("GEMI preview reveals only company identifiers, not public emails/phones",()=>{
 assert.match(api,/body\.operation==="lookup"/);
 assert.match(api,/consumeMaziLookupPreviewLimit/);
 assert.match(api,/resolveGemiCompanyByAfm/);
 assert.match(api,/legalName:registry\.legalName/);
 assert.doesNotMatch(api,/email:registry\.email|phone:registry\.phone/);
 assert.match(back,/mazi-afm-preview-network/);
});

test("server persists interest only after disclosure and independent lookups",()=>{
 assert.match(form,/setAcceptProcessing/);
 assert.match(form,/setConfirmAccuracy/);
 assert.match(back,/resolveGemiCompanyByAfm\(candidate\.afm\)/);
 assert.match(privacy,/Η αρχική εκδήλωση ενδιαφέροντος δεν δημιουργεί λογαριασμό/);
 assert.doesNotMatch(form,/auth\.signUp|signInWithOtp/);
});

test("auth gateway has no old enrolment mutation",()=>{
 const legacy=edge.indexOf('if(operation==="apply")');
 const followup=edge.indexOf('if(operation==="answer_followup")',legacy);
 assert.ok(legacy>=0&&followup>legacy);
 const operation=edge.slice(legacy,followup);
 assert.match(operation,/return out\(\{error:"invitation_only"\},403\)/);
 assert.doesNotMatch(operation,/insert\(/);
});
