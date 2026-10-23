import {MaziInterestError,consumeMaziInterestLimit,saveMaziInterest} from "../../../lib/mazi-interest-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAZI_ORIGIN="https://mazi.kontamou.site";
const common={
 "Access-Control-Allow-Origin":MAZI_ORIGIN,
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"Content-Type, X-BLS-Visitor",
 "Cache-Control":"no-store",
 "Vary":"Origin"
};
const reply=(body:Record<string,unknown>,status=200)=>
 Response.json(body,{status,headers:common});
export function OPTIONS(req:Request){
 if(req.headers.get("origin")!==MAZI_ORIGIN)return new Response(null,{status:403});
 return new Response(null,{status:204,headers:common});
}
export async function POST(req:Request){
 if(req.headers.get("origin")!==MAZI_ORIGIN)
   return reply({code:"origin_not_allowed"},403);
 const length=Number(req.headers.get("content-length")||0);
 if(!Number.isFinite(length)||length<0||length>6500)return reply({code:"invalid_payload"},413);
 const visitor=req.headers.get("x-bls-visitor")?.trim()||"";
 // Never treat user-provided visitor ids as proof of identity.
 if(!/^[a-zA-Z0-9_-]{16,128}$/.test(visitor))return reply({code:"visitor_required"},400);
 // Vercel overrides x-vercel-forwarded-for. Missing network identity
 // fails closed; do not trust arbitrary caller-supplied X-Forwarded-For.
 const ip=req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()||"";
 if(!ip||ip.length>100)return reply({code:"network_validation_unavailable"},503);
 try{
  const allowed=await consumeMaziInterestLimit(visitor,ip,Date.now());
  if(!allowed)return reply({code:"rate_limited",error:"Υπερβολικά πολλές αιτήσεις. Δοκίμασε αργότερα."},429);
  const raw=await req.text();
  if(raw.length>6500)return reply({code:"invalid_payload"},413);
  let body:Record<string,unknown>;
  try{
   const parsed:unknown=JSON.parse(raw);
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("invalid");
   body=parsed as Record<string,unknown>;
  }catch{return reply({code:"invalid_payload"},400);}
  if(typeof body.companyWebsiteCheck==="string"&&body.companyWebsiteCheck.trim())
    return reply({status:"received"},202);
  const get=(key:string)=>typeof body[key]==="string"?body[key] as string:"";
  await saveMaziInterest({
   afm:get("afm"),representativeName:get("representativeName"),
   contactEmail:get("contactEmail"),description:get("description"),
   acceptProcessing:body.acceptProcessing===true,confirmAccuracy:body.confirmAccuracy===true
  });
  return reply({status:"received"},202);
 }catch(err){
  if(err instanceof MaziInterestError)
    return reply({code:err.code,error:err.message},err.status);
  if(err instanceof Error&&(err.message.startsWith("Το ΑΦΜ")))
    return reply({code:"invalid_afm",error:err.message},400);
  console.error("MAZI_INTEREST_INTAKE_UNAVAILABLE",err instanceof Error?err.name:"unknown");
  return reply({code:"service_unavailable",error:"Δεν ήταν δυνατή η υποβολή. Προσπάθησε ξανά."},503);
 }
}
