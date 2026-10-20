// NYXI private preliminary triage. No approval, publication, mirroring or reviewer provisioning.
const BASE="https://eemihhfreggbigxejjhj.supabase.co";
const COMMON={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff","x-robots-tag":"noindex"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:COMMON});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT=/^Bearer ([A-Za-z0-9._-]{40,4000})$/;
const CHOICES=new Set(["candidate_for_review","needs_rights_review","needs_source_check","reject_bad_text","duplicate"]);
const serviceHeaders=(key:string)=>({apikey:key,authorization:"Bearer "+key});
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const origin=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(origin!==BASE||!anon||!service)return json({error:"unavailable"},503);
  const jwt=JWT.exec(req.headers.get("authorization")||"")?.[1];
  if(!jwt||jwt===anon||jwt===service)return json({error:"unauthorized"},401);
  const size=Number(req.headers.get("content-length")||0);
  if(!Number.isFinite(size)||size>4096)return json({error:"invalid_request"},413);
  let data:unknown;
  try{const raw=await req.text();if(raw.length>4096)return json({error:"invalid_request"},413);data=JSON.parse(raw);}catch{return json({error:"invalid_request"},400);}
  if(!data||typeof data!=="object"||Array.isArray(data))return json({error:"invalid_request"},400);
  const p=data as Record<string,unknown>;
  if(Object.keys(p).some(k=>!["fragment_id","request_id","disposition","reason"].includes(k)))return json({error:"invalid_request"},400);
  const fragmentId=p.fragment_id,requestId=p.request_id,disposition=p.disposition,reason=p.reason;
  if(typeof fragmentId!=="string"||!UUID.test(fragmentId)||typeof requestId!=="string"||!UUID.test(requestId)
    ||typeof disposition!=="string"||!CHOICES.has(disposition)
    ||typeof reason!=="string"||reason.trim().length<20||reason.trim().length>1000||/[\u0000-\u001f\u007f]/.test(reason))
    return json({error:"invalid_request"},400);
  try{
    // Validate live Supabase identity: no trust in user IDs or roles from the request.
    const a=await fetch(BASE+"/auth/v1/user",{
      headers:{apikey:anon,authorization:"Bearer "+jwt},signal:AbortSignal.timeout(6000)});
    if(!a.ok)return json({error:"unauthorized"},401);
    const user=await a.json();
    if(!user||typeof user.id!=="string"||!UUID.test(user.id)||!user.email_confirmed_at)
      return json({error:"unauthorized"},401);
    // Explicit membership, rechecked on every write. Do not infer roles from client JWT metadata.
    const mr=await fetch(BASE+"/rest/v1/nyxi_reviewers?select=role,user_id&user_id=eq."+user.id+"&disabled_at=is.null&limit=1",{
      headers:serviceHeaders(service),signal:AbortSignal.timeout(6000)});
    if(!mr.ok)return json({error:"unavailable"},503);
    const member=await mr.json();
    if(!Array.isArray(member))return json({error:"unavailable"},503);
    if(!member.length||!["reviewer","publisher"].includes(member[0]?.role))return json({error:"forbidden"},403);
    // Postgres validates latest approved-for-acquisition snapshot, current pending fragment,
    // reviewer membership, hashes, idempotency, all in a single insertion transaction.
    const rpc=await fetch(BASE+"/rest/v1/rpc/nyxi_record_fragment_triage_v1",{
      method:"POST",headers:{...serviceHeaders(service),"content-type":"application/json"},
      body:JSON.stringify({p_actor_user_id:user.id,p_fragment_id:fragmentId,p_request_id:requestId,
        p_disposition:disposition,p_reason:reason.trim()}),signal:AbortSignal.timeout(8000)});
    if(!rpc.ok){
      // Explicitly avoid leaking SQL details, source content or privileged identifiers.
      if(rpc.status===400||rpc.status===409||rpc.status===403)return json({error:"not_eligible_or_conflict"},409);
      return json({error:"unavailable"},503);
    }
    const out=await rpc.json();
    if(out?.status!=="recorded"||out?.publication!=="none"||!UUID.test(String(out?.event_id||"")))
      return json({error:"unavailable"},503);
    return json({status:"recorded",event_id:out.event_id,replayed:out.replayed===true,
      publication:"none"},201);
  }catch{return json({error:"unavailable"},503);}
});
