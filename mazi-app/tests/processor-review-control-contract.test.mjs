import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("MAZI legal and invitation gates require current processor/transfer evidence",()=>{
 const register=read("../apps/web/src/lib/mazi-processor-reviews.ts");
 const invite=read("../apps/web/src/lib/mazi-invitation-admin.ts");
 const gate=read("../apps/web/src/lib/mazi-operations.ts");
 const schema=read("sql/mazi_processor_reviews_20261029.sql");
 assert.match(register,/MAZI_PROCESSOR_DOMAINS\.every/);
 assert.match(register,/MAZI_PROCESSOR_CHECKS/);
 assert.match(gate,/MAZI_PROCESSOR_EVIDENCE_NOT_DOCUMENTED/);
 assert.match(invite,/retentionCurrent,processorsCurrent/);
 assert.match(schema,/mazi_processor_review_append_only/);
 assert.match(schema,/TO bls_app_runtime,bls_platform_runtime/);
 assert.doesNotMatch(register,/DELETE FROM|DROP TABLE/);
});
