import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const library=read("./mazi-retention-reviews.ts");
const gate=read("./mazi-operations.ts");
const page=read("../app/admin/mazi/retention/page.tsx");
const actions=read("../app/admin/mazi/retention/actions.ts");
const sql=read("../../../../mazi-app/sql/mazi_retention_category_review_20261028.sql");

test("retention review covers real MAZI categories, including third parties and consent",()=>{
 for(const k of ["interest_intake","invitations_acceptance","members_identity","community_content",
 "marketplace_listings","moderation","marketing","services","finance","votes_governance",
 "audit_and_rights","infrastructure_processors"])assert.ok(library.includes('key:"'+k+'"'),k);
 assert.match(library,/MAZI_RETENTION_CATEGORIES\.every/);
 assert.match(library,/missingSources\.length===0/);
 assert.match(library,/unmappedSources\.length===0/);
 assert.match(gate,/maziRetentionReviewsComplete\(principal\)/);
 assert.match(gate,/MAZI_RETENTION_MATRIX_NOT_DOCUMENTED/);
});
test("review submissions are authenticated, CSRF protected and not self-deleting",()=>{
 assert.match(page,/getAdminSession\(\)/);
 assert.match(page,/isMaziSuperAdmin\(principal\)/);
 assert.match(actions,/assertAdminCsrf\(principal/);
 assert.match(actions,/requireMarketplaceSuperAdminRole\(principal\)/);
 assert.match(library,/await marketplaceMaziActor\(principal\)/);
 assert.match(library,/actual\.size===required\.size/);
 assert.match(library,/input\.checks\.length===required\.size/);
 assert.doesNotMatch(library,/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.mazi_|pg_cron/);
 assert.match(page,/δεν εκτελούνται διαγραφές|Δεν εκτελούνται διαγραφές/);
 assert.match(page,/Απουσιάζοντες ονομασμένοι πίνακες/);
 assert.match(page,/Νέοι \/ αταξινόμητοι πίνακες MAZI/);
});
test("RLS uses backend-only grants, immutable events, no public access",()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.mazi_retention_category_reviews FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(sql,/GRANT SELECT,INSERT ON public\.mazi_retention_category_reviews TO bls_app_runtime,bls_platform_runtime/);
 assert.match(sql,/BEFORE UPDATE OR DELETE ON public\.mazi_retention_category_reviews/);
 assert.match(sql,/TO bls_app_runtime,bls_platform_runtime USING \(true\)/);
 assert.doesNotMatch(sql,/FOR DELETE TO|GRANT DELETE|GRANT UPDATE/i);
 assert.match(sql,/counsel_evidence_obtained/);
});
