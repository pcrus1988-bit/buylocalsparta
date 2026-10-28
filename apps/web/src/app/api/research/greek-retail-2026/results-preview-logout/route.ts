import { NextResponse } from "next/server";
import {
  RESEARCH_PREVIEW_COOKIE, RESEARCH_PREVIEW_LOGIN_PATH
} from "../../../../../lib/research-preview-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.redirect(new URL(RESEARCH_PREVIEW_LOGIN_PATH, request.url), 303);
  response.cookies.set({
    name: RESEARCH_PREVIEW_COOKIE, value: "", httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 0
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
