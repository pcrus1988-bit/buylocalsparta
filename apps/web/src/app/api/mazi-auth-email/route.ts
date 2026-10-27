import {createHmac,timingSafeEqual} from "node:crypto";
import {sendMaziExistingAccountResendLogin} from "../../../lib/mazi-passwordless-resend";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const fixedResponse=(status:number)=>
 Response.json({status:"received"},{status,headers:{"Cache-Control":"no-store"}});

/** Only the MAZI server action can issue a valid HMAC with the production
 * shared secret. The public browser never sees the credential. Signed
 * requests are bounded to 2 minutes; independent DB rate limits prevent
 * email replay/duplicate sends.
 */
export async function POST(request:Request){
 const configured=process.env.MAZI_AUTH_BRIDGE_SECRET;
 if(!configured||configured.length<48)return fixedResponse(503);
 if(!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
  return fixedResponse(415);
 const reported=Number(request.headers.get("content-length")||"0");
 if(!Number.isFinite(reported)||reported>1024||reported<0)return fixedResponse(413);
 const raw=await request.text();
 if(raw.length>1024)return fixedResponse(413);
 let data:unknown;
 try{data=JSON.parse(raw);}catch{return fixedResponse(400);}
 if(!data||typeof data!=="object")return fixedResponse(400);
 const payload=data as Record<string,unknown>;
 const email=payload.email,ts=payload.ts;
 if(typeof email!=="string"||email.length>254||typeof ts!=="number"||
    !Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>120000)
  return fixedResponse(403);
 const signature=request.headers.get("x-mazi-auth-signature")||"";
 if(!/^[a-f0-9]{64}$/.test(signature))return fixedResponse(403);
 const expected=createHmac("sha256",configured).update(String(ts)+"\n"+email).digest();
 const received=Buffer.from(signature,"hex");
 if(!timingSafeEqual(expected,received))return fixedResponse(403);
 try{
  await sendMaziExistingAccountResendLogin(email);
 }catch{
  console.warn("MAZI_AUTH_BRIDGE_UNAVAILABLE");
 }
 // Never reveal whether an account exists to the public sign-in form.
 return fixedResponse(202);
}
