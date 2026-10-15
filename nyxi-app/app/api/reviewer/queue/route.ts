import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = "https://eemihhfreggbigxejjhj.supabase.co";
const headers = { "cache-control":"private, no-store", "x-content-type-options":"nosniff", "x-robots-tag":"noindex" };
export async function GET(req: NextRequest) {
  const anon = process.env.NYXI_SUPABASE_ANON_KEY;
  const auth = req.headers.get("authorization") ?? "";
  if (!anon || !/^Bearer [A-Za-z0-9._-]{40,4000}$/.test(auth)) {
    return Response.json({error:"unauthorized"}, {status:401,headers});
  }
  const offsetValue = Number(req.nextUrl.searchParams.get("offset")||"0");
  const offset = Number.isInteger(offsetValue) && offsetValue>=0 && offsetValue<=500 ? offsetValue : 0;
  const lanes = ["human_evidence_review","page_chrome_review","duplicate_review","too_short_review"];
  const lane = req.nextUrl.searchParams.get("lane");
  const args = new URLSearchParams({offset:String(offset)});
  if (lane && lanes.includes(lane)) args.set("lane",lane);
  try {
    const upstream=await fetch(BASE+"/functions/v1/nyxi-reviewer-queue?"+args,{
      headers:{apikey:anon, authorization:auth},cache:"no-store",signal:AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return Response.json({error:upstream.status===403?"forbidden":upstream.status===401?"unauthorized":"unavailable"}, {status:upstream.status===403?403:upstream.status===401?401:503,headers});
    const payload:unknown=await upstream.json();
    if (!payload||typeof payload!=="object") throw new Error("invalid");
    const v=payload as Record<string,unknown>;
    if (v.status!=="ready_for_review"||v.read_only!==true||!Array.isArray(v.queue)||v.publication!=="none")throw new Error("invalid");
    return Response.json(v,{headers});
  }catch{return Response.json({error:"unavailable"},{status:503,headers});}
}
