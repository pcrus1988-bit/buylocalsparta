import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = "https://eemihhfreggbigxejjhj.supabase.co";
const EDGE = BASE + "/functions/v1/nyxi-reviewer-queue";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" };
const json = (v: unknown, code: number) => Response.json(v, { status: code, headers });
const rejectOrigin = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  return origin !== null && origin !== req.nextUrl.origin;
};

/**
 * No sign-up and no membership management here. Users must first be created
 * independently in Supabase Auth AND enrolled into nyxi_reviewers.
 * A successful password is insufficient: private Edge reviewer check is required.
 */
export async function POST(req: NextRequest) {
  if (rejectOrigin(req)) return json({ error: "forbidden" }, 403);
  const anon = process.env.NYXI_SUPABASE_ANON_KEY;
  if (!anon) return json({ error: "unavailable" }, 503);
  let body: Record<string,unknown>;
  try { body = await req.json(); } catch { return json({ error:"invalid" },400); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 180 || email.length < 6 || !email.includes("@") || !password || password.length > 256) return json({ error:"invalid" },400);
  try {
    const response = await fetch(BASE + "/auth/v1/token?grant_type=password", {
      method:"POST",
      headers:{ apikey:anon, "content-type":"application/json" },
      body:JSON.stringify({email,password}),cache:"no-store",signal:AbortSignal.timeout(7000),
    });
    if (!response.ok) return json({ error:"authentication_failed" },401);
    const value:unknown = await response.json();
    if (!value || typeof value !== "object") return json({error:"authentication_failed"},401);
    const login=value as Record<string,unknown>;
    const access=login.access_token;
    if (typeof access !== "string" || access.length < 40 || access.length > 4000) return json({error:"authentication_failed"},401);
    const allowed=await fetch(EDGE+"?offset=0", {
      headers:{apikey:anon,authorization:"Bearer "+access},cache:"no-store",signal:AbortSignal.timeout(7000),
    });
    // Do not reveal whether email exists or whether reviewer membership is missing.
    if (!allowed.ok) return json({error:"authentication_failed"},401);
    const data=await allowed.json();
    if (data?.status!=="ready_for_review" || data?.read_only!==true) return json({error:"authentication_failed"},401);
    return json({status:"authenticated",token:access,expires_in:Math.min(3600,Number(login.expires_in)||3600)},200);
  } catch { return json({error:"unavailable"},503); }
}
