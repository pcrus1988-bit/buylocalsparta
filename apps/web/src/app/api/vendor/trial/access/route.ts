import { cookies } from "next/headers";
import {
  VENDOR_TRIAL_COOKIE,
  vendorTrialSnapshotFromToken
} from "../../../../../lib/vendor-trial-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token || token.length > 2048) {
    return Response.redirect(new URL("/vendor/login?trial=invalid", request.url), 303);
  }

  const snapshot = await vendorTrialSnapshotFromToken(token, Date.now());
  if (!snapshot) {
    return Response.redirect(new URL("/vendor/login?trial=invalid", request.url), 303);
  }

  (await cookies()).set({
    name: VENDOR_TRIAL_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
    path: "/",
    expires: new Date(snapshot.accessExpiresAt)
  });

  return Response.redirect(
    new URL(snapshot.active ? "/vendor/trial" : "/vendor/trial-expired", request.url),
    303
  );
}
