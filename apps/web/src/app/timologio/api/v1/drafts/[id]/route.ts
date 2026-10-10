import { authenticateFiscalApi, FiscalApiError } from "../../../../../../lib/fiscal-api-clients";
import {getFiscalDraft} from "../../../../../../lib/fiscal-drafts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await authenticateFiscalApi(request);
  const {id}=await params;
  return Response.json({document:await getFiscalDraft(actor,id),fiscalIssuanceEnabled:false},
    {headers:{"cache-control":"no-store"}});
 }catch(error){
  return Response.json({error:error instanceof FiscalApiError?error.code:"FISCAL_DRAFT_UNAVAILABLE"},
    {status:error instanceof FiscalApiError?error.status:503,headers:{"cache-control":"no-store"}});
 }
}
