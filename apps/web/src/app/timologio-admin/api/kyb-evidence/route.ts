import {assertFiscalOrigin,requireFiscalAdmin} from "../../../../lib/fiscal-auth";
import {fiscalPool} from "../../../../lib/fiscal-runtime";
import {FiscalKybInputError,parseFiscalKybInput} from "../../../../lib/fiscal-kyb-checks";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  const actor=await requireFiscalAdmin(request);
  if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")
   return Response.json({error:"JSON_REQUIRED"},{status:415,headers:noStore});
  if(Number(request.headers.get("content-length")??0)>1250)
   return Response.json({error:"KYB_BODY_TOO_LARGE"},{status:413,headers:noStore});
  const raw=await request.text();
  if(Buffer.byteLength(raw,"utf8")>1250)
   return Response.json({error:"KYB_BODY_TOO_LARGE"},{status:413,headers:noStore});
  let body:unknown;
  try{body=JSON.parse(raw)}catch{return Response.json({error:"INVALID_JSON"},{status:400,headers:noStore});}
  const input=parseFiscalKybInput(body);
  const db=await fiscalPool().connect();
  try{
   await db.query("BEGIN");
   const org=await db.query<{id:string;status:string}>(
    "SELECT id,status FROM fiscal_organizations WHERE id=$1 FOR SHARE",[input.organizationId]);
   if(!org.rows[0]) {
    await db.query("ROLLBACK");
    return Response.json({error:"KYB_CASE_NOT_FOUND"},{status:404,headers:noStore});
   }
   if(org.rows[0].status!=="under_review") {
    await db.query("ROLLBACK");
    return Response.json({error:"KYB_CASE_NOT_UNDER_REVIEW"},{status:409,headers:noStore});
   }
   const volume=await db.query<{count:string}>(
    `SELECT count(*)::text AS count FROM fiscal_kyb_evidence_events
     WHERE organization_id=$1 AND recorded_at>now()-interval '1 hour'`,[input.organizationId]);
   if(Number(volume.rows[0]?.count??"0")>=30) {
    await db.query("ROLLBACK");
    return Response.json({error:"KYB_REVIEW_RATE_LIMITED"},{status:429,headers:noStore});
   }
   const inserted=await db.query<{id:string}>(
    `INSERT INTO fiscal_kyb_evidence_events
     (organization_id,check_type,outcome,source_kind,source_reference,recorded_by_kind,recorded_by_ref)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.organizationId,input.checkType,input.outcome,input.sourceKind,
     input.sourceReference,actor.kind,actor.id]
   );
   await db.query(
    `INSERT INTO fiscal_audit_events(actor_kind,actor_ref,organization_id,action,details)
     VALUES($1,$2,$3,'onboarding.kyb_evidence_recorded',$4::jsonb)`,
    [actor.kind,actor.id,input.organizationId,
     JSON.stringify({evidenceEventId:inserted.rows[0].id,checkType:input.checkType,
      outcome:input.outcome,sourceKind:input.sourceKind,legalApproval:false,
      notificationSent:false})]
   );
   await db.query("COMMIT");
   return Response.json({recorded:true,id:inserted.rows[0].id,
    outcome:input.outcome,legalApproval:false,issuanceEnabled:false,
    notificationSent:false},{status:201,headers:noStore});
  }catch(error){await db.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{db.release();}
 }catch(error){
  if(error instanceof FiscalKybInputError)
   return Response.json({error:error.code},{status:400,headers:noStore});
  const code=error instanceof Error?error.message:"KYB_EVIDENCE_UNAVAILABLE";
  const authorized=["FISCAL_ADMIN_AUTH_REQUIRED","CSRF_FAILED","ORIGIN_NOT_ALLOWED"];
  return Response.json({error:authorized.includes(code)?code:"KYB_EVIDENCE_UNAVAILABLE"},{
   status:code==="FISCAL_ADMIN_AUTH_REQUIRED"?401:
    code==="CSRF_FAILED"||code==="ORIGIN_NOT_ALLOWED"?403:503,headers:noStore});
 }
}
