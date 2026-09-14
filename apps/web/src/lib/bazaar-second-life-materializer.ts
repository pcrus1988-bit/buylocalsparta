import type { SqlRow } from "@buy-local-sparta/core";
import type { BazaarSecondLifeMaterializationPlan } from "./bazaar-second-life-policy";

type QueryResult<T extends SqlRow> = {
  rowCount: number;
  rows: T[];
};

/**
 * Minimal structural transaction contract used by the BAZAAR materializer.
 * Callers must pass the transaction they already own; this helper never opens
 * or commits a transaction itself, so canonical + offer + inventory creation
 * remain atomic with the surrounding intake workflow.
 */
export type BazaarSecondLifeTransaction = {
  query<T extends SqlRow = SqlRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
};

export type BazaarSecondLifeMaterializerInput = {
  plan: BazaarSecondLifeMaterializationPlan;
  marketUuid: string;
  vendorUuid: string;
  locationUuid: string;
  familyUuid?: string;
  brandUuid?: string;
  categoryUuid?: string;
  gtin?: string;
  mpn?: string;
  model?: string;
  sourceGtin?: string;
  warrantyBasis?: string;
  canonicalVariantAttributes?: Record<string, unknown>;
  sourcePayload?: Record<string, unknown>;
  canonicalPriceMinor: number;
  canonicalCurrency: string;
  canonicalTaxRateBps: number;
  canonicalActive: boolean;
  canonicalSuppressed: boolean;
  canonicalRecalled: boolean;
  supplierUnitPriceMinor: number;
  offerCurrency: string;
  supplierTaxRateBps: number;
  costCeilingMinor?: number;
  leadTimeMinutes?: number;
  fulfilmentModes: unknown;
  adviceCapabilities?: Record<string, unknown>;
  customerPriceMinor?: number;
  now: Date;
};

export type BazaarSecondLifeMaterializationResult = {
  canonicalUuid: string;
  canonicalPublicId: string;
  offerUuid: string;
  offerPublicId: string;
};

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`BAZAAR second-life ${field} is required`);
  return normalized;
}

function assertMinorAmount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid BAZAAR second-life ${field}`);
  }
  return value;
}

function assertBps(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
    throw new Error(`Invalid BAZAAR second-life ${field}`);
  }
  return value;
}

function assertCanonicalBoundary(row: SqlRow, plan: BazaarSecondLifeMaterializationPlan): void {
  if (row.public_id !== plan.identity.canonicalPublicId) {
    throw new Error("BAZAAR second-life canonical public ID mismatch");
  }
  if (row.commerce_channel !== plan.commerceChannel) {
    throw new Error("BAZAAR second-life canonical escaped the bazaar channel");
  }
  if (row.bazaar_source !== plan.source) {
    throw new Error("BAZAAR second-life canonical source mismatch");
  }
  if (row.condition !== plan.condition) {
    throw new Error("BAZAAR second-life canonical condition mismatch");
  }
}

function assertOfferBoundary(
  row: SqlRow,
  plan: BazaarSecondLifeMaterializationPlan,
  canonicalUuid: string,
): void {
  if (row.public_id !== plan.identity.offerPublicId) {
    throw new Error("BAZAAR second-life offer public ID mismatch");
  }
  if (row.canonical_uuid !== canonicalUuid) {
    throw new Error("BAZAAR second-life offer canonical mismatch");
  }
  if (row.commerce_channel !== plan.commerceChannel) {
    throw new Error("BAZAAR second-life offer escaped the bazaar channel");
  }
  if (row.bazaar_source !== plan.source) {
    throw new Error("BAZAAR second-life offer source mismatch");
  }
}

/**
 * Idempotently materializes one internally sourced second-life item into the
 * dedicated BAZAAR catalogue. This helper deliberately accepts an existing
 * transaction so future return/open-box/display-stock/damaged-packaging flows
 * can share the same persistence path without weakening their own locking or
 * orchestration semantics.
 *
 * Identity is supplied exclusively by BazaarSecondLifeMaterializationPlan,
 * whose source-specific provenance namespace prevents canonical merging with
 * normal/new inventory and with other second-life source types.
 */
export async function materializeBazaarSecondLifeInventory(
  tx: BazaarSecondLifeTransaction,
  input: BazaarSecondLifeMaterializerInput,
): Promise<BazaarSecondLifeMaterializationResult> {
  const { plan } = input;
  if (plan.commerceChannel !== "bazaar") {
    throw new Error("BAZAAR second-life materializer only accepts bazaar plans");
  }
  if (plan.condition === ("new" as never)) {
    throw new Error("BAZAAR second-life materializer cannot create new-condition inventory");
  }

  const marketUuid = requiredText(input.marketUuid, "market UUID");
  const vendorUuid = requiredText(input.vendorUuid, "vendor UUID");
  const locationUuid = requiredText(input.locationUuid, "location UUID");
  const canonicalCurrency = requiredText(input.canonicalCurrency, "canonical currency");
  const offerCurrency = requiredText(input.offerCurrency, "offer currency");
  const canonicalPriceMinor = assertMinorAmount(input.canonicalPriceMinor, "canonical price");
  const supplierUnitPriceMinor = assertMinorAmount(input.supplierUnitPriceMinor, "supplier unit price");
  const canonicalTaxRateBps = assertBps(input.canonicalTaxRateBps, "canonical tax rate");
  const supplierTaxRateBps = assertBps(input.supplierTaxRateBps, "supplier tax rate");

  const canonicalAttributes = {
    ...(input.canonicalVariantAttributes ?? {}),
    bazaarProvenance: plan.canonicalProvenance,
  };

  await tx.query(
    `INSERT INTO canonical_variants(
      public_id,market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,variant_attributes,warranty_basis,
      platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled,commerce_channel,bazaar_source,price_updated_at,updated_at
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21
    ) ON CONFLICT (public_id) DO NOTHING`,
    [
      plan.identity.canonicalPublicId,
      marketUuid,
      input.familyUuid ?? null,
      input.brandUuid ?? null,
      input.categoryUuid ?? null,
      plan.identity.slug,
      input.gtin ?? null,
      input.mpn ?? null,
      input.model ?? null,
      plan.condition,
      JSON.stringify(canonicalAttributes),
      input.warrantyBasis ?? null,
      canonicalPriceMinor,
      canonicalCurrency,
      canonicalTaxRateBps,
      input.canonicalActive,
      input.canonicalSuppressed,
      input.canonicalRecalled,
      plan.commerceChannel,
      plan.source,
      input.now,
    ],
  );

  const canonical = await tx.query<SqlRow>(
    `SELECT id::text AS canonical_uuid,public_id,commerce_channel,bazaar_source,condition
     FROM canonical_variants WHERE public_id=$1 FOR UPDATE`,
    [plan.identity.canonicalPublicId],
  );
  if (!canonical.rowCount) throw new Error("BAZAAR second-life canonical creation failed");
  assertCanonicalBoundary(canonical.rows[0], plan);
  const canonicalUuid = requiredText(String(canonical.rows[0].canonical_uuid ?? ""), "canonical UUID");

  const offerSourcePayload = {
    ...(input.sourcePayload ?? {}),
    ...plan.offerSourcePayload,
  };

  await tx.query(
    `INSERT INTO vendor_offers(
      public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,source_gtin,status,supplier_unit_price_minor,currency,
      supplier_tax_rate_bps,cost_ceiling_minor,lead_time_minutes,fulfilment_modes,advice_capabilities,source_payload,approved_at,
      customer_price_minor,merchant_visible,merchant_pause_active,updated_at
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,true,false,$16
    ) ON CONFLICT (public_id) DO NOTHING`,
    [
      plan.identity.offerPublicId,
      marketUuid,
      vendorUuid,
      locationUuid,
      canonicalUuid,
      plan.identity.vendorSku,
      input.sourceGtin ?? null,
      supplierUnitPriceMinor,
      offerCurrency,
      supplierTaxRateBps,
      input.costCeilingMinor ?? null,
      input.leadTimeMinutes ?? null,
      input.fulfilmentModes,
      JSON.stringify(input.adviceCapabilities ?? {}),
      JSON.stringify(offerSourcePayload),
      input.now,
      input.customerPriceMinor ?? null,
    ],
  );

  const offer = await tx.query<SqlRow>(
    `SELECT vo.id::text AS offer_uuid,vo.public_id,vo.canonical_variant_id::text AS canonical_uuid,cv.commerce_channel,cv.bazaar_source
     FROM vendor_offers vo
     JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
     WHERE vo.public_id=$1 FOR UPDATE OF vo`,
    [plan.identity.offerPublicId],
  );
  if (!offer.rowCount) throw new Error("BAZAAR second-life offer creation failed");
  assertOfferBoundary(offer.rows[0], plan, canonicalUuid);
  const offerUuid = requiredText(String(offer.rows[0].offer_uuid ?? ""), "offer UUID");

  await tx.query(
    `INSERT INTO inventory_balances(
      offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,updated_at,
      stock_confirmed_at,freshness_ttl_seconds,freshness_status
    ) VALUES($1,0,0,0,0,$2,'merchant_confirmed',$3,$3,86400,'fresh')
    ON CONFLICT (offer_id) DO NOTHING`,
    [offerUuid, plan.source, input.now],
  );

  return {
    canonicalUuid,
    canonicalPublicId: plan.identity.canonicalPublicId,
    offerUuid,
    offerPublicId: plan.identity.offerPublicId,
  };
}
