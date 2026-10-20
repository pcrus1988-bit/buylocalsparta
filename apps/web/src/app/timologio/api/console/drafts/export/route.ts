import {getFiscalActor,fiscalMerchantAccounts} from "../../../../../../lib/fiscal-auth";
import {listFiscalMerchantInbox} from "../../../../../../lib/fiscal-draft-inbox";
import {buildFiscalDraftCsv,parseFiscalDraftExportRequest} from "../../../../../../lib/fiscal-draft-export";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={
 "cache-control":"private, no-store, max-age=0",
 "content-security-policy":"default-src 'none'; sandbox",
 "x-content-type-options":"nosniff",
 "x-robots-tag":"noindex, nofollow",
 "referrer-policy":"no-referrer",
 "vary":"Cookie"
};
function fail(status:number,error:string){
 return Response.json({error},{status,headers});
}
/** Never accepts files, redirects, user-supplied SQL or issuance commands. */
export async function GET(request:Request){
 try{
  const actor=await getFiscalActor();
  if(!actor||actor.role!=="merchant")return fail(401,"MERCHANT_AUTH_REQUIRED");
  const input=parseFiscalDraftExportRequest(new URL(request.url).searchParams);
  if(!input)return fail(400,"INVALID_EXPORT_FILTERS");
  // Membership is independently checked twice: the account scope and the
  // PostgreSQL draft query, which joins tenant membership and active user.
  const accounts=await fiscalMerchantAccounts(actor);
  if(!accounts.some(account=>account.id===input.organizationId))
   return fail(404,"EXPORT_NOT_FOUND");
  const inbox=await listFiscalMerchantInbox(actor,input.organizationId,input.filters);
  const csv=buildFiscalDraftCsv(input.organizationId,inbox.rows);
  return new Response(csv,{
   status:200,
   headers:{
    ...headers,
    "content-type":"text/csv; charset=utf-8",
    "content-disposition":'attachment; filename="fiscal-nonfiscal-test-drafts-page.csv"'
   }
  });
 }catch{
  return fail(503,"FISCAL_DRAFT_EXPORT_UNAVAILABLE");
 }
}
