export const BAZAAR_SOURCES = [
  "supplier_preloved",
  "supplier_preowned_defect",
  "supplier_tester",
  "customer_return",
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated",
] as const;

export type BazaarSource = (typeof BAZAAR_SOURCES)[number];

export const INTERNAL_SECOND_LIFE_SOURCES = [
  "customer_return",
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated",
] as const satisfies readonly BazaarSource[];

export type InternalSecondLifeSource = (typeof INTERNAL_SECOND_LIFE_SOURCES)[number];

export const BAZAAR_CONDITIONS = [
  "refurbished",
  "used",
  "preloved",
  "preowned_defect",
  "open_box",
] as const;

export type BazaarCondition = (typeof BAZAAR_CONDITIONS)[number];

export const INTERNAL_SECOND_LIFE_CONDITIONS = [
  "refurbished",
  "used",
  "open_box",
] as const satisfies readonly BazaarCondition[];

export type InternalSecondLifeCondition = (typeof INTERNAL_SECOND_LIFE_CONDITIONS)[number];

const BAZAAR_SOURCE_SET = new Set<string>(BAZAAR_SOURCES);
const INTERNAL_SECOND_LIFE_SOURCE_SET = new Set<string>(INTERNAL_SECOND_LIFE_SOURCES);
const BAZAAR_CONDITION_SET = new Set<string>(BAZAAR_CONDITIONS);
const INTERNAL_SECOND_LIFE_CONDITION_SET = new Set<string>(INTERNAL_SECOND_LIFE_CONDITIONS);

export function isBazaarSource(value: unknown): value is BazaarSource {
  return typeof value === "string" && BAZAAR_SOURCE_SET.has(value);
}

export function isInternalSecondLifeSource(value: unknown): value is InternalSecondLifeSource {
  return typeof value === "string" && INTERNAL_SECOND_LIFE_SOURCE_SET.has(value);
}

export function isBazaarCondition(value: unknown): value is BazaarCondition {
  return typeof value === "string" && BAZAAR_CONDITION_SET.has(value);
}

export function isInternalSecondLifeCondition(value: unknown): value is InternalSecondLifeCondition {
  return typeof value === "string" && INTERNAL_SECOND_LIFE_CONDITION_SET.has(value);
}

export function assertBazaarSecondLifeMaterialization(input: {
  source: unknown;
  condition: unknown;
}): asserts input is { source: InternalSecondLifeSource; condition: InternalSecondLifeCondition } {
  if (!isInternalSecondLifeSource(input.source)) {
    throw new Error("Invalid internal BAZAAR second-life source");
  }
  if (!isInternalSecondLifeCondition(input.condition)) {
    throw new Error("Invalid internal BAZAAR second-life condition");
  }
}

/**
 * Stable namespace used by second-life ingestion flows when deriving
 * canonical / offer identities. The source is part of the identity so an
 * open-box item can never silently reuse a customer-return/display-stock
 * canonical even when both originate from the same normal product.
 */
export function bazaarSecondLifeIdentityNamespace(input: {
  source: InternalSecondLifeSource;
  provenanceRef: string;
}): string {
  const provenanceRef = input.provenanceRef.trim();
  if (!provenanceRef) throw new Error("BAZAAR second-life provenance reference is required");
  return `${input.source}:${provenanceRef}`;
}

function stableIdentityToken(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

function sourceToken(source: InternalSecondLifeSource): string {
  return source.replaceAll("_", "-");
}

export type BazaarSecondLifeIdentity = {
  source: InternalSecondLifeSource;
  condition: InternalSecondLifeCondition;
  provenanceNamespace: string;
  identityToken: string;
  canonicalPublicId: string;
  offerPublicId: string;
  slug: string;
  vendorSku: string;
};

/**
 * Derives the complete stable identity envelope for internally materialised
 * BAZAAR inventory. Source + provenance are always part of the identity,
 * preventing returns/open-box/display-stock/damaged-packaging stock from
 * collapsing into one another or into normal catalogue identity.
 */
export function buildBazaarSecondLifeIdentity(input: {
  source: unknown;
  condition: unknown;
  provenanceRef: string;
  baseSlug: string;
  baseVendorSku: string;
}): BazaarSecondLifeIdentity {
  assertBazaarSecondLifeMaterialization(input);

  const provenanceNamespace = bazaarSecondLifeIdentityNamespace({
    source: input.source,
    provenanceRef: input.provenanceRef,
  });
  const identityToken = stableIdentityToken(provenanceNamespace);
  const source = sourceToken(input.source);
  const baseSlug = input.baseSlug.trim().replace(/-+$/g, "");
  const baseVendorSku = input.baseVendorSku.trim();
  if (!baseSlug) throw new Error("BAZAAR second-life base slug is required");
  if (!baseVendorSku) throw new Error("BAZAAR second-life base vendor SKU is required");

  return {
    source: input.source,
    condition: input.condition,
    provenanceNamespace,
    identityToken,
    canonicalPublicId: `bazaar_${input.source}_${identityToken}`,
    offerPublicId: `offer_bazaar_${input.source}_${identityToken}`,
    slug: `${baseSlug}-bazaar-${source}-${identityToken}`,
    vendorSku: `${baseVendorSku}-BAZAAR-${input.source.toUpperCase()}-${identityToken}`,
  };
}

export type BazaarSecondLifeMaterializationPlan = {
  commerceChannel: "bazaar";
  source: InternalSecondLifeSource;
  condition: InternalSecondLifeCondition;
  identity: BazaarSecondLifeIdentity;
  canonicalProvenance: {
    source: InternalSecondLifeSource;
    provenanceRef: string;
    provenanceNamespace: string;
    originalCanonicalId: string;
    originalOfferId?: string;
    metadata: Record<string, unknown>;
  };
  offerSourcePayload: {
    bazaarSource: InternalSecondLifeSource;
    bazaarProvenanceRef: string;
    bazaarProvenanceNamespace: string;
    originalCanonicalId: string;
    originalOfferId?: string;
    metadata: Record<string, unknown>;
  };
};

/**
 * Produces the channel-safe application contract consumed by second-life
 * materializers. The plan deliberately contains no SQL so returns, open-box,
 * display-stock and damaged-packaging flows can share the same identity and
 * provenance rules while keeping their own transactional orchestration.
 */
export function buildBazaarSecondLifeMaterializationPlan(input: {
  source: unknown;
  condition: unknown;
  provenanceRef: string;
  baseSlug: string;
  baseVendorSku: string;
  originalCanonicalId: string;
  originalOfferId?: string;
  metadata?: Record<string, unknown>;
}): BazaarSecondLifeMaterializationPlan {
  const identity = buildBazaarSecondLifeIdentity(input);
  const originalCanonicalId = input.originalCanonicalId.trim();
  const originalOfferId = input.originalOfferId?.trim() || undefined;
  if (!originalCanonicalId) throw new Error("BAZAAR second-life original canonical ID is required");

  const metadata = { ...(input.metadata ?? {}) };
  const provenanceRef = input.provenanceRef.trim();

  return {
    commerceChannel: "bazaar",
    source: identity.source,
    condition: identity.condition,
    identity,
    canonicalProvenance: {
      source: identity.source,
      provenanceRef,
      provenanceNamespace: identity.provenanceNamespace,
      originalCanonicalId,
      originalOfferId,
      metadata,
    },
    offerSourcePayload: {
      bazaarSource: identity.source,
      bazaarProvenanceRef: provenanceRef,
      bazaarProvenanceNamespace: identity.provenanceNamespace,
      originalCanonicalId,
      originalOfferId,
      metadata,
    },
  };
}

export type LegacyCustomerReturnIdentity = {
  canonicalPublicId: string;
  offerPublicId: string;
  slug: string;
  vendorSku: string;
};

function customerReturnIdentityPart(value: string, field: string): string {
  const normalized = value.trim().replaceAll("-", "");
  if (!normalized) throw new Error(`Customer-return ${field} is required`);
  return normalized.slice(0, 12);
}

/**
 * Canonical provenance reference for customer-return materialization. Keep the
 * complete return and order-line identifiers here; the shared identity layer
 * hashes the namespace into compact public IDs without losing source identity.
 */
export function customerReturnProvenanceRef(input: {
  returnUuid: string;
  orderLineUuid: string;
}): string {
  const returnUuid = input.returnUuid.trim();
  const orderLineUuid = input.orderLineUuid.trim();
  if (!returnUuid) throw new Error("Customer-return return UUID is required");
  if (!orderLineUuid) throw new Error("Customer-return order-line UUID is required");
  return `${returnUuid}:${orderLineUuid}`;
}

/**
 * Reproduces the pre-shared-policy identity used by the first BAZAAR customer
 * return implementation. Materializers should probe this identity before
 * creating the new shared-policy identity so replays cannot duplicate stock
 * that was already materialised by an older deployment.
 */
export function buildLegacyCustomerReturnIdentity(input: {
  returnUuid: string;
  orderLineUuid: string;
  baseSlug: string;
  baseVendorSku: string;
}): LegacyCustomerReturnIdentity {
  const identitySuffix = `${customerReturnIdentityPart(input.returnUuid, "return UUID")}_${customerReturnIdentityPart(input.orderLineUuid, "order-line UUID")}`;
  const baseSlug = input.baseSlug.trim().replace(/-+$/g, "");
  const baseVendorSku = input.baseVendorSku.trim();
  if (!baseSlug) throw new Error("Customer-return base slug is required");
  if (!baseVendorSku) throw new Error("Customer-return base vendor SKU is required");

  return {
    canonicalPublicId: `bazaar_return_${identitySuffix}`,
    offerPublicId: `offer_bazaar_return_${identitySuffix}`,
    slug: `${baseSlug}-return-${identitySuffix}`,
    vendorSku: `${baseVendorSku}-RETURN-${identitySuffix}`,
  };
}

/**
 * Customer-return specialization of the generic second-life plan. This locks
 * returns to the BAZAAR channel, `customer_return` provenance and `open_box`
 * condition while leaving SQL/transaction orchestration to the caller.
 */
export function buildCustomerReturnMaterializationPlan(input: {
  returnUuid: string;
  orderLineUuid: string;
  baseSlug: string;
  baseVendorSku: string;
  originalCanonicalId: string;
  originalOfferId?: string;
  metadata?: Record<string, unknown>;
}): BazaarSecondLifeMaterializationPlan {
  return buildBazaarSecondLifeMaterializationPlan({
    source: "customer_return",
    condition: "open_box",
    provenanceRef: customerReturnProvenanceRef(input),
    baseSlug: input.baseSlug,
    baseVendorSku: input.baseVendorSku,
    originalCanonicalId: input.originalCanonicalId,
    originalOfferId: input.originalOfferId,
    metadata: input.metadata,
  });
}

export const INTERNAL_SECOND_LIFE_DEFAULT_CONDITION = {
  customer_return: "open_box",
  open_box: "open_box",
  display_stock: "open_box",
  damaged_packaging: "open_box",
  admin_curated: "used",
} as const satisfies Record<InternalSecondLifeSource, InternalSecondLifeCondition>;

export type NonReturnSecondLifeSource = Exclude<InternalSecondLifeSource, "customer_return">;

export type BazaarSecondLifeSourcePlanInput = {
  provenanceRef: string;
  baseSlug: string;
  baseVendorSku: string;
  originalCanonicalId: string;
  originalOfferId?: string;
  metadata?: Record<string, unknown>;
  condition?: InternalSecondLifeCondition;
};

/**
 * Entry point for future internal BAZAAR intake flows that do not originate
 * from a customer return. Each source is forced through the dedicated BAZAAR
 * commerce channel and a source-specific provenance namespace, while callers
 * may refine the default second-life condition when inspection supports it.
 */
export function buildBazaarInternalSourceMaterializationPlan(
  source: NonReturnSecondLifeSource,
  input: BazaarSecondLifeSourcePlanInput,
): BazaarSecondLifeMaterializationPlan {
  const condition = input.condition ?? INTERNAL_SECOND_LIFE_DEFAULT_CONDITION[source];
  return buildBazaarSecondLifeMaterializationPlan({
    source,
    condition,
    provenanceRef: input.provenanceRef,
    baseSlug: input.baseSlug,
    baseVendorSku: input.baseVendorSku,
    originalCanonicalId: input.originalCanonicalId,
    originalOfferId: input.originalOfferId,
    metadata: input.metadata,
  });
}

export function buildOpenBoxMaterializationPlan(
  input: BazaarSecondLifeSourcePlanInput,
): BazaarSecondLifeMaterializationPlan {
  return buildBazaarInternalSourceMaterializationPlan("open_box", input);
}

export function buildDisplayStockMaterializationPlan(
  input: BazaarSecondLifeSourcePlanInput,
): BazaarSecondLifeMaterializationPlan {
  return buildBazaarInternalSourceMaterializationPlan("display_stock", input);
}

export function buildDamagedPackagingMaterializationPlan(
  input: BazaarSecondLifeSourcePlanInput,
): BazaarSecondLifeMaterializationPlan {
  return buildBazaarInternalSourceMaterializationPlan("damaged_packaging", input);
}

export function buildAdminCuratedMaterializationPlan(
  input: BazaarSecondLifeSourcePlanInput,
): BazaarSecondLifeMaterializationPlan {
  return buildBazaarInternalSourceMaterializationPlan("admin_curated", input);
}
