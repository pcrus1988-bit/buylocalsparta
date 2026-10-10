import { authenticateFiscalApi, FiscalApiError } from "../../../../../lib/fiscal-api-clients";
import {createFiscalDraft,listFiscalDrafts} from "../../../../../lib/fiscal-drafts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store"};
function failure(error:unknown){
  const code=error instanceof FiscalApiError?error.code:"FISCAL_DRAFT_UNAVAILABLE";
  const status=error instanceof FiscalApiError?error.status:503;
  return Response.json({error:code},{status,headers});
}
export async function GET(request:Request) {
 try{
  const actor=await authenticateFiscalApi(request);
  return Response.json({documents:await listFiscalDrafts(actor),fiscalIssuanceEnabled:false},{headers});
 }catch(error){return failure(error);}
}
export async function POST(request:Request) {
 try{
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
    return Response.json({error:"JSON_REQUIRED"},{status:415,headers});
  if(Number(request.headers.get("content-length")??0)>4096)return Response.json({error:"DRAFT_TOO_LARGE"},{status:413,headers});
  const actor=await authenticateFiscalApi(request);
  const body=await request.text();
  if(body.length>4096)return Response.json({error:"DRAFT_TOO_LARGE"},{status:413,headers});
  let input:unknown;
  try{input=JSON.parse(body);}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers});}
  const outcome=await createFiscalDraft(actor,input);
  const {payload_digest,...draft}=outcome.draft;
  return Response.json({document:draft,created:outcome.created,fiscalIssuanceEnabled:false},
    {status:outcome.created?201:200,headers});
 }catch(error){return failure(error);}
}
