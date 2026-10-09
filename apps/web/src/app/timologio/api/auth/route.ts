import { assertFiscalOrigin, assertFiscalCsrf, getFiscalActor, loginFiscal, logoutFiscal, registerFiscal } from "../../../../lib/fiscal-auth";
import { fiscalDatabaseConfigured } from "../../../../lib/fiscal-runtime";

export const runtime="nodejs";
export async function POST(request:Request){
 try{
  assertFiscalOrigin(request);
  if(!fiscalDatabaseConfigured())return Response.json({error:"FISCAL_DATABASE_NOT_PROVISIONED"},{status:503});
  const body=await request.json() as Record<string,unknown>;
  const action=body.action;
  if(action==="register"){
   const result=await registerFiscal({
    email:String(body.email??""),password:String(body.password??""),
    legalName:String(body.legalName??""),vatNumber:String(body.vatNumber??"")
   });
   return Response.json(result,{status:201});
  }
  if(action==="login")return Response.json(await loginFiscal(String(body.email??""),String(body.password??"")));
  if(action==="logout"){
   const actor=await getFiscalActor();
   if(!actor)return Response.json({error:"AUTH_REQUIRED"},{status:401});
   assertFiscalCsrf(actor,request.headers.get("x-csrf-token"));
   await logoutFiscal();
   return Response.json({ok:true});
  }
  return Response.json({error:"UNSUPPORTED_ACTION"},{status:400});
 }catch(error){
  const code=error instanceof Error?error.message:"FISCAL_AUTH_FAILED";
  const known=new Set(["INVALID_EMAIL","INVALID_CREDENTIALS","INVALID_ORGANIZATION","PASSWORD_LENGTH_INVALID","REGISTRATION_NOT_OPEN","ACCOUNT_ALREADY_EXISTS","AUTH_RATE_LIMITED","ORIGIN_NOT_ALLOWED","CSRF_FAILED"]);
  return Response.json({error:known.has(code)?code:"FISCAL_AUTH_UNAVAILABLE"},{status:code==="AUTH_RATE_LIMITED"?429:code==="REGISTRATION_NOT_OPEN"?403:known.has(code)?400:503});
 }
}
