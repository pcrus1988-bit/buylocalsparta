import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("historical financial voting results are public only after finalization",()=>{
 const sql=load("sql/036_fund_public_historical_rounds.sql");
 assert.match(sql,/mazi_fund_public_vote_archive/);
 assert.match(sql,/mazi_fund_round_finalizations/);
 assert.match(sql,/c\.status='closed'/);
 assert.match(sql,/mazi_fund_public_vote_report_cycle\(p_slug text\)/);
 assert.match(sql,/c\.slug=p_slug/);
 assert.match(sql,/revoke all on function public\.mazi_fund_public_vote_archive\(\) from public,anon,authenticated/);
});
test("grant milestone publication requires actual accepted offer and immutable evidence",()=>{
 const sql=load("sql/037_fund_verified_project_progress.sql");
 assert.match(sql,/affirmatively_accepted is distinct from true/);
 assert.match(sql,/mazi_fund_project_updates_immutable/);
 assert.match(sql,/evidence_sha256/);
 assert.match(sql,/supersedes_id/);
 assert.match(sql,/mazi_fund_project_updates_single_correction/);
 assert.match(sql,/revoke all on public\.mazi_fund_project_updates from public,anon,authenticated,service_role/);
 assert.match(sql,/grant execute on function public\.mazi_fund_public_project_updates\(\) to service_role/);
 const publicReader=sql.slice(sql.indexOf("create or replace function public.mazi_fund_public_project_updates()"));
 assert.doesNotMatch(publicReader,/private_evidence_reference/);
});
test("Super Admin project review writes evidence, not a payment instruction",()=>{
 const admin=load("../apps/web/src/app/admin/mazi/fund/actions.ts");
 assert.match(admin,/export async function maziFundPublishProgress/);
 assert.match(admin,/marketplaceMaziActor\(principal\)/);
 assert.match(admin,/assertAdminCsrf\(principal/);
 assert.match(admin,/reviewed_progress_published/);
 assert.doesNotMatch(admin,/insert into public\.mazi_fund_ledger/);
});
test("project and archive public endpoints have strict fixed operation whitelists",()=>{
 const edge=load("supabase/functions/mazi-fund-public/index.ts");
 for(const token of ['"projects"','"archive"','"governance"'])
  assert.ok(edge.includes(token));
 assert.match(edge,/mazi_fund_public_project_updates/);
 assert.match(edge,/mazi_fund_public_vote_archive/);
 assert.match(edge,/url\.searchParams\.getAll\("cycle"\)\.length>1/);
 assert.doesNotMatch(edge,/from\("mazi_fund_project_updates"\)/);
});

test("marketplace Super Admin and MAZI must calculate identically",()=>{
 const mazi=load("lib/fund-allocation-policy.ts");
 const admin=load("../apps/web/src/lib/mazi-fund-allocation-policy.ts");
 assert.equal(admin,mazi,"Policy duplication must be byte-for-byte identical");
});
test("allocation dashboard refuses unverified funds and existing offers",()=>{
 const page=load("../apps/web/src/app/admin/mazi/fund/allocations/page.tsx");
 assert.match(page,/available===null/);
 assert.match(page,/alreadyCommitted/);
 assert.match(page,/c\.allocation_policy_version!==MAZI_FUND_ALLOCATION_VERSION/);
 assert.match(page,/previewFundAllocation/);
 assert.doesNotMatch(page,/\.query\(.*insert into public\.mazi_grant_award_offers/s);
 assert.doesNotMatch(page,/\.query\(.*update public\.mazi_fund_ledger/s);
});
