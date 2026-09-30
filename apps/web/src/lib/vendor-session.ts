import { cookies } from "next/headers";
import {
  assertVendorCapability,
  buildVendorOperatingContextFromSession,
  type SessionPrincipal,
  type VendorCapability,
  type VendorOperatingAssignment,
  type VendorOperatingContext
} from "@buy-local-sparta/core";
import { resolveVendorOperatingAssignment } from "./vendor-operating-assignment";
import { assertVendorCsrf, vendorSessionFromToken, VENDOR_SESSION_COOKIE } from "./vendor-runtime";
import { getActiveVendorTrialPrincipal } from "./vendor-trial-runtime";

export async function getVendorSession(): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(VENDOR_SESSION_COOKIE)?.value;
  if (token) {
    const principal = await vendorSessionFromToken(token, Date.now());
    if (principal?.vendorId && principal.roles.some((role) => role.startsWith("vendor_"))) return principal;
  }
  return getActiveVendorTrialPrincipal();
}

export async function vendorOperatingContextForPrincipal(
  principal: SessionPrincipal,
  assignment?: VendorOperatingAssignment
): Promise<VendorOperatingContext> {
  const resolvedAssignment = assignment ?? await resolveVendorOperatingAssignment(principal);
  return buildVendorOperatingContextFromSession(principal, resolvedAssignment);
}

export async function getVendorOperatingContext(
  assignment?: VendorOperatingAssignment
): Promise<VendorOperatingContext | undefined> {
  const principal = await getVendorSession();
  if (!principal) return undefined;
  return vendorOperatingContextForPrincipal(principal, assignment);
}

export async function requireVendorSession(request?: Request, csrf = false): Promise<SessionPrincipal> {
  const principal = await getVendorSession();
  if (!principal) throw new Error("VENDOR_AUTH_REQUIRED");
  if (csrf) assertVendorCsrf(principal, request?.headers.get("x-csrf-token") ?? undefined);
  return principal;
}

export async function requireVendorOperatingContext(
  assignment?: VendorOperatingAssignment,
  request?: Request,
  csrf = false
): Promise<VendorOperatingContext> {
  const principal = await requireVendorSession(request, csrf);
  const resolvedAssignment = assignment ?? await resolveVendorOperatingAssignment(principal);
  return buildVendorOperatingContextFromSession(principal, resolvedAssignment);
}


export async function requireVendorCapability(
  capability: VendorCapability,
  request?: Request,
  csrf = false
): Promise<Readonly<{ principal: SessionPrincipal; context: VendorOperatingContext }>> {
  const principal = await requireVendorSession(request, csrf);
  const context = await vendorOperatingContextForPrincipal(principal);
  assertVendorCapability(context, capability);
  return { principal, context };
}
