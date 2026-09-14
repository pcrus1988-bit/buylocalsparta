import {
  buildCustomerReturnMaterializationPlan,
  buildLegacyCustomerReturnIdentity,
  type BazaarSecondLifeMaterializationPlan,
  type LegacyCustomerReturnIdentity,
} from "./bazaar-second-life-policy";

export type CustomerReturnIdentityResolution = {
  legacy: LegacyCustomerReturnIdentity;
  shared: BazaarSecondLifeMaterializationPlan;
  canonicalLookupOrder: readonly [string, string];
  offerLookupOrder: readonly [string, string];
};

/**
 * Builds the two identity envelopes a customer-return materializer must know
 * about while the first BAZAAR return implementation still exists in history.
 *
 * Lookup order is deliberately legacy-first. A replayed return that was already
 * materialised as `bazaar_return_*` must reuse that canonical / offer instead of
 * creating a second `bazaar_customer_return_*` identity for the same physical
 * returned unit. New returns can fall through to the shared second-life plan.
 *
 * This helper is pure and performs no SQL. Callers remain responsible for doing
 * the lookup and creation inside their existing serializable transaction.
 */
export function buildCustomerReturnIdentityResolution(input: {
  returnUuid: string;
  orderLineUuid: string;
  baseSlug: string;
  baseVendorSku: string;
  originalCanonicalId: string;
  originalOfferId?: string;
  metadata?: Record<string, unknown>;
}): CustomerReturnIdentityResolution {
  const legacy = buildLegacyCustomerReturnIdentity({
    returnUuid: input.returnUuid,
    orderLineUuid: input.orderLineUuid,
    baseSlug: input.baseSlug,
    baseVendorSku: input.baseVendorSku,
  });

  const shared = buildCustomerReturnMaterializationPlan({
    returnUuid: input.returnUuid,
    orderLineUuid: input.orderLineUuid,
    baseSlug: input.baseSlug,
    baseVendorSku: input.baseVendorSku,
    originalCanonicalId: input.originalCanonicalId,
    originalOfferId: input.originalOfferId,
    metadata: input.metadata,
  });

  return {
    legacy,
    shared,
    canonicalLookupOrder: [legacy.canonicalPublicId, shared.identity.canonicalPublicId],
    offerLookupOrder: [legacy.offerPublicId, shared.identity.offerPublicId],
  };
}

export function isResolvedCustomerReturnCanonical(input: {
  publicId: string;
  commerceChannel: string;
  bazaarSource: string | null | undefined;
  condition: string;
  resolution: CustomerReturnIdentityResolution;
}): boolean {
  return input.resolution.canonicalLookupOrder.includes(input.publicId)
    && input.commerceChannel === "bazaar"
    && input.bazaarSource === "customer_return"
    && input.condition === "open_box";
}

export function isResolvedCustomerReturnOffer(input: {
  publicId: string;
  commerceChannel: string;
  bazaarSource: string | null | undefined;
  resolution: CustomerReturnIdentityResolution;
}): boolean {
  return input.resolution.offerLookupOrder.includes(input.publicId)
    && input.commerceChannel === "bazaar"
    && input.bazaarSource === "customer_return";
}
