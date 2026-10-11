import {assertFiscalOrigin,requireFiscalAdmin} from "../../../../lib/fiscal-auth";
import {fiscalPool} from "../../../../lib/fiscal-runtime";
import {
 FiscalReviewInputError,parseFiscalReviewInput,
 fiscalReviewExpectedStatus,fiscalReviewAuditAction
} from "../../../../lib/fiscal-admin-review";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await requireFiscalAdmin(request);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers:noStore});
  if(Number(request.headers.get("content-length")??0)>2500)
   return Response.json({error:"REVIEW_BODY_TOO_LARGE"},{status:413,headers:noStore});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>2500)
   return Response.json({error:"REVIEW_BODY_TOO_LARGE"},{status:413,headers:noStore});
  let body:unknown;
  try{body=JSON.parse(raw)}catch{
   return Response.json({error:"INVALID_JSON"},{status:400,headers:noStore});
  }
  const input=parseFiscalReviewInput(body);
  const db=await fiscalPool().connect();
  try{
   await db.query("BEGIN");
   const target=await db.query<{id:string;status:string}>(
    "SELECT id,status FROM fiscal_organizations WHERE id=$1 FOR UPDATE",[input.organizationId]);
   const row=target.rows[0];
   if(!row){await db.query("ROLLBACK");return Response.json({error:"ACCOUNT_NOT_FOUND"},{status:404,headers:noStore});}
   if(row.status!==fiscalReviewExpectedStatus(input.action)){
    await db.query("ROLLBACK");
    return Response.json({error:"REVIEW_STATE_CONFLICT",currentStatus:row.status},{status:409,headers:noStore});
   }
   const next=input.action==="start_review"?"under_review":input.action==="reject"?"rejected":row.status;
   if(next!==row.status){
    await db.query(
     "UPDATE fiscal_organizations SET status=$2,reviewed_at=now() WHERE id=$1",
     [row.id,next]);
   }
   // Notes are INTERNAL operator case records, not a customer-facing notification.
   // Issuance/merchant approval is deliberately unavailable on this endpoint.
   await db.query(
    "INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details) VALUES($1,$2,$3,$4,$5::jsonb)",
    [actor.kind,actor.id,row.id,fiscalReviewAuditAction(input.action),
     JSON.stringify(input.note?{note:input.note,visibility:"operator_only",notificationSent:false}: {})]
   );
   await db.query("COMMIT");
   return Response.json({ok:true,status:next,action:input.action,notificationSent:false,issuanceEnabled:false},{headers:noStore});
  }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{db.release();}
 }catch(error){
  if(error instanceof FiscalReviewInputError)
   return Response.json({error:error.code},{status:400,headers:noStore});
  const code=error instanceof Error?error.message:"FISCAL_ADMIN_ACTION_FAILED";
  return Response.json({
   error:["FISCAL_ADMIN_AUTH_REQUIRED","CSRF_FAILED","ORIGIN_NOT_ALLOWED"].includes(code)
    ?code:"FISCAL_ADMIN_ACTION_FAILED"
  },{status:code==="FISCAL_ADMIN_AUTH_REQUIRED"?401:
   code==="CSRF_FAILED"||code==="ORIGIN_NOT_ALLOWED"?403:503,headers:noStore});
 }
}
