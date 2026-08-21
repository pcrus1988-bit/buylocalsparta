import { PrivacyRequestService, type PrivacyRequest, type PrivacyRequestType } from "@buy-local-sparta/core";
import { customerScope } from "@buy-local-sparta/postgres-runtime";
import { getAccountRuntime } from "./account-runtime";
import { customerStateBackend } from "./customer-state-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export const CUSTOMER_PRIVACY_REQUEST_TYPES = [
  "access",
  "export",
  "correction",
  "deletion",
  "objection",
  "marketing_withdrawal",
  "account_closure"
] as const satisfies readonly PrivacyRequestType[];

export function isCustomerPrivacyRequestType(value: unknown): value is PrivacyRequestType {
  return typeof value === "string" && (CUSTOMER_PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}

export async function submitCustomerPrivacyRequest(input: {
  userId: string;
  type: PrivacyRequestType;
  now: number;
  details?: Readonly<Record<string, unknown>>;
}): Promise<PrivacyRequest> {
  if (customerStateBackend() === "memory") {
    return getAccountRuntime().privacyRequests.submit(input);
  }

  const runtime = getProductionPostgresRuntime();
  const scope = customerScope(input.userId);
  const existing = (await runtime.persistence.customerPrivacy.privacyRequestsForUser({ scope, userId: input.userId }))
    .find((item) => item.type === input.type && ["submitted", "processing"].includes(item.status));
  if (existing) return existing;

  const request = new PrivacyRequestService().submit(input);
  await runtime.persistence.customerPrivacy.savePrivacyRequest({ scope, request });
  return request;
}
