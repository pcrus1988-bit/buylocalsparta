import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("single-owner v3 modules cover all legal sectors",()=>{
 const core=read("lib/legal/v3-core.ts"),finance=read("lib/legal/v3-finance.ts"),data=read("lib/legal/v3-data.ts"),renderer=read("app/legal/legal-document.tsx");
 for(const name of ['"terms"','"membership"','"services"'])assert.ok(core.includes(name),name);
 for(const name of ['"fund"','"award"','"marketing"','"governance"'])assert.ok(finance.includes(name),name);
 for(const name of ['"privacy"','"retention"','"cookies"','"community"','"compliance"'])assert.ok(data.includes(name),name);
 assert.match(renderer,/const sections=doc\.sections/);
 assert.doesNotMatch(renderer,/MAZI_LEGAL_ADDENDA|doc\.sections\.concat/);
 assert.match(renderer,/Κωδικοποίηση 3\.1/);
});
test("Fund periods explicitly exclude non-financial founding needs",()=>{
 const law=read("lib/legal/v3-finance.ts");
 for(const token of ["founding-needs-2026","€0","23:59:59","1–10","11–15","16–23","24–27","28","80%","ceil"])assert.ok(law.includes(token),token);
 const page=read("app/fund/page.tsx");
 assert.match(page,/01–10/);
});
test("legal exact figures are only in correct commercial documents",()=>{
 const core=read("lib/legal/v3-core.ts"),terms=core.slice(core.indexOf('"terms"'),core.indexOf('"membership"'));
 const finance=read("lib/legal/v3-finance.ts"),data=read("lib/legal/v3-data.ts");
 assert.doesNotMatch(terms,/€250|€100|€99|€50|Tokens\s+\d/);
 for(const token of ["€250","€100","€50","€62,50","€25","€12,50","€99","€499"])assert.ok(core.includes(token),token);
 for(const term of ["2016/679","3471/2006","4308/2014","2022/2065"])assert.ok(data.includes(term),term);
 assert.match(read("app/marketplace/rules/page.tsx"),/mazi-goods-v2/);
});
