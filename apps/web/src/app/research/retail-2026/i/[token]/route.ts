import { NextResponse } from "next/server";
import { RETAIL_STUDY_COOKIE, resolveRetailStudyInvitation } from "../../../../../lib/retail-study-2026-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invitation = await resolveRetailStudyInvitation(token);
  if (!invitation) return NextResponse.redirect(new URL("/research/retail-2026?invalid=1", request.url));

  const response = NextResponse.redirect(new URL("/research/retail-2026", request.url));
  response.cookies.set(RETAIL_STUDY_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
