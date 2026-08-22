import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { accountAuthSecret } from "./account-runtime";
import { customerOrder } from "./customer-commerce-runtime";

const PREFIX = "oline_";

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

export function customerOrderLineActionToken(userId: string, orderId: string, orderLineId: string): string {
  const digest = createHmac("sha256", accountAuthSecret())
    .update(`customer-order-line:${userId}:${orderId}:${orderLineId}`)
    .digest("base64url");
  return `${PREFIX}${digest}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireCustomerOrderLineInternalId(
  principal: SessionPrincipal,
  orderId: string,
  value: string
): Promise<{ internalId: string; actionToken: string }> {
  requireCustomer(principal);
  const candidate = value.trim();
  if (!candidate || candidate.length > 160) throw new Error("ORDER_OR_LINE_NOT_FOUND");
  const order = await customerOrder(principal, orderId);
  if (!order) throw new Error("ORDER_OR_LINE_NOT_FOUND");

  for (const line of order.lines) {
    const token = customerOrderLineActionToken(principal.userId, order.id, line.id);
    if (line.id === candidate || safeEqual(token, candidate)) return { internalId: line.id, actionToken: token };
  }
  throw new Error("ORDER_OR_LINE_NOT_FOUND");
}
