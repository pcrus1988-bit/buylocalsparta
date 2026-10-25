import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const checklist=read("./mazi-release-checklist.ts");
const operations=read("./mazi-operations.ts");
const page=read("../app/admin/mazi/operations/page.tsx");
const action=read("../app/admin/mazi/operations/actions.ts");
const inventory=read("./mazi-retention-readiness.ts");
const legal=read("../../../../mazi-app/legal/MAZI-LEGAL-RETENTION-REVIEW-2026-10-25.md");
const auth=read("../../../../mazi-app/legal/MAZI-AUTH-DELIVERY-RELEASE-2026-10-25.md");

test("complete checklist and evidence reference required for human gate verification",()=>{
 for(const s of ["auth.smtp","auth.dns","auth.redirect","auth.otp","auth.delivery",
 "legal.retention","legal.deletion","legal.rights","legal.processors","legal.counsel"]){
  assert.ok(checklist.includes('id:"'+s+'"'),s);
 }
 assert.ok(checklist.includes("actual.size===required.length"));
 assert.ok(checklist.includes("reference.trim().length>=12"));
 assert.ok(operations.includes("validateMaziGateChecklist(gateKey,decision,checked,reference)"));
 assert.ok(operations.includes("MAZI_AUTH_CONFIGURATION_NOT_READY"));
 assert.ok(operations.includes("MAZI_REAL_BUSINESS_ADMISSION_NOT_VERIFIED"));
 assert.ok(operations.includes("MAZI_LAUNCH_GATE_REVIEW_INVALID"));
});

test("Super Admin form submits attested checklist without disabling legitimate reopening",()=>{
 assert.ok(page.includes('name="review_checks"'));
 assert.ok(page.includes('name="evidence_reference"'));
 assert.ok(page.includes("requiredMaziChecks(gateKey)"));
 assert.ok(action.includes('form.getAll("review_checks")'));
 assert.ok(action.includes('assertAdminCsrf(principal,field(form,"csrf"))'));
 assert.ok(action.includes("requireMarketplaceSuperAdminRole(principal)"));
 assert.ok(page.includes('name="decision" value="reopened"'));
});

test("retention report is live aggregate only, no automated deletion and drafts remain nonbinding",()=>{
 for(const s of ["mazi_interest_applications","mazi_invitations","mazi_chat_messages",
 "mazi_audit_events","mazi_members"]){assert.ok(inventory.includes(s),s);}
 assert.ok(inventory.includes("marketplaceMaziActor(principal)"));
 assert.ok(!/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.mazi_/i.test(inventory));
 assert.ok(page.includes("maziRetentionInventory(principal)"));
 assert.ok(page.includes("Προτάσεις προς νομική έγκριση"));
 assert.ok(legal.includes("NOT AN ADOPTED PRIVACY POLICY"));
 assert.ok(legal.includes("DSAR"));
 assert.ok(auth.includes("NOT VERIFIED"));
 assert.ok(auth.includes("Supabase Auth"));
});
