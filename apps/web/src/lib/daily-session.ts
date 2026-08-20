import { cookies } from "next/headers";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertDailyCsrf, DAILY_SESSION_COOKIE, dailySessionFromToken } from "./daily-runtime";
import { assertVendorCsrf } from "./vendor-runtime";
import { getVendorSession } from "./vendor-session";

export async function getDailySession(): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(DAILY_SESSION_COOKIE)?.value;
  if (token) {
    const daily = await dailySessionFromToken(token, Date.now());
    if (daily?.vendorId) return daily;
  }
  return getVendorSession();
}

export async function requireDailySession(request?: Request, csrf = false): Promise<SessionPrincipal> {
  const store = await cookies();
  const token = store.get(DAILY_SESSION_COOKIE)?.value;
  if (token) {
    const daily = await dailySessionFromToken(token, Date.now());
    if (daily?.vendorId) {
      if (csrf) assertDailyCsrf(daily, request?.headers.get("x-csrf-token") ?? undefined);
      return daily;
    }
  }
  const vendor = await getVendorSession();
  if (!vendor) throw new Error("DAILY_AUTH_REQUIRED");
  if (csrf) assertVendorCsrf(vendor, request?.headers.get("x-csrf-token") ?? undefined);
  return vendor;
}
