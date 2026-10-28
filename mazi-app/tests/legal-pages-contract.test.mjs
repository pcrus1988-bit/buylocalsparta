import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("canonical legal registry isolates tariffs and offers in dedicated policies",()=>{
 const registry=read("lib/legal-documents.ts"), terms=read("lib/legal/v3-core.ts");
 assert.match(registry,/LEGAL_VERSION="mazi-legal-v3.1-20261028"/);
 for(const item of ["terms","membership","services","fund","award","marketing","community","governance","privacy","retention","cookies","compliance"])assert.match(registry,new RegExp('"'+item+'"'));
 const prefix=terms.slice(terms.indexOf('"terms"'),terms.indexOf('"membership"'));
 assert.doesNotMatch(prefix,/€\s*\d|\b(?:HUB_PRO_MONTHLY_EUR|MEMBERSHIP_MONTHLY_EUR|SERVICE_CREDIT_MONTHLY_EUR)\b|\b250\b|ceil\(/);
 assert.match(prefix,/\/legal\/membership/);
 assert.match(prefix,/\/legal\/services/);
 assert.match(prefix,/\/legal\/fund/);
 const membership=terms.slice(terms.indexOf('"membership"'),terms.indexOf('"services"'));
 assert.match(membership,/€250/);
 assert.match(membership,/€99/);
 assert.match(terms,/δεν συσσωρεύ/);
 assert.match(read("lib/legal/v3-finance.ts"),/ceil\(/);
 assert.match(read("lib/legal/v3-data.ts"),/ν\. 4308\/2014/);
});
test("legal routes and navigation include both specialized agreements and current pilot",()=>{
 assert.match(read("app/layout.tsx"),/href="\/legal"/);
 assert.match(read("app/legal/page.tsx"),/legalOrder/);
 assert.match(read("app/legal\/\[slug\]\/page.tsx"),/generateStaticParams/);
 assert.match(read("app/privacy/page.tsx"),/LegalView/);
 assert.match(read("app/legal/legal-document.tsx"),/legalRelations\[slug\]/);
 assert.match(read("app/legal/legal-document.tsx"),/\/marketplace\/rules/);
 assert.match(read("app/invitation-terms/page.tsx"),/mazi-invitation-terms-v1/);
});
