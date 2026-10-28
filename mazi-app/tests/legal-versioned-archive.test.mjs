import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const historical=read("lib/legal/archive/v31.ts");
const expectedGitBlobSHA="f065060056027e11176a276c7aea60543f8c925a";
const historicalJSON=historical.slice(historical.indexOf("documents:")+"documents:".length,historical.lastIndexOf("\n} as const satisfies")).trim();
const archive=JSON.parse(historicalJSON);
const currentVersion=read("lib/legal-documents.ts").match(/LEGAL_VERSION="([^"]+)"/)?.[1];
function currentModule(name){
 const src=read("lib/legal/v3-"+name+".ts");
 return JSON.parse(src.slice(src.indexOf("={")+1,src.lastIndexOf(" as const satisfies")));
}
test("MAZI legal historical version must be immutable without an explicit audited change",()=>{
 const input="blob "+Buffer.byteLength(historical,"utf8")+"\0"+historical;
 assert.equal(createHash("sha1").update(input,"utf8").digest("hex"),expectedGitBlobSHA);
 assert.match(historical,/mazi-legal-v3\.1-20261028/);
 assert.match(historical,/Publication itself is not evidence/);
 assert.match(historical,/c5abb830aa26e1e189ab35c5d4f3e96aed438e54/);
});
test("archived documents are complete, separately indexed and legally scoped",()=>{
 const names=["terms","membership","services","fund","award","marketing","community","governance","privacy","retention","cookies","compliance"];
 assert.deepEqual(Object.keys(archive).sort(),names.sort());
 assert.equal(Object.values(archive).reduce((sum,doc)=>sum+doc.sections.length,0),89);
 const generalTerms=archive.terms.sections.flatMap(s=>s.paragraphs).join("\n");
 assert.doesNotMatch(generalTerms,/€\s*\d+|ceil\(|\b250\b/);
 assert.equal(archive.retention.status,"current");
 assert.equal(archive.fund.status,"proposed");
 assert.match(archive.services.sections.flatMap(s=>s.paragraphs).join(" "),/δεν συσσωρεύονται/);
});
test("the v3.1 published documents match the frozen archive while v3.1 is the current release",()=>{
 if(currentVersion!=="mazi-legal-v3.1-20261028")return;
 const now={...currentModule("core"),...currentModule("finance"),...currentModule("data")};
 assert.deepEqual(now,archive);
});
test("archived pages and TXT exports are version-scoped and cannot create fake acceptance",()=>{
 const page=read("app/legal/archive/[version]/[slug]/page.tsx");
 const file=read("app/legal/export/[version]/[slug]/route.ts");
 const helper=read("lib/legal/legal-archive.ts");
 const legalPage=read("app/legal/legal-document.tsx");
 const index=read("app/legal/changes/page.tsx");
 for(const source of [page,file])assert.match(source,/archivedRecord\(version,slug\)/);
 assert.match(page,/dynamicParams=false/);
 assert.match(file,/dynamicParams=false/);
 assert.match(file,/attachment;/);
 assert.match(file,/X-Legal-Content-SHA256/);
 assert.match(file,/nosniff/);
 assert.match(helper,/createHash\("sha256"\)/);
 assert.match(helper,/Η λήψη ή ανάγνωση δεν αποδεικνύει ατομική/);
 assert.match(page,/Μόνο πραγματική ατομική διαδικασία αποδοχής/);
 assert.match(legalPage,/archiveExportUrl\(slug\)/);
 assert.match(index,/legalOrder\.map/);
 assert.doesNotMatch(file,/insert\(|upsert\(|update\(|service_role/i);
});
