import {
  AadeMyDataClient,
  reconcileMyDataReporting,
  type LocalFiscalMarkRecord,
  type MyDataReportingReconciliation
} from "@buy-local-sparta/aade-mydata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { resolveMyDataDiagnosticConfig } from "./mydata-runtime";

const MARKET_CODE="sparta";
const MAX_DIAGNOSTIC_ROWS=100;

export type MyDataReportingDiagnostic = Readonly<{
  readOnly:true;
  checkedAt:number;
  environment:string;
  specVersion:string;
  period:{dateFrom:string;dateTo:string};
  status:"matched"|"drift"|"incomplete";
  complete:boolean;
  sellerTaxNumber?:string;
  localDocuments:number;
  acceptedWithoutIssueDate:number;
  vat:{pages:number;complete:boolean;marks:number;matched:number};
  e3:{pages:number;complete:boolean;marks:number;matched:number};
  localMissingInVat:readonly LocalFiscalMarkRecord[];
  localMissingInE3:readonly LocalFiscalMarkRecord[];
  unmatchedVatMarks:readonly string[];
  unmatchedE3Marks:readonly string[];
  truncated:{localMissingInVat:boolean;localMissingInE3:boolean;unmatchedVatMarks:boolean;unmatchedE3Marks:boolean};
}>;

export async function myDataReportingDiagnostic(input:{dateFrom:string;dateTo:string;maxPages?:number}):Promise<MyDataReportingDiagnostic>{
  if(!productionDatabaseConfigured())throw new Error("myDATA reporting reconciliation requires PostgreSQL");
  const range=validatePeriod(input.dateFrom,input.dateTo);
  const resolved=await resolveMyDataDiagnosticConfig();
  if(!resolved)throw new Error("AADE myDATA credentials are not configured");
  const db=getProductionPostgresRuntime().nativePool;
  const [localResult,undatedResult,policyResult]=await Promise.all([
    db.query<{
      id:string;aade_mark:string;issue_date:string|Date;invoice_type_code:string|null;document_number:string|null;
    }>(`SELECT td.public_id AS id,td.aade_mark,td.issue_date,td.invoice_type_code,td.document_number
        FROM tax_documents td
        JOIN markets m ON m.id=td.market_id
        WHERE m.code=$1
          AND td.transmission_status='accepted'
          AND td.aade_mark IS NOT NULL
          AND td.issue_date BETWEEN $2::date AND $3::date
        ORDER BY td.issue_date,td.created_at`,[MARKET_CODE,range.dateFrom,range.dateTo]),
    db.query<{count:string}>(`SELECT count(*)::text AS count
        FROM tax_documents td
        JOIN markets m ON m.id=td.market_id
        WHERE m.code=$1
          AND td.transmission_status='accepted'
          AND td.aade_mark IS NOT NULL
          AND td.issue_date IS NULL`,[MARKET_CODE]),
    db.query<{seller_tax_number:string}>(`SELECT p.seller_tax_number
        FROM accounting_tax_policies p
        JOIN markets m ON m.id=p.market_id
        WHERE m.code=$1 AND p.status='approved'
        ORDER BY p.approved_at DESC NULLS LAST,p.created_at DESC
        LIMIT 1`,[MARKET_CODE])
  ]);
  const local:LocalFiscalMarkRecord[]=localResult.rows.map(row=>({
    id:row.id,
    mark:row.aade_mark,
    issueDate:isoDate(row.issue_date),
    invoiceTypeCode:row.invoice_type_code??undefined,
    documentNumber:row.document_number??undefined
  }));
  const acceptedWithoutIssueDate=Number(undatedResult.rows[0]?.count??0);
  if(!Number.isSafeInteger(acceptedWithoutIssueDate)||acceptedWithoutIssueDate<0)throw new Error("Invalid local tax-document diagnostic count");
  const sellerTaxNumber=policyResult.rows[0]?.seller_tax_number?.trim()||undefined;
  if(sellerTaxNumber&&!/^\d{9}$/.test(sellerTaxNumber))throw new Error("Approved Accounting Policy seller AFM is invalid");
  const client=new AadeMyDataClient(resolved.config);
  const query={
    dateFrom:toAadeDate(range.dateFrom),
    dateTo:toAadeDate(range.dateTo),
    ...(sellerTaxNumber?{entityVatNumber:sellerTaxNumber}:{}),
    groupedPerDay:false
  };
  const [vat,e3]=await Promise.all([
    client.requestVatInfoAll(query,{maxPages:input.maxPages}),
    client.requestE3InfoAll(query,{maxPages:input.maxPages})
  ]);
  const reconciliation=reconcileMyDataReporting({local,vat,e3});
  const complete=reconciliation.complete&&acceptedWithoutIssueDate===0;
  const status:MyDataReportingDiagnostic["status"]=complete?reconciliation.status:"incomplete";
  return{
    readOnly:true,
    checkedAt:Date.now(),
    environment:client.environment,
    specVersion:client.specVersion,
    period:range,
    status,
    complete,
    sellerTaxNumber,
    localDocuments:reconciliation.localDocuments,
    acceptedWithoutIssueDate,
    vat:{pages:vat.pages,complete:vat.complete,marks:reconciliation.vatMarks,matched:reconciliation.matchedVat},
    e3:{pages:e3.pages,complete:e3.complete,marks:reconciliation.e3Marks,matched:reconciliation.matchedE3},
    localMissingInVat:reconciliation.localMissingInVat.slice(0,MAX_DIAGNOSTIC_ROWS),
    localMissingInE3:reconciliation.localMissingInE3.slice(0,MAX_DIAGNOSTIC_ROWS),
    unmatchedVatMarks:reconciliation.unmatchedVatMarks.slice(0,MAX_DIAGNOSTIC_ROWS),
    unmatchedE3Marks:reconciliation.unmatchedE3Marks.slice(0,MAX_DIAGNOSTIC_ROWS),
    truncated:{
      localMissingInVat:reconciliation.localMissingInVat.length>MAX_DIAGNOSTIC_ROWS,
      localMissingInE3:reconciliation.localMissingInE3.length>MAX_DIAGNOSTIC_ROWS,
      unmatchedVatMarks:reconciliation.unmatchedVatMarks.length>MAX_DIAGNOSTIC_ROWS,
      unmatchedE3Marks:reconciliation.unmatchedE3Marks.length>MAX_DIAGNOSTIC_ROWS
    }
  };
}

function validatePeriod(dateFrom:string,dateTo:string):{dateFrom:string;dateTo:string}{
  const from=parseIsoDate(dateFrom,"dateFrom");
  const to=parseIsoDate(dateTo,"dateTo");
  if(from.time>to.time)throw new Error("dateFrom must not be after dateTo");
  const days=Math.floor((to.time-from.time)/86_400_000)+1;
  if(days>366)throw new Error("myDATA reporting reconciliation period must not exceed 366 days");
  return{dateFrom:from.value,dateTo:to.value};
}
function parseIsoDate(value:string,label:string):{value:string;time:number}{
  const raw=value.trim();
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(!match)throw new Error(`${label} must use YYYY-MM-DD`);
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const time=Date.UTC(year,month-1,day);
  const date=new Date(time);
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error(`${label} must be a real calendar date`);
  return{value:raw,time};
}
function toAadeDate(value:string):string{const [year,month,day]=value.split("-");return `${day}/${month}/${year}`;}
function isoDate(value:string|Date):string{
  if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw new Error("Invalid fiscal issue date");return value.toISOString().slice(0,10);}
  return parseIsoDate(String(value).slice(0,10),"issue_date").value;
}
