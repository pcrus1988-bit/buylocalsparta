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
 const view=url.searchParams.get("view");
 const cycle=url.searchParams.get("cycle");
 const unknown=[...url.searchParams.keys()].some(k=>k!=="view"&&k!=="cycle");
 if(url.pathname.replace(/\/$/,"").split("/").pop()!=="mazi-fund-public"||
   unknown||url.searchParams.getAll("view").length>1||
   url.searchParams.getAll("cycle").length>1||
   (view!==null&&view!=="governance"&&view!=="archive"&&view!=="projects")||
   (cycle!==null&&(view!=="governance"||!/^[a-z0-9][a-z0-9-]{2,90}$/.test(cycle))))
  return json({ok:false,error:"not_found"},404);
 const base=Deno.env.get("SUPABASE_URL");
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!base||!secret)return json({ok:false,error:"service_unavailable"},503);
 try {
  const service=createClient(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const reportName=view==="projects"?"mazi_fund_public_project_updates":
   view==="archive"?"mazi_fund_public_vote_archive":
    view==="governance"?(cycle?"mazi_fund_public_vote_report_cycle":"mazi_fund_public_vote_report"):
    "mazi_fund_public_report";
  const {data,error}=await service.rpc(reportName,cycle?{p_slug:cycle}:{});
  if(error||!data||typeof data!=="object"||(Array.isArray(data)!==(view==="archive"||view==="projects")))
   return json({ok:false,error:"report_unavailable"},503);
  return json({ok:true,report:data});
 }catch{return json({ok:false,error:"report_unavailable"},503);}
});
