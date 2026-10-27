import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("all MAZI legal sectors have explicit codification",()=>{
 const source=read("lib/mazi-legal-addenda-v2.ts");
 const layout=read("app/legal/legal-document.tsx");
 for(const sector of ["terms","fund","award","marketing","privacy","retention","community","cookies","governance","compliance"])
  assert.ok(source.includes('"'+sector+'"'),sector);
 assert.match(layout,/MAZI_LEGAL_ADDENDA/);
 assert.match(layout,/sections\.map/);
 assert.match(layout,/Κωδικοποίηση 2\.0/);
});
test("monthly stages are real fixed rules without pretending the founding €0 cycle pays grants",()=>{
 const fund=read("app/fund/page.tsx");
 const law=read("lib/mazi-legal-addenda-v2.ts");
 for(const range of ["01–10","11–15","16–23","24–27","28–τέλος μήνα"])assert.ok(fund.includes(range),range);
 for(const line of ["founding-needs-2026","23:59:59","€0","κατανομ"])assert.ok(law.includes(line),line);
});
test("credits and funding accounting retain consistent exact economics and limits",()=>{
 const law=read("lib/mazi-legal-addenda-v2.ts");
 for(const literal of ["€250","€100","€50","€62,50","€25","€12,50","€99","€499","250 Tokens","δεν συσσωρεύεται","40%","20%","ceil","80%","ν. 5144/2024","ν. 4308/2014","2016/679"])assert.ok(law.includes(literal),literal);
 assert.match(read("app/marketplace/rules/page.tsx"),/mazi-goods-v2/);
 assert.match(read("app/invitation-terms/page.tsx"),/mazi-invitation-terms-v1/);
});