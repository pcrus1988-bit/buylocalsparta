export const DEFAULT_MANAGED_MARKET_ID = "sparta" as const;

export type VendorOperatingModel = "MANAGED" | "SELF_GOVERNED";

export type VendorCapability =
  | "shop.read"
  | "shop.manage"
  | "catalogue.read"
  | "catalogue.submit"
  | "catalogue.import"
  | "offer.manage"
  | "pricing.manage"
  | "inventory.manage"
  | "orders.read"
  | "orders.manage"
  | "fulfilment.manage"
  | "pickup.manage"
  | "shipping.manage"
  | "local_delivery.manage"
  | "aade.manage"
  | "finance.read"
  | "ask_local.manage"
  | "customer_messages.manage"
  | "promotions.manage"
  | "seo.guidance.read"
  | "seo.source_data.manage"
  | "analytics.read"
  | "compliance.submit"
  | "staff.manage"
  | "subscription.manage";

/**
 * Platform-governance powers intentionally live outside VendorCapability.
 * A vendor operating context can therefore never grant these by accident.
 */
export const PLATFORM_GOVERNANCE_BOUNDARIES = [
  "canonical.identity.manage",
  "canonical.merge",
  "canonical.dedupe",
  "fair_exposure.manage",
  "vendor.eligibility.manage",
  "market.activation.manage",
  "market.geography.manage",
  "seo.canonical.manage",
  "seo.indexing.manage",
  "seo.sitemap.manage",
  "seo.structured_data.manage",
  "safety.hold.manage",
  "safety.recall.manage",
  "platform_finance.ledger.manage",
  "platform_finance.settlement_rules.manage",
  "disputes.final_decision",
  "campaigns.platform.manage",
  "vendor.suspension.manage",
  "fraud.manage"
] as const;

export type PlatformGovernanceBoundary = typeof PLATFORM_GOVERNANCE_BOUNDARIES[number];

const MANAGED_CAPABILITIES = [
  "shop.read",
  "catalogue.read",
  "catalogue.submit",
  "inventory.manage",
  "orders.read",
  "orders.manage",
  "fulfilment.manage",
  "pickup.manage",
  "finance.read",
  "seo.guidance.read",
  "analytics.read",
  "compliance.submit"
] as const satisfies readonly VendorCapability[];

const SELF_GOVERNED_EXTRA_CAPABILITIES = [
  "shop.manage",
  "catalogue.import",
  "offer.manage",
  "pricing.manage",
  "shipping.manage",
  "local_delivery.manage",
  "aade.manage",
  "ask_local.manage",
  "customer_messages.manage",
  "promotions.manage",
  "seo.source_data.manage",
  "staff.manage",
  "subscription.manage"
] as const satisfies readonly VendorCapability[];

export type VendorOperatingContext = Readonly<{
  vendorId: string;
  marketId: string;
  hubId?: string;
  locationId?: string;
  operatingModel: VendorOperatingModel;
  roles: readonly string[];
  capabilities: readonly VendorCapability[];
}>;

export type VendorOperatingAssignment = Readonly<{
  marketId?: string;
  hubId?: string;
  locationId?: string;
  operatingModel?: VendorOperatingModel;
}>;

export function capabilitiesForVendorOperatingModel(model: VendorOperatingModel): readonly VendorCapability[] {
  return model === "SELF_GOVERNED"
    ? [...MANAGED_CAPABILITIES, ...SELF_GOVERNED_EXTRA_CAPABILITIES]
    : [...MANAGED_CAPABILITIES];
}

export function buildVendorOperatingContext(input: {
  vendorId: string;
  marketId?: string;
  hubId?: string;
  locationId?: string;
  operatingModel?: VendorOperatingModel;
  roles?: readonly string[];
}): VendorOperatingContext {
  const vendorId = requiredScopeValue(input.vendorId, "vendorId");
  const operatingModel = input.operatingModel ?? "MANAGED";
  const marketId = operatingModel === "SELF_GOVERNED"
    ? requiredScopeValue(input.marketId ?? "", "marketId")
    : requiredScopeValue(input.marketId ?? DEFAULT_MANAGED_MARKET_ID, "marketId");
  const hubId = optionalScopeValue(input.hubId);
  const locationId = optionalScopeValue(input.locationId);
  return {
    vendorId,
    marketId,
    ...(hubId ? { hubId } : {}),
    ...(locationId ? { locationId } : {}),
    operatingModel,
    roles: [...(input.roles ?? [])],
    capabilities: capabilitiesForVendorOperatingModel(operatingModel)
  };
}

/**
 * Converts an authenticated vendor principal plus an explicit persisted assignment into the
 * operating context consumed by backend services. Self-governed scope is never inferred from
 * shop/profile data and can never fall back to Sparta.
 */
export function buildVendorOperatingContextFromSession(
  principal: { vendorId?: string; roles: readonly string[] },
  assignment: VendorOperatingAssignment = {}
): VendorOperatingContext {
  const vendorId = requiredScopeValue(principal.vendorId ?? "", "principal.vendorId");
  if (!principal.roles.some(isVendorStaffRole)) throw new Error("Vendor staff role is required");
  return buildVendorOperatingContext({
    vendorId,
    ...assignment,
    roles: principal.roles
  });
}

export function hasVendorCapability(context: VendorOperatingContext, capability: VendorCapability): boolean {
  return context.capabilities.includes(capability);
}

export function assertVendorCapability(context: VendorOperatingContext, capability: VendorCapability): void {
  if (!hasVendorCapability(context, capability)) throw new Error(`Vendor capability denied: ${capability}`);
}

/**
 * Backend/service-layer scope assertion. UI filtering is never sufficient for vendor isolation.
 * Resource scope may be narrower than the current context, but it may never point at another
 * vendor, market, hub or location.
 */
export function assertVendorResourceScope(
  context: VendorOperatingContext,
  resource: { vendorId: string; marketId?: string; hubId?: string; locationId?: string }
): void {
  if (requiredScopeValue(resource.vendorId, "resource.vendorId") !== context.vendorId) throw new Error("Vendor resource access denied");
  if (resource.marketId != null && requiredScopeValue(resource.marketId, "resource.marketId") !== context.marketId) throw new Error("Vendor market access denied");
  if (resource.hubId != null && requiredScopeValue(resource.hubId, "resource.hubId") !== context.hubId) throw new Error("Vendor hub access denied");
  if (resource.locationId != null && requiredScopeValue(resource.locationId, "resource.locationId") !== context.locationId) throw new Error("Vendor location access denied");
}

function isVendorStaffRole(role: string): boolean {
  return role.startsWith("vendor_");
}

function requiredScopeValue(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function optionalScopeValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
