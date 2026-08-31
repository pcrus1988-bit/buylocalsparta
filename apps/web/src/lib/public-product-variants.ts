import type { SqlRow } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicProductVariantAttribute = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type PublicProductVariantOption = Readonly<{
  canonicalVariantId: string;
  slug: string;
  attributes: readonly PublicProductVariantAttribute[];
  available: boolean;
  fromPriceMinor?: number;
}>;

type VariantOptionRow = SqlRow & {
  canonical_public_id: string;
  slug: string;
  variant_attributes: unknown;
  from_price_minor: string | number | null;
  available: boolean;
};

const VARIANT_ATTRIBUTE_LABELS: Readonly<Record<string, string>> = {
  color: "Χρώμα",
  colour: "Χρώμα",
  size: "Μέγεθος",
  sizes: "Μέγεθος",
  capacity: "Χωρητικότητα",
  capacity_l: "Χωρητικότητα",
  voltage: "Τάση",
  voltage_v: "Τάση",
  voltage_family: "Οικογένεια τάσης",
  length: "Μήκος",
  width: "Πλάτος",
  height: "Ύψος",
  diameter: "Διάμετρος",
  material: "Υλικό",
  pack_qty: "Ποσότητα"
};

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function humanizeKey(key: string): string {
  return VARIANT_ATTRIBUTE_LABELS[key] ?? key
    .replaceAll("_", " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("el"));
}

function displayValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((entry): entry is string => Boolean(entry));
    return values.length ? [...new Set(values)].join(" · ") : undefined;
  }
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (typeof value === "object") return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function variantAttributes(value: unknown): readonly PublicProductVariantAttribute[] {
  return Object.entries(objectValue(value))
    .map(([key, rawValue]) => {
      const value = displayValue(rawValue);
      return value ? { key, label: humanizeKey(key), value } : undefined;
    })
    .filter((entry): entry is PublicProductVariantAttribute => Boolean(entry))
    .slice(0, 8);
}

function safePriceMinor(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Read-only family projection for the product-page variant chooser.
 *
 * This deliberately does not invoke Fair Vendor Assignment for sibling variants:
 * merely viewing a selector must not create sticky assignments or exposure events
 * for products the customer has not chosen. The displayed sibling price is therefore
 * an explicit "from" price across currently eligible local offers. Once a sibling is
 * selected, its own product page resolves the customer's normal sticky assigned offer
 * and exact purchasable price.
 */
export const getPublicProductVariantOptions = cache(async (
  canonicalVariantId: string
): Promise<readonly PublicProductVariantOption[]> => {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured()) return [];

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<VariantOptionRow>(`
      WITH current_variant AS (
        SELECT cv.family_id
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        WHERE cv.public_id=$1
          AND m.code='sparta'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
        LIMIT 1
      )
      SELECT sibling.public_id AS canonical_public_id,
             sibling.slug,
             sibling.variant_attributes,
             eligible.from_price_minor,
             (eligible.from_price_minor IS NOT NULL) AS available
      FROM canonical_variants sibling
      JOIN markets m ON m.id=sibling.market_id
      JOIN current_variant current
        ON current.family_id IS NOT NULL
       AND sibling.family_id=current.family_id
      LEFT JOIN LATERAL (
        SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor
        FROM vendor_offers vo
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE vo.canonical_variant_id=sibling.id
          AND vo.status='approved'
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
      ) eligible ON true
      WHERE m.code='sparta'
        AND sibling.active=true
        AND sibling.suppressed=false
        AND sibling.recalled=false
      ORDER BY sibling.slug
      LIMIT 100
    `, [canonicalId]);

    return result.rows.map((row) => ({
      canonicalVariantId: String(row.canonical_public_id),
      slug: String(row.slug),
      attributes: variantAttributes(row.variant_attributes),
      available: Boolean(row.available),
      fromPriceMinor: safePriceMinor(row.from_price_minor)
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_variant_options_failed",
      canonicalVariantId: canonicalId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
});
