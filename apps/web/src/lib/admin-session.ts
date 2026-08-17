import { cookies } from "next/headers";
import type { Permission, SessionPrincipal } from "@buy-local-sparta/core";
import { ADMIN_SESSION_COOKIE, adminSessionFromToken, assertAdminCsrf, assertAdminPermission, isPlatformRole } from "./admin-runtime";

export async function getAdminSession(): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const principal = await adminSessionFromToken(token, Date.now());
  if (!principal || !principal.roles.some(isPlatformRole) || principal.vendorId) return undefined;
  return principal;
}
export async function requireAdminSession(request?: Request, options: { csrf?: boolean; permission?: Permission } = {}): Promise<SessionPrincipal> {
  const principal = await getAdminSession();
  if (!principal) throw new Error("ADMIN_AUTH_REQUIRED");
  if (options.permission) assertAdminPermission(principal, options.permission);
  if (options.csrf) assertAdminCsrf(principal, request?.headers.get("x-csrf-token") ?? undefined);
  return principal;
}
