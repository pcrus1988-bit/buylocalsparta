import type { NextRequest } from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const BASE="https://eemihhfreggbigxejjhj.supabase.co";
const HEADERS={"cache-control":"private, no-store","x-content-type-options":"nosniff","x-robots-tag":"noindex"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHOICES=new Set(["candidate_for_review","needs_rights_review","needs_source_check","reject_bad_text","duplicate"]);
const json=(obj:unknown,status:number)=>Response.json(obj,{status,headers:HEADERS});
export async function POST(req:NextRequest){
  const origin=req.headers.get("origin");
  if(origin!==null&&origin!==req.nextUrl.origin)return json({error:"forbidden"},403);
  const anon=process.env.NYXI_SUPABASE_ANON_KEY;
  const authorization=req.headers.get("authorization")||"";
  if(!anon||!/^Bearer [A-Za-z0-9._-]{40,4000}$/.test(authorization))return json({error:"unauthorized"},401);
  if(Number(req.headers.get("content-length")||0)>4096)return json({error:"invalid_request"},413);
  let input:unknown;
  try{const raw=await req.text();if(raw.length>4096)return json({error:"invalid_request"},413);input=JSON.parse(raw);}
  catch{return json({error:"invalid_request"},400);}
  if(!input||typeof input!=="object"||Array.isArray(input))return json({error:"invalid_request"},400);
  const p=input as Record<string,unknown>;
  if(Object.keys(p).some(k=>!["fragment_id","request_id","disposition","reason"].includes(k))
    ||typeof p.fragment_id!=="string"||!UUID.test(p.fragment_id)
    ||typeof p.request_id!=="string"||!UUID.test(p.request_id)
    ||typeof p.disposition!=="string"||!CHOICES.has(p.disposition)
    ||typeof p.reason!=="string"||p.reason.trim().length<20||p.reason.trim().length>1000)
    return json({error:"invalid_request"},400);
  try{
    const response=await fetch(BASE+"/functions/v1/nyxi-reviewer-triage",{
      method:"POST",headers:{apikey:anon,authorization,"content-type":"application/json"},
      body:JSON.stringify(p),cache:"no-store",signal:AbortSignal.timeout(9000)});
    if(!response.ok)return json({error:response.status===403?"forbidden":response.status===401?"unauthorized":
      response.status===409?"not_eligible_or_conflict":"unavailable"},
      response.status===401?401:response.status===403?403:response.status===409?409:503);
    const out=await response.json();
    if(out?.status!=="recorded"||out?.publication!=="none"||!UUID.test(String(out?.event_id||"")))
      return json({error:"unavailable"},503);
    return json({status:"recorded",event_id:out.event_id,replayed:out.replayed===true,publication:"none"},201);
  }catch{return json({error:"unavailable"},503);}
}
