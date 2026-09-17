import {
  DropshipCapabilityUnavailableError,
  type DropshipCapability,
  type DropshipSupplierAdapter
} from "./index.ts";

export type DropshipSupplierFeatureFlags = Readonly<{
  catalogueSyncEnabled: boolean;
  apiAuthoritativeAvailability: boolean;
  orderForwardingEnabled: boolean;
  trackingSyncEnabled: boolean;
  returnsEnabled: boolean;
  shippingQuoteEnabled: boolean;
}>;

export type DropshipSupplierRegistration = Readonly<{
  code: string;
  displayName: string;
  providerKind: string;
  active: boolean;
  adapter: DropshipSupplierAdapter;
  features: DropshipSupplierFeatureFlags;
}>;

export type DropshipSupplierSummary = Readonly<{
  code: string;
  displayName: string;
  providerKind: string;
  active: boolean;
  capabilities: readonly DropshipCapability[];
  features: DropshipSupplierFeatureFlags;
}>;

/**
 * Runtime registry for independently configured dropshipping suppliers.
 *
 * The registry deliberately separates an adapter's technical capabilities from
 * KONTA MOY feature gates. A provider may support order creation while production
 * keeps order forwarding disabled until commercial and operational acceptance is
 * complete.
 */
export class DropshipSupplierRegistry {
  readonly #suppliers = new Map<string, DropshipSupplierRegistration>();

  register(input: DropshipSupplierRegistration): this {
    const code = normalizeSupplierCode(input.code);
    const providerKind = required(input.providerKind, "dropship provider kind");
    const displayName = required(input.displayName, "dropship supplier display name");

    if (this.#suppliers.has(code)) {
      throw new Error(`Dropship supplier ${code} is already registered`);
    }
    if (input.adapter.providerKind !== providerKind) {
      throw new Error(
        `Dropship supplier ${code} provider kind mismatch: registration=${providerKind}, adapter=${input.adapter.providerKind}`
      );
    }

    this.#suppliers.set(code, Object.freeze({
      ...input,
      code,
      providerKind,
      displayName,
      features: Object.freeze({ ...input.features })
    }));
    return this;
  }

  has(code: string): boolean {
    return this.#suppliers.has(normalizeSupplierCode(code));
  }

  get(code: string): DropshipSupplierRegistration | undefined {
    return this.#suppliers.get(normalizeSupplierCode(code));
  }

  require(code: string): DropshipSupplierRegistration {
    const normalized = normalizeSupplierCode(code);
    const supplier = this.#suppliers.get(normalized);
    if (!supplier) throw new Error(`Dropship supplier ${normalized} is not registered`);
    return supplier;
  }

  list(): readonly DropshipSupplierSummary[] {
    return [...this.#suppliers.values()]
      .map((supplier) => ({
        code: supplier.code,
        displayName: supplier.displayName,
        providerKind: supplier.providerKind,
        active: supplier.active,
        capabilities: [...supplier.adapter.capabilities].sort(),
        features: supplier.features
      }))
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  capabilityEnabled(code: string, capability: DropshipCapability): boolean {
    const supplier = this.get(code);
    if (!supplier?.active) return false;
    if (!supplier.adapter.capabilities.has(capability)) return false;
    return featureGateOpen(supplier.features, capability);
  }

  requireCapability(code: string, capability: DropshipCapability): DropshipSupplierAdapter {
    const supplier = this.require(code);
    if (!supplier.active) {
      throw new DropshipCapabilityUnavailableError(capability, `Dropship supplier ${supplier.code} is inactive`);
    }
    if (!supplier.adapter.capabilities.has(capability)) {
      throw new DropshipCapabilityUnavailableError(
        capability,
        `Dropship supplier ${supplier.code} adapter does not support ${capability}`
      );
    }
    if (!featureGateOpen(supplier.features, capability)) {
      throw new DropshipCapabilityUnavailableError(
        capability,
        `Dropship supplier ${supplier.code} has ${capability} disabled by KONTA MOY configuration`
      );
    }
    return supplier.adapter;
  }
}

export function featureGateOpen(
  features: DropshipSupplierFeatureFlags,
  capability: DropshipCapability
): boolean {
  switch (capability) {
    case "catalogue": return features.catalogueSyncEnabled;
    case "availability": return features.apiAuthoritativeAvailability;
    case "create_order": return features.orderForwardingEnabled;
    case "order_status":
    case "tracking": return features.trackingSyncEnabled;
    case "cancel_order": return features.orderForwardingEnabled;
    case "returns": return features.returnsEnabled;
    case "shipping_quote": return features.shippingQuoteEnabled;
  }
}

export function normalizeSupplierCode(value: string): string {
  const code = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!code) throw new Error("dropship supplier code is required");
  return code;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
