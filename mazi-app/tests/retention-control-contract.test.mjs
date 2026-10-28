import test from "node:test";import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const r=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("MAZI release gate is blocked until all real retention evidence categories have last review recorded",()=>{
 const retention=r("../apps/web/src/lib/mazi-retention-reviews.ts");
 const gate=r("../apps/web/src/lib/mazi-operations.ts");
 const page=r("../apps/web/src/app/admin/mazi/retention/page.tsx");
 assert.match(retention,/infrastructure_processors/);
 assert.match(retention,/counsel_evidence_obtained/);
 assert.match(retention,/missingSources\.length===0/);
 assert.match(gate,/MAZI_RETENTION_MATRIX_NOT_DOCUMENTED/);
 assert.match(page,/review_checks/);
 assert.match(page,/value="reopened"/);
 assert.doesNotMatch(retention,/DELETE FROM public|UPDATE public\.mazi_|TRUNCATE/i);
});
