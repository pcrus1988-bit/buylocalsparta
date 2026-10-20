/**
 * M44 — actual authenticated merchant draft export, deliberately NON-FISCAL.
 * Pure, bounded formatting/validation, never an invoice renderer.
 *
 * The API must authorize membership in PostgreSQL before invoking this module.
 * One download contains at most the 25 records visible on the selected page.
 */
import type {FiscalInboxFilters,FiscalInboxRow} from "./fiscal-draft-inbox.ts";

export const FISCAL_DRAFT_CSV_MAX_ROWS=25;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANES=["b2c","pos","b2b","b2g"] as const;
const SOURCES=["console","external_api","marketplace"] as const;
const ALLOWED=new Set(["organizationId","lane","source","after"]);
export type FiscalDraftExportRequest=Readonly<{organizationId:string;filters:FiscalInboxFilters}>;

export function parseFiscalDraftExportRequest(
 query:URLSearchParams
):FiscalDraftExportRequest|null{
 if(!query||[...query.keys()].some(k=>!ALLOWED.has(k))||
  [...ALLOWED].some(k=>query.getAll(k).length>1))return null;
 const organizationId=query.get("organizationId")??"";
 const lane=query.get("lane")??"";
 const source=query.get("source")??"";
 const after=query.get("after")??"";
 if(!UUID.test(organizationId)||
  (lane&&!LANES.some(value=>value===lane))||
  (source&&!SOURCES.some(value=>value===source))||
  (after&&(!/^[A-Za-z0-9_-]{1,256}$/.test(after))))return null;
 return {organizationId,filters:{
  ...(lane?{lane:lane as FiscalInboxFilters["lane"]}:{}),
  ...(source?{source:source as FiscalInboxFilters["source"]}:{}),
  ...(after?{after}:{})
 }};
}

function cell(value:unknown,maxLength=160):string{
 let text=(value===null||value===undefined?"":String(value))
  .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g," ")
  .slice(0,maxLength);
 // Spreadsheet programs may execute formula-like CSV fields. Escaping quotes
 // alone is not sufficient; prefix an explicit text marker.
 if(/^[\s\u200b-\u200d\ufeff]*[=+@-]/u.test(text)||
    /^[\s\u200b-\u200d\ufeff]*[\t\r\n]/u.test(text))
  text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
const header=[
 "record_type","created_at_utc","draft_id","lane","source",
 "external_id","reference","gross_eur_cents","issuance_status"
] as const;

export function buildFiscalDraftCsv(
 organizationId:string,rows:readonly FiscalInboxRow[]
):string{
 if(!UUID.test(organizationId)||!Array.isArray(rows)||
  rows.length>FISCAL_DRAFT_CSV_MAX_ROWS)
  throw Error("FISCAL_M44_INVALID_EXPORT_SCOPE");
 const data=rows.map(row=>{
  if(!row||!UUID.test(row.id)||!LANES.includes(row.lane)||
   !SOURCES.includes(row.source)||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.created_at_exact))
   throw Error("FISCAL_M44_INVALID_EXPORT_ROW");
  const cents=row.gross_minor!==null&&/^\d{1,13}$/.test(row.gross_minor)&&
   Number(row.gross_minor)<=1e12?row.gross_minor:"";
  return [
   "NON_FISCAL_TEST_DRAFT",row.created_at_exact,row.id,row.lane,row.source,
   row.external_id??"",row.reference??"",cents,"NOT_ISSUED_NOT_TRANSMITTED"
  ].map(v=>cell(v)).join(",");
 });
 // UTF-8 BOM makes Greek text visible in common spreadsheet applications.
 return "\ufeff"+[header.join(","),...data].join("\r\n")+"\r\n";
}
