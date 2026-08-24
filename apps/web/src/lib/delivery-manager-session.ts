import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getAccountSession, requireAccountSession } from "./account-session";
import { assertDeliveryManager } from "./delivery-control-runtime";

export async function getDeliveryManagerSession(): Promise<SessionPrincipal | undefined> {
  const principal = await getAccountSession();
  if (!principal) return undefined;
  try {
    await assertDeliveryManager(principal);
    return principal;
  } catch {
    return undefined;
  }
}

export async function requireDeliveryManagerSession(request?: Request, csrf = false): Promise<SessionPrincipal> {
  const principal = await requireAccountSession(request, csrf);
  await assertDeliveryManager(principal);
  return principal;
}
