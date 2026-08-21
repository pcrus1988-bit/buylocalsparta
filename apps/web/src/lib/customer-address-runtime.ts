import { PostgresCustomerAddressService, type CustomerAddressInput, type CustomerCheckoutProfile } from "@buy-local-sparta/postgres-runtime/customer-addresses";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const globals = globalThis as typeof globalThis & { __blsCustomerAddressService?: PostgresCustomerAddressService };

function service(): PostgresCustomerAddressService {
  const runtime = getProductionPostgresRuntime();
  return globals.__blsCustomerAddressService ??= new PostgresCustomerAddressService(runtime.sqlPool);
}

export async function customerCheckoutProfile(principal: SessionPrincipal): Promise<CustomerCheckoutProfile> {
  return service().profile(principal.userId);
}

export async function saveCustomerAddress(principal: SessionPrincipal, input: CustomerAddressInput, now = Date.now()): Promise<CustomerCheckoutProfile> {
  return service().upsert(principal.userId, input, now);
}

export async function removeCustomerAddress(principal: SessionPrincipal, addressId: string, now = Date.now()): Promise<CustomerCheckoutProfile> {
  return service().remove(principal.userId, addressId, now);
}

export async function attachCustomerOrderAddresses(principal: SessionPrincipal, input: { orderId: string; billingAddressId: string; deliveryAddressId?: string; now: number }): Promise<void> {
  return service().attachOrderSnapshots({ customerId: principal.userId, ...input });
}

export type { CustomerAddressInput, CustomerCheckoutProfile };
