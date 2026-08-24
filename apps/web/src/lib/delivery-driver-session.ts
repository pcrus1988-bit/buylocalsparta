import { cookies } from "next/headers";
import type { DeliveryDriverPrincipal } from "./delivery-driver-runtime";
import { DRIVER_SESSION_COOKIE, assertDeliveryDriverCsrf, deliveryDriverSession } from "./delivery-driver-runtime";

export async function getDeliveryDriverSession(): Promise<DeliveryDriverPrincipal | undefined> {
  const token = (await cookies()).get(DRIVER_SESSION_COOKIE)?.value;
  return deliveryDriverSession(token, Date.now());
}

export async function requireDeliveryDriverSession(request?: Request, csrf = false): Promise<DeliveryDriverPrincipal> {
  const principal = await getDeliveryDriverSession();
  if (!principal) throw new Error("DRIVER_AUTH_REQUIRED");
  if (csrf) assertDeliveryDriverCsrf(principal, request?.headers.get("x-csrf-token") ?? undefined);
  return principal;
}
