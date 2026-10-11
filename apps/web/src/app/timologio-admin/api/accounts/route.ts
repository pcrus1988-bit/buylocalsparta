import { assertFiscalOrigin, requireFiscalAdmin } from "../../../../lib/fiscal-auth";
import { fiscalPool } from "../../../../lib/fiscal-runtime";
export const runtime="nodejs";
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await requireFiscalAdmin(request);
  const body=await request.json() as {action?:unknown;organizationId?:unknown};
  if(body.action!=="start_review"||typeof body.organizationId!=="string"||!/^[a-f0-9-]{36}$/i.test(body.organizationId))
   return Response.json({error:"INVALID_ACTION"},{status:400});
  const db=await fiscalPool().connect();
  try{
   await db.query("BEGIN");
   const updated=await db.query<{id:string}>(
    "UPDATE fiscal_organizations SET status='under_review',reviewed_at=now() WHERE id=$1 AND status='pending_review' RETURNING id",
    [body.organizationId]);
   if(!updated.rows.length){await db.query("ROLLBACK");return Response.json({error:"NOT_PENDING"},{status:409});}
   await db.query(
    "INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action) VALUES($1,$2,$3,'onboarding.review_started')",
    [actor.kind,actor.id,body.organizationId]);
   await db.query("COMMIT");
   return Response.json({ok:true,status:"under_review"});
  }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
 }catch(error){
  const code=error instanceof Error?error.message:"FISCAL_ADMIN_ACTION_FAILED";
  return Response.json({error:["FISCAL_ADMIN_AUTH_REQUIRED","CSRF_FAILED","ORIGIN_NOT_ALLOWED"].includes(code)?code:"FISCAL_ADMIN_ACTION_FAILED"},
   {status:code==="FISCAL_ADMIN_AUTH_REQUIRED"?401:code==="CSRF_FAILED"||code==="ORIGIN_NOT_ALLOWED"?403:503});
 }
}
