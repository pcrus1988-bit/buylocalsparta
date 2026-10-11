import { createHash } from "node:crypto";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import type { SqlRow } from "@buy-local-sparta/core";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  try{
    const origin=request.headers.get("origin");
    const expected=new URL(request.url).origin;
    if(!origin || origin!==expected) return Response.json({error:"INVALID_ORIGIN"},{status:403});
    const body=await request.json() as {id?:unknown;name?:unknown;email?:unknown;message?:unknown;consent?:unknown;company?:unknown};
    if(body.company) return Response.json({ok:true});
    const id=String(body.id??"").trim(),name=String(body.name??"").trim(),email=String(body.email??"").trim().toLowerCase(),message=String(body.message??"").trim();
    if(!/^hubprospect_[a-zA-Z0-9_-]{6,90}$/.test(id)||!body.consent)throw Error("INVALID_INQUIRY");
    if(name.length<2||name.length>100||email.length<3||email.length>160||message.length<10||message.length>1200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("INVALID_INQUIRY_FIELDS");
    const ip=(request.headers.get("x-forwarded-for")??"unknown").split(",")[0].trim().slice(0,100);
    const hash=createHash("sha256").update(ip+"|"+email).digest("hex");
    const runtime=getProductionPostgresRuntime();
    const limiter=new PostgresFixedWindowRateLimiter(runtime.sqlPool);
    const rl=await limiter.consume({route:"hub-claim-inquiry",key:hash,limit:4,windowMs:60*60*1000,now:Date.now()});
    if(!rl.allowed) return Response.json({error:"TOO_MANY_REQUESTS"},{status:429});
    const record=await runtime.sqlPool.query<SqlRow>(`
      INSERT INTO hub_claim_inquiries(prospect_id,sender_name,sender_email,message)
      SELECT id,$2,$3,$4 FROM hub_expansion_prospects
      WHERE public_id=$1 AND plan_code='claim' AND status='converted' AND owner_user_id IS NOT NULL
      RETURNING id
    `,[id,name,email,message]);
    if(!record.rowCount)return Response.json({error:"CLAIM_NOT_PUBLIC"},{status:404});
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"INQUIRY_FAILED"},{status:400,headers:{"Cache-Control":"no-store"}});}
}
