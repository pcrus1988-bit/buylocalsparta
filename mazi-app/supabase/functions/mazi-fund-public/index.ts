// MAZI financial transparency (read-only). Independent of the member gateway.
// Financial ledger, banking references, unreviewed evidence and identities
// stay inaccessible to the public key. Only a fixed pre-redacted SQL report.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
const origin="https://mazi.kontamou.site";
const headers={
 "Content-Type":"application/json;charset=utf-8",
 "Access-Control-Allow-Origin":origin,
 "Access-Control-Allow-Methods":"GET, OPTIONS",
 "Access-Control-Allow-Headers":"apikey,Content-Type",
 "Cache-Control":"public, max-age=0, s-maxage=60",
 "Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 const method=req.method;
 if(method==="OPTIONS")return new Response(null,{status:204,headers});
 if(method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
 const url=new URL(req.url);
 if(url.pathname.replace(/\/$/,"").split("/").pop()!=="mazi-fund-public"||url.search!=="")
  return json({ok:false,error:"not_found"},404);
 const base=Deno.env.get("SUPABASE_URL");
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!base||!secret)return json({ok:false,error:"service_unavailable"},503);
 try {
  const service=createClient(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await service.rpc("mazi_fund_public_report");
  if(error||!data||typeof data!=="object"||Array.isArray(data))
   return json({ok:false,error:"report_unavailable"},503);
  return json({ok:true,report:data});
 }catch{return json({ok:false,error:"report_unavailable"},503);}
});
