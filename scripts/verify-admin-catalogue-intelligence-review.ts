import { readFileSync } from "node:fs";

const service=readFileSync("apps/web/src/lib/admin-catalogue-intelligence-review.ts","utf8");
const page=readFileSync("apps/web/src/app/admin/catalogue-intake/intelligence/page.tsx","utf8");
const autonomy=readFileSync("db/migrations/0187_catalog_intelligence_autonomy.sql","utf8");
const refreshQueue=readFileSync("db/migrations/0188_catalog_intelligence_refresh_queue.sql","utf8");
const safety=readFileSync("db/migrations/0189_catalog_intelligence_safety_activation.sql","utf8");

const checks:[boolean,string][]=[
  [service.includes("assertAdminPermission(principal,\"catalog.write\")"),"write actions require catalog.write"],
  [service.includes("catalog_intelligence_proposals")&&service.includes("p.status='open'"),"workspace only reads open intelligence proposals"],
  [service.includes("approve_catalog_intelligence_proposal"),"approval delegates to governed database function"],
  [service.includes("reject_catalog_intelligence_proposal"),"rejection delegates to governed database function"],
  [service.includes("NULL,$3::uuid,$4::uuid")&&service.includes("[proposalId,principal.userId,attributeId,productTypeId]"),"attribute approval preserves DB argument order: attribute then Product Type"],
  [service.includes("recordAdminAudit")&&service.includes("catalogue.intelligence_proposal.approved")&&service.includes("catalogue.intelligence_proposal.rejected"),"approval and rejection are audited"],
  [page.includes("Approve reusable mapping")&&page.includes("Reject proposal"),"Admin page exposes explicit approve/reject decisions"],
  [page.includes("It does not silently invent a new canonical category, Product Type or attribute"),"UI states the canonical-creation governance boundary"],
  [page.includes("Inspect proposal evidence")&&page.includes("proposedPayload")&&page.includes("evidence"),"proposal evidence is inspectable before decision"],
  [autonomy.includes("CREATE TABLE public.catalog_intelligence_proposals"),"schema contains durable proposal queue"],
  [autonomy.includes("p_target_category_id uuid DEFAULT NULL")&&autonomy.includes("p_target_attribute_id uuid DEFAULT NULL")&&autonomy.includes("p_target_product_type_id uuid DEFAULT NULL"),"schema approval signature remains category → attribute → Product Type"],
  [refreshQueue.includes("catalog_intelligence_refresh_queue")&&safety.includes("bls_catalog_intelligence_1m"),"autonomous refresh remains debounced and safety-activated"],
  [!page.includes("createCanonical")&&!service.includes("INSERT INTO public.categories")&&!service.includes("INSERT INTO public.attribute_definitions"),"review surface cannot create canonical structure directly"]
];

const failed=checks.filter(([ok])=>!ok);
if(failed.length){
  for(const [,message] of failed) console.error(`FAIL: ${message}`);
  process.exitCode=1;
}else{
  for(const [,message] of checks) console.log(`PASS: ${message}`);
  console.log("Catalogue intelligence Admin review governance verified.");
}
