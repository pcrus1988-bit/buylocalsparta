import {NextRequest,NextResponse} from "next/server";
import {maziPublicFundReport} from "../../../../lib/mazi-api";
export const dynamic="force-dynamic";
const escapeCell=(value:string|number|null)=>{
 if(value===null)return '""';
 const source=String(value);
 // A public CSV may be opened in spreadsheet software; neutralize formulas.
 const safe=/^[=+\-@\t\r]/.test(source)?"'"+source:source;
 return '"'+safe.replace(/"/g,'""')+'"';
};
export async function GET(request:NextRequest){
 const format=request.nextUrl.searchParams.get("format")||"csv";
 if(!["csv","json"].includes(format)||[...request.nextUrl.searchParams.keys()].some(k=>k!=="format"))
  return NextResponse.json({error:"invalid_format"},{status:400});
 const report=await maziPublicFundReport();
 if(!report)return NextResponse.json({error:"fund_report_unavailable"},
  {status:503,headers:{"Cache-Control":"no-store"}});
 if(format==="json")return NextResponse.json({schema_version:1,...report},
  {headers:{"Cache-Control":"public,max-age=0,s-maxage=60","X-Content-Type-Options":"nosniff"}});
 const rows:(string|number|null)[][]=[
  ["record_type","date","classification","amount_cents","summary","evidence_sha256","reference"],
  ["balance",report.as_of,"book_cash_balance",report.book_cash_balance_cents,
   "Ledger book balance, not bank-confirmed custody",null,null],
  ["balance",report.as_of,"available_for_new_awards",
   report.available_for_new_awards_cents,
   "Null means unverified; not zero",null,null],
  ["aggregate",report.as_of,"total_receipts",report.receipts_cents,"Sum of recorded receipts",null,null],
  ["aggregate",report.as_of,"total_expenses",report.expenses_cents,"Sum of recorded expenses",null,null],
  ["aggregate",report.as_of,"reserved_offers",report.reserved_offers_cents,
   "Award offers are not paid transactions",null,null],
  ...report.monthly.flatMap(month=>([
   ["monthly",month.month,"receipts",month.receipts_cents,"Monthly recorded receipts",null,null],
   ["monthly",month.month,"expenses",month.expenses_cents,"Monthly recorded expenses",null,null],
   ["monthly",month.month,"allocations",month.allocations_cents,"Monthly allocation ledger entries",null,null]
  ] as (string|number|null)[][])),
  ...report.public_events.map(event=>([
   "disclosure",event.date,event.kind,event.amount_cents,
   event.summary,event.evidence_sha256,event.id
  ] as (string|number|null)[]))
 ];
 const csv="\ufeff"+rows.map(row=>row.map(escapeCell).join(",")).join("\r\n")+"\r\n";
 return new Response(csv,{
  headers:{"Content-Type":"text/csv; charset=utf-8",
   "Content-Disposition":'attachment; filename="mazi-fund-public-accountability.csv"',
   "Cache-Control":"public,max-age=0,s-maxage=60",
   "X-Content-Type-Options":"nosniff"}
 });
}
