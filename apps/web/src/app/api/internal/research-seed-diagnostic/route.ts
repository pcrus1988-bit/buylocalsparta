import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BRIDGE_TOKEN = "059e30d4cca8b769a9efb966a2254f8a7b03669624c6babc";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== BRIDGE_TOKEN) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const url = "https://eemihhfreggbigxejjhj.supabase.co/functions/v1/research-seed-reconstruct-live-20260818?key=1a07d0f999a36ca86360c46a81d66f728aecbca77f87750f";
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" }
  });
}
