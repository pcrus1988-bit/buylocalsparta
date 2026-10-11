import {
 verifyFiscalSecurityAlertWebhook,recordFiscalSecurityAlertWebhook
} from "../../../../lib/fiscal-security-alert-webhook";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store","referrer-policy":"no-referrer",
 "x-content-type-options":"nosniff"};
export async function POST(request:Request){
 if(Number(request.headers.get("content-length")??0)>16000)
  return Response.json({error:"PAYLOAD_TOO_LARGE"},{status:413,headers});
 const raw=await request.text();
 if(Buffer.byteLength(raw,"utf8")>16000)
  return Response.json({error:"PAYLOAD_TOO_LARGE"},{status:413,headers});
 let verified;
 try{
  verified=verifyFiscalSecurityAlertWebhook({
   payload:raw,id:request.headers.get("svix-id")??undefined,
   timestamp:request.headers.get("svix-timestamp")??undefined,
   signature:request.headers.get("svix-signature")??undefined
  });
 }catch{
  return Response.json({error:"INVALID_OR_DISABLED_WEBHOOK"},{status:401,headers});
 }
 try{return Response.json(await recordFiscalSecurityAlertWebhook(verified),{headers});}
 catch{return Response.json({error:"WEBHOOK_RETRY_LATER"},{status:503,headers});}
}
