import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const srv=read("./mazi-processor-reviews.ts");
const sql=read("../../../../mazi-app/sql/mazi_processor_reviews_20261029.sql");
const page=read("../app/admin/mazi/processors/page.tsx");
const actions=read("../app/admin/mazi/processors/actions.ts");
const gate=read("./mazi-operations.ts");
const operations=read("../app/admin/mazi/operations/page.tsx");
const invitations=read("./mazi-invitation-admin.ts");
const retention=read("./mazi-retention-reviews.ts");
test("seven processor domains are documented with latest evidence",()=>{
 for(const key of ["hosting_runtime","database_auth_storage","transactional_email",
 "observability_analytics","payment_financial","third_party_integrations","backups_exports"]){
  assert.ok(srv.includes('key:"'+key+'"'),key);
 }
 assert.match(srv,/MAZI_PROCESSOR_DOMAINS\.every/);
 assert.match(srv,/r\.review_state==="evidence_recorded"/);
 assert.match(srv,/!c\.required\|\|r\.usage_state==="in_use"/);
 assert.match(srv,/input\.checks\.length===expected\.size/);
 assert.match(srv,/input\.checks\.length===1&&input\.checks\[0\]==="not_used_verified"/);
 assert.match(srv,/input\.transfer==="not_assessed"\|\|input\.transfer==="not_applicable"/);
 assert.match(srv,/input.domainKey==="database_auth_storage"&&input.transfer==="eea_only_verified"/);
 assert.match(sql,/domain_key <> 'database_auth_storage'/);
 assert.match(sql,/transfer_mechanism NOT IN \('not_assessed','not_applicable'\)/);
});
test("processor records are private and immutable",()=>{
 for(const pattern of [/getAdminSession/,/requireMarketplaceSuperAdminRole/,/assertAdminCsrf/])assert.match(actions,pattern);
 assert.match(page,/isMaziSuperAdmin\(principal\)/);
 assert.match(srv,/await marketplaceMaziActor\(principal\)/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.mazi_processor_reviews/);
 assert.match(sql,/GRANT SELECT,INSERT ON public\.mazi_processor_reviews/);
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public\.mazi_processor_reviews/);
 assert.doesNotMatch(sql,/GRANT UPDATE|GRANT DELETE|CREATE POLICY [^\n]+ FOR DELETE/i);
 assert.doesNotMatch(srv,/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\./i);
});
test("legal and real invitation release recheck processor and retention evidence",()=>{
 assert.match(gate,/MAZI_PROCESSOR_EVIDENCE_NOT_DOCUMENTED/);
 assert.match(gate,/await maziProcessorReviewsComplete\(principal\)/);
 assert.match(operations,/retentionEvidenceComplete&&processorEvidenceComplete/);
 assert.match(operations,/processorEvidenceComplete/);
 assert.match(operations,/href="\/admin\/mazi\/processors"/);
 assert.match(invitations,/const \[retentionCurrent,processorsCurrent\]/);
 assert.match(invitations,/if\(!retentionCurrent\|\|!processorsCurrent\)/);
 assert.match(invitations,/legalVerified:row\.legal_verified===true&&retentionVerified&&processorVerified/);
 assert.match(retention,/"mazi_processor_reviews"/);
});
