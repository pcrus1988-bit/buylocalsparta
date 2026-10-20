import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 buildFiscalDraftCsv,parseFiscalDraftExportRequest,FISCAL_DRAFT_CSV_MAX_ROWS
} from "./fiscal-draft-export.ts";
import type {FiscalInboxRow} from "./fiscal-draft-inbox.ts";

const org="11111111-1111-4111-8111-111111111111";
const id="22222222-2222-4222-8222-222222222222";
const row: FiscalInboxRow={
 id,lane:"b2b",source:"console",external_id:"EXTERNAL-X",
 reference:"Ασφαλής δοκιμή",gross_minor:"15499",
 created_at:new Date("2026-10-20T09:15:00Z"),
 created_at_exact:"2026-10-20T09:15:00.000000Z"
};
const query=(text:string)=>new URLSearchParams(text);
test("M44 refuses missing, duplicated and unknown export parameters",()=>{
 for(const input of ["","lane=b2c","organizationId=unknown",
  "organizationId="+org+"&organizationId="+org,
  "organizationId="+org+"&foo=bar",
  "organizationId="+org+"&lane=issued",
  "organizationId="+org+"&source=bad",
  "organizationId="+org+"&after=abc%2Fxyz",
  "organizationId="+org+"&after="+"X".repeat(257)]){
  assert.equal(parseFiscalDraftExportRequest(query(input)),null,input);
 }
 assert.deepEqual(parseFiscalDraftExportRequest(query(
  "organizationId="+org+"&lane=b2b&source=console&after=AbCd_12")),{
  organizationId:org,filters:{lane:"b2b",source:"console",after:"AbCd_12"}
 });
 assert.deepEqual(parseFiscalDraftExportRequest(query("organizationId="+org)),{
  organizationId:org,filters:{}
 });
});
test("M44 produces Excel-compatible Greek UTF-8 export from actual row values",()=>{
 const csv=buildFiscalDraftCsv(org,[row]);
 assert.ok(csv.startsWith("\ufeff"));
 assert.equal(csv.split("\r\n").length,3);
 assert.ok(csv.includes("Ασφαλής δοκιμή"));
 assert.ok(csv.includes('"15499"'));
 assert.ok(csv.includes('"NON_FISCAL_TEST_DRAFT"'));
 assert.ok(csv.includes('"NOT_ISSUED_NOT_TRANSMITTED"'));
 assert.ok(csv.includes(id));
 assert.ok(!csv.includes("myDATA_MARK"));
 assert.ok(!csv.includes("ISSUED_BY_AADE"));
});
test("M44 protects CSV against formula injection, multiline tampering and quote breakouts",()=>{
 const cases=[
  "=HYPERLINK(\"https://bad.example\")",
  " +SUM(1,1)","\t@cmd","\n-1+2","\uFEFF=2+2"
 ];
 for(const reference of cases){
  const csv=buildFiscalDraftCsv(org,[{...row,reference}]);
  const data=csv.split("\r\n")[1];
  assert.ok(data.includes('"\''),"unsafe text must start with apostrophe: "+reference);
  assert.ok(csv.split("\r\n").length===3,"each record must occupy one line");
  assert.ok(!data.includes("\t"));
  assert.ok(!data.includes("\n"));
  assert.ok(!data.includes("\r"));
 }
 const special=buildFiscalDraftCsv(org,[{...row,reference:'Greek, "quoted"\nline'}]);
 assert.ok(special.includes('"Greek, ""quoted"" line"'));
});
test("M44 strictly bounds CSV to the 25 visible drafts",()=>{
 const rows=Array.from({length:FISCAL_DRAFT_CSV_MAX_ROWS},()=>row);
 assert.equal(buildFiscalDraftCsv(org,rows).split("\r\n").length,27);
 assert.throws(()=>buildFiscalDraftCsv(org,[...rows,row]),/INVALID_EXPORT_SCOPE/);
 assert.throws(()=>buildFiscalDraftCsv("fake",[row]),/INVALID_EXPORT_SCOPE/);
 assert.throws(()=>buildFiscalDraftCsv(org,[{...row,id:"bad"}]),/INVALID_EXPORT_ROW/);
 assert.throws(()=>buildFiscalDraftCsv(org,[{...row,lane:"issued" as "b2b"}]),/INVALID_EXPORT_ROW/);
 assert.ok(!buildFiscalDraftCsv(org,[]).includes(id));
 assert.ok(!buildFiscalDraftCsv(org,[{...row,gross_minor:"invalid"}]).includes('"invalid"'));
});
test("M44 independent service exposes private GET and UI explains download is non-fiscal",()=>{
 const standalone=readFileSync(new URL(
  "../../../../fiscal/service/src/app/timologio/api/console/drafts/export/route.ts",
  import.meta.url),"utf8");
 assert.ok(standalone.includes("export {GET}"));
 assert.ok(standalone.includes('export const runtime="nodejs"'));
 const handler=readFileSync(new URL(
  "../app/timologio/api/console/drafts/export/route.ts",import.meta.url),
  "utf8");
 assert.ok(handler.includes("getFiscalActor"));
 assert.ok(handler.includes("fiscalMerchantAccounts"));
 assert.ok(handler.includes("listFiscalMerchantInbox"));
 assert.ok(handler.includes("no-store"));
 assert.ok(handler.includes("EXPORT_NOT_FOUND"));
 assert.ok(!/export\s+(?:async\s+)?function\s+POST\s*\(/.test(handler));
 assert.ok(!/\bservice_role\b|createSignedUrl|invoice\.issued/i.test(handler));
});
