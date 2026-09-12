import { getProductionPostgresRuntime } from "./postgres-runtime";

export const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
export const NOVA_EXPECTED_OWNER_VENDOR_PUBLIC_ID = "vendor_e8cb57b3c67b469d9a9d";

export type NovaRuntimeInvariantState = Readonly<{
  supplierFound: boolean;
  active: boolean;
  ownerVendorPublicId: string | null;
  apiAuthoritativeAvailability: boolean;
  orderForwardingEnabled: boolean;
}>;

export function novaRuntimeInvariantViolations(state: NovaRuntimeInvariantState): readonly string[] {
  if (!state.supplierFound) return ["supplier_missing"];

  const violations: string[] = [];
  if (!state.active) violations.push("supplier_inactive");
  if (state.ownerVendorPublicId !== NOVA_EXPECTED_OWNER_VENDOR_PUBLIC_ID) violations.push("owner_vendor_mismatch");
  if (!state.apiAuthoritativeAvailability) violations.push("availability_not_api_authoritative");
  if (state.orderForwardingEnabled) violations.push("supplier_order_forwarding_enabled");
  return violations;
}

/**
 * Runtime guard shared by the Nova catalogue and reconciliation workers.
 *
 * This intentionally fails closed if production supplier configuration drifts away
 * from the safety contract. Supplier-order forwarding is not implemented by these
 * workers, but a database flag enabling it is treated as a hard stop so a later
 * forwarding path cannot be activated silently around the running worker fleet.
 */
export async function assertNovaRuntimeInvariants(): Promise<NovaRuntimeInvariantState> {
  const result = await getProductionPostgresRuntime().nativePool.query<{
    active: boolean;
    owner_vendor_public_id: string;
    api_authoritative_availability: boolean;
    order_forwarding_enabled: boolean;
  }>(`
    SELECT ds.active,
           v.public_id AS owner_vendor_public_id,
           ds.api_authoritative_availability,
           ds.order_forwarding_enabled
      FROM public.dropship_suppliers ds
      JOIN public.vendor_businesses v ON v.id=ds.owner_vendor_id
     WHERE ds.code=$1
     LIMIT 2
  `, [NOVA_SUPPLIER_CODE]);

  const row = result.rows.length === 1 ? result.rows[0] : undefined;
  const state: NovaRuntimeInvariantState = {
    supplierFound: Boolean(row),
    active: row?.active === true,
    ownerVendorPublicId: row?.owner_vendor_public_id ?? null,
    apiAuthoritativeAvailability: row?.api_authoritative_availability === true,
    orderForwardingEnabled: row?.order_forwarding_enabled === true
  };
  const violations = result.rows.length > 1
    ? ["duplicate_supplier_configuration"]
    : novaRuntimeInvariantViolations(state);

  if (violations.length) {
    throw new Error(`Nova runtime safety invariants failed: ${violations.join(",")}`);
  }
  return state;
}
