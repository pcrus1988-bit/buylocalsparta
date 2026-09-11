import { NextRequest, NextResponse } from "next/server";
import { normalizePartnerCode, PARTNER_ATTRIBUTION_DAYS } from "../../../lib/partner-network";

const PARTNER_REF_COOKIE = "km_partner_ref";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = normalizePartnerCode(rawCode);
  const destination = new URL("/join", request.url);

  if (!code) {
    destination.searchParams.set("ref_error", "invalid");
    return NextResponse.redirect(destination, 303);
  }

  destination.searchParams.set("ref", code);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set({
    name: PARTNER_REF_COOKIE,
    value: code,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PARTNER_ATTRIBUTION_DAYS * 24 * 60 * 60
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
