import { cookies } from "next/headers";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { ACCOUNT_SESSION_COOKIE } from "./account-runtime";
import { assertCustomerCsrf, customerSession } from "./customer-state-runtime";

export async function getAccountSession(): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(ACCOUNT_SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return customerSession(token, Date.now());
}

export async function requireAccountSession(request?: Request, csrf = false): Promise<SessionPrincipal> {
  const principal = await getAccountSession();
  if (!principal || !principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
  if (csrf) assertCustomerCsrf(principal, request?.headers.get("x-csrf-token") ?? undefined);
  return principal;
}
