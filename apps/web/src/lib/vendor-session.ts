import { cookies } from "next/headers";
import {
  buildVendorOperatingContextFromSession,
  type SessionPrincipal,
  type VendorOperatingAssignment,
  type VendorOperatingContext
} from "@buy-local-sparta/core";
import { assertVendorCsrf, vendorSessionFromToken, VENDOR_SESSION_COOKIE } from "./vendor-runtime";

export async function getVendorSession(): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(VENDOR_SESSION_COOKIE)?.value;
  if (!token) return undefined;
  const principal = await vendorSessionFromToken(token, Date.now());
  if (!principal?.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) return undefined;
  return principal;
}

export async function getVendorOperatingContext(
  assignment: VendorOperatingAssignment = {}
): Promise<VendorOperatingContext | undefined> {
  const principal = await getVendorSession();
  return principal ? buildVendorOperatingContextFromSession(principal, assignment) : undefined;
}

export async function requireVendorSession(request?: Request, csrf = false): Promise<SessionPrincipal> {
  const principal = await getVendorSession();
  if (!principal) throw new Error("VENDOR_AUTH_REQUIRED");
  if (csrf) assertVendorCsrf(principal, request?.headers.get("x-csrf-token") ?? undefined);
  return principal;
}

export async function requireVendorOperatingContext(
  assignment: VendorOperatingAssignment = {},
  request?: Request,
  csrf = false
): Promise<VendorOperatingContext> {
  const principal = await requireVendorSession(request, csrf);
  return buildVendorOperatingContextFromSession(principal, assignment);
}
