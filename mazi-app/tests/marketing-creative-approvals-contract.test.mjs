import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("creative invitations cannot act as ads, funds or mutable approvals",()=>{
 const s=read("sql/035_marketing_creative_approvals.sql");
 assert.match(s,/creative-preview-v1/);
 assert.match(s,/unique\(brief_id,member_user_id\)/);
 assert.match(s,/for select to authenticated using \(member_user_id=\(select auth.uid\(\)\)\)/);
 assert.match(s,/MAZI_MARKETING_CREATIVE_IMMUTABLE/);
 assert.match(s,/MAZI_MARKETING_CREATIVE_AUDIT_APPEND_ONLY/);
 assert.match(s,/old.status='approved' and new.status='withdrawn'/);
 assert.doesNotMatch(s,/\bstatus in \('pending','approved','active'\)/);
});
test("member review action requires own verified login, only allowed status",()=>{
 const s=read("app/dashboard/marketing/actions.ts");
 assert.match(s,/respondCreativeInvitation/);
 assert.match(s,/getUser\(\)/);
 assert.match(s,/\["approved","declined","withdrawn"\]/);
 assert.match(s,/mazi_marketing_creative_invitations/);
 assert.doesNotMatch(s,/service_role|api_key|fetch\(.*facebook/);
});
test("admin must verify persisted super admin and member opt in",()=>{
 const s=read("../apps/web/src/lib/mazi-marketing-admin.ts");
 const a=read("../apps/web/src/app/admin/mazi/marketing/actions.ts");
 assert.match(s,/marketplaceMaziActor/);
 assert.match(s,/wants_collective_campaigns/);
 assert.match(s,/identity_verified_at/);
 assert.match(a,/assertAdminCsrf/);
 assert.match(a,/issueCreativeInvitationAction/);
});
