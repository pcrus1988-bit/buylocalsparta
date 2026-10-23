import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const schema=src("../sql/013_grant_policy_notice_and_first_support.sql");
const edge=src("../supabase/functions/mazi-member-api/index.ts");
const ui=src("../app/proposals/page.tsx");
const actions=src("../app/actions.ts");

test("policy notice must be acknowledged at UI, server action and Edge gateway",()=>{
 assert.match(ui,/name="grant_terms_acknowledged" type="checkbox" required/);
 assert.match(ui,/πριν ζητήσει οποιαδήποτε εκταμίευση/);
 assert.match(actions,/form\.get\("grant_terms_acknowledged"\)!=="on"/);
 assert.match(actions,/grant_policy_version:"mazi-grant-retention-v1"/);
 assert.match(edge,/input\.acknowledge_grant_terms!==true/);
 assert.match(edge,/input\.grant_policy_version!=="mazi-grant-retention-v1"/);
 assert.match(edge,/grant_policy_acknowledged_at:new Date\(\)\.toISOString\(\)/);
});

test("Postgres requires and freezes acknowledgment evidence",()=>{
 assert.match(schema,/mazi_proposal_grant_policy_notice_required/);
 assert.match(schema,/grant_policy_ack_version = 'mazi-grant-retention-v1'/);
 assert.match(schema,/grant_policy_acknowledged_at IS NOT NULL/);
 assert.match(schema,/CREATE TRIGGER mazi_proposal_disclosure_immutable/);
 assert.match(schema,/first_time_support_request IS DISTINCT FROM OLD\.first_time_support_request/);
});

test("first-time priority is only for financial support requests, and server assigned",()=>{
 assert.match(schema,/c\.kind = 'fund_allocation'/);
 assert.match(schema,/previous\.kind = 'fund_allocation'/);
 assert.match(schema,/NEW\.first_time_support_request := funding_round AND NOT EXISTS/);
 const admin=src("../../apps/web/src/lib/mazi-superadmin.ts");
 const panel=src("../../apps/web/src/app/admin/mazi/page.tsx");
 assert.match(admin,/order by first_time_support_request desc,created_at asc/);
 assert.match(panel,/ΠΡΟΤΕΡΑΙΟΤΗΤΑ · ΠΡΩΤΗ ΑΙΤΗΣΗ ΕΝΙΣΧΥΣΗΣ/);
});

test("no new browser Data API grants and no finance activation",()=>{
 assert.match(schema,/REVOKE ALL PRIVILEGES ON TABLE public\.mazi_proposals FROM anon, authenticated/);
 assert.doesNotMatch(schema,/\b(?:UPDATE|INSERT)\s+public\.mazi_fund_ledger\b/i);
 assert.doesNotMatch(schema,/\bfinance_activated\s*=\s*true\b/i);
});
