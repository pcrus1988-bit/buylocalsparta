// MAZI: future financed-round member ballot gateway (funds remain gated).
// Deliberately isolated from both the public read-only financial report and
// the independently evolving marketplace/community member API.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
const base=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(base,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGIN="https://mazi.kontamou.site";
const headers={
 "Content-Type":"application/json;charset=utf-8",
 "Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"Authorization,apikey,Content-Type",
 "Cache-Control":"no-store","Vary":"Origin",
 "X-Content-Type-Options":"nosniff"
};
const out=(value:Record<string,unknown>,status=200)=>new Response(JSON.stringify(value),{status,headers});
const uuid=(x:unknown)=>typeof x==="string"&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(x);
type Member={user_id:string;status:string;voting_eligible:boolean;identity_verified_at:string|null;gemi_number:string|null;application_id:string};
const inWindow=(c:{starts_at:string;ends_at:string})=>Date.parse(c.starts_at)<=Date.now()&&Date.parse(c.ends_at)>Date.now();
Deno.serve(async(req:Request)=>{
 try{
  const origin=req.headers.get("origin");
  if(origin&&origin!==ORIGIN)return out({ok:false,error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return out({ok:false,error:"method_not_allowed"},405);
  if(Number(req.headers.get("content-length")||0)>8192)return out({ok:false,error:"payload_too_large"},413);
  const match=/^Bearer ([A-Za-z0-9._-]{30,5000})$/.exec(req.headers.get("authorization")||"");
  if(!match)return out({ok:false,error:"not_authenticated"},401);
  const {data:{user},error:authError}=await admin.auth.getUser(match[1]);
  if(authError||!user||!uuid(user.id))return out({ok:false,error:"not_authenticated"},401);
  const body=await req.text();
  if(body.length>8192)return out({ok:false,error:"payload_too_large"},413);
  let input:Record<string,unknown>;
  try{const decoded=JSON.parse(body);if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw new Error();
   input=decoded;}catch{return out({ok:false,error:"invalid_json"},400);}
  if(input.operation!=="state"&&input.operation!=="vote")return out({ok:false,error:"unsupported"},400);
  const {data:member,error:mError}=await admin.from("mazi_members")
   .select("user_id,status,voting_eligible,identity_verified_at,gemi_number,application_id")
   .eq("user_id",user.id).maybeSingle();
  if(mError)return out({ok:false,error:"service_unavailable"},503);
  if(!member||member.status!=="verified"||!member.identity_verified_at||!member.gemi_number)
    return out({ok:false,error:"membership_required"},403);
  const {data:application,error:aError}=await admin.from("mazi_membership_applications")
   .select("status").eq("id",(member as Member).application_id).maybeSingle();
  if(aError||application?.status!=="approved")
    return out({ok:false,error:"membership_required"},403);
  const {data:cycle,error:cError}=await admin.from("mazi_cycles")
   .select("id,title,kind,status,starts_at,ends_at,finance_activated,funding_budget_cents")
   .eq("kind","fund_allocation").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(cError)return out({ok:false,error:"service_unavailable"},503);
  if(!cycle||cycle.finance_activated!==true||cycle.funding_budget_cents<=0)
    return out({ok:true,cycle:null,proposals:[],has_voted:false,voting_eligible:false});
  const [proposalResponse,ballotResponse]=await Promise.all([
   admin.from("mazi_proposals").select("id,title,details,category,amount_cents,created_by,first_time_support_request")
    .eq("cycle_id",cycle.id).eq("status","approved").order("created_at",{ascending:true}).limit(100),
   admin.from("mazi_fund_ballots").select("id,proposal_ids,created_at")
    .eq("cycle_id",cycle.id).eq("voter_id",user.id).maybeSingle()
  ]);
  if(proposalResponse.error||ballotResponse.error)return out({ok:false,error:"service_unavailable"},503);
  const memberEligible=member.voting_eligible===true;
  const proposals=(proposalResponse.data||[]).filter(p=>p.created_by!==user.id).map(p=>({
   id:p.id,title:p.title,details:p.details,category:p.category,
   amount_cents:p.amount_cents,first_time_support_request:p.first_time_support_request
  }));
  if(input.operation==="state")return out({ok:true,cycle:{
    id:cycle.id,title:cycle.title,status:cycle.status,starts_at:cycle.starts_at,ends_at:cycle.ends_at,
    funding_budget_cents:cycle.funding_budget_cents
   },proposals,has_voted:Boolean(ballotResponse.data),
   my_vote:ballotResponse.data?{proposal_ids:ballotResponse.data.proposal_ids,
    created_at:ballotResponse.data.created_at}:null,
   voting_eligible:memberEligible});
  // The database trigger validates cycle, legal identity, every selected
  // proposal and conflict, and freezes the ballot against later edits.
  if(!memberEligible||cycle.status!=="voting"||!inWindow(cycle))
    return out({ok:false,error:"voting_not_open"},403);
  if(ballotResponse.data)return out({ok:false,error:"already_voted"},409);
  if(!Array.isArray(input.proposal_ids)||input.proposal_ids.length<1||input.proposal_ids.length>20
    ||input.proposal_ids.some(x=>!uuid(x))
    ||new Set(input.proposal_ids).size!==input.proposal_ids.length)
    return out({ok:false,error:"invalid_choices"},400);
  if(input.proposal_ids.some(x=>!proposals.some(p=>p.id===x)))
    return out({ok:false,error:"invalid_choices"},403);
  const {error:writeError}=await admin.from("mazi_fund_ballots").insert({
   cycle_id:cycle.id,voter_id:user.id,
   voter_gemi_number:(member as Member).gemi_number,proposal_ids:input.proposal_ids
  });
  if(writeError)return out({ok:false,error:writeError.code==="23505"?"already_voted":"ballot_not_eligible"},
   writeError.code==="23505"?409:403);
  return out({ok:true,submitted:true});
 }catch{return out({ok:false,error:"service_unavailable"},503);}
});
