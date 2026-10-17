import {getAdminSession} from "../../../../../../lib/admin-session";
import {hasAdminPermission} from "../../../../../../lib/admin-runtime";
import {pressCampaignReport} from "../../../../../../lib/research-press-report";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function cell(value:unknown):string{
  const text=value===null||value===undefined?"":String(value);
  // Spreadsheet applications interpret leading = + - @ and controls as formulae.
  const escaped=/^[\s\t\r\n]*[=+\-@]/.test(text)?"'"+text:text;
  return '"'+escaped.replace(/"/g,'""').replace(/[\r\n\t]+/g," ")+'"';
}
export async function GET(req:Request){
  const principal=await getAdminSession();
  if(!principal)return new Response("Not authenticated",{status:401});
  if(!hasAdminPermission(principal,"research.publish.manage"))return new Response("Forbidden",{status:403});
  const id=new URL(req.url).searchParams.get("id")||"";
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return new Response("Invalid campaign",{status:400});
  const report=await pressCampaignReport(principal,id);
  if(!report.current)return new Response("Campaign not found",{status:404});
  const rows=[["email","language","send_status","verified_outcome","ses_message_id","ses_accepted_at","last_provider_event_at","provider_event_types","operator_notes"]];
  for(const d of report.rows)rows.push([
    d.recipient,d.language,d.status,d.outcome,d.ses_message_id||"",d.sent_at?new Date(d.sent_at).toISOString():"",
    d.last_event_at?new Date(d.last_event_at).toISOString():"",d.event_types.join(";"),d.error_message||""
  ]);
  const csv="\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
  return new Response(csv,{headers:{
    "content-type":"text/csv; charset=utf-8",
    "content-disposition":'attachment; filename="kontamou-press-report-'+id+'.csv"',
    "cache-control":"private, no-store, max-age=0",
    "x-content-type-options":"nosniff"
  }});
}
