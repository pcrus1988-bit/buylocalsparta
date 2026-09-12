import { normalizeSearchText } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages } from "./public-media-service";

export type BazaarCondition = "preloved" | "preowned_defect" | "open_box" | "new" | "refurbished" | "used";
export type BazaarSource =
  | "supplier_preloved"
  | "supplier_preowned_defect"
  | "customer_return"
  | "open_box"
  | "display_stock"
  | "damaged_packaging"
  | "admin_curated";

export type BazaarCard = Readonly<{
  id: string;
  slug: string;
  title: string;
  description?: string;
  categoryCode: string;
  brand?: string;
  condition: BazaarCondition;
  bazaarSource?: BazaarSource;
  priceMinor: number;
  msrpMinor?: number;
  savingsPercent?: number;
  availableToSell: number;
  vendorId: string;
  vendorName: string;
  mediaId?: string;
  mediaAlt?: string;
}>;

type BazaarRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  description: string | null;
  category_code: string;
  brand_name: string | null;
  condition: string;
  bazaar_source: string | null;
  customer_price_minor: number | string;
  msrp_minor: number | string | null;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
}>;

export type BazaarFilters = Readonly<{
  query?: string;
  condition?: string;
  source?: string;
  brand?: string;
  category?: string;
  limit?: number;
  slugOrId?: string;
}>;

const BAZAAR_SOURCES: readonly BazaarSource[] = [
  "supplier_preloved",
  "supplier_preowned_defect",
  "customer_return",
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated"
] as const;

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function savingsPercent(msrpMinor: number | undefined, priceMinor: number): number | undefined {
  if (!msrpMinor || msrpMinor <= priceMinor || priceMinor <= 0) return undefined;
  return Math.round(((msrpMinor - priceMinor) / msrpMinor) * 100);
}

function normalizeCondition(value: string): BazaarCondition {
  if (["preloved", "preowned_defect", "open_box", "new", "refurbished", "used"].includes(value)) {
    return value as BazaarCondition;
  }
  return "used";
}

function normalizeBazaarSource(value: string | null): BazaarSource | undefined {
  return value && BAZAAR_SOURCES.includes(value as BazaarSource) ? value as BazaarSource : undefined;
}

/**
 * Dedicated BAZAAR read model.
 *
 * It intentionally has no hub/postcode predicate: BAZAAR is a Greece-wide discovery
 * channel. Normal marketplace discovery never calls this function. Publication and
 * stock safety still apply at item/offer level.
 */
export async function getBazaarCatalog(filters: BazaarFilters = {}): Promise<readonly BazaarCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const limit = Math.max(1, Math.min(500, Number.isSafeInteger(filters.limit) ? Number(filters.limit) : 240));
  const slugOrId = filters.slugOrId?.trim() || null;
  const result = await getProductionPostgresRuntime().nativePool.query<BazaarRow>(`
    SELECT DISTINCT ON (cv.id)
      cv.public_id AS canonical_public_id,
      cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      COALESCE(el.description,en.description) AS description,
      c.code AS category_code,
      b.name AS brand_name,
      cv.condition,
      cv.bazaar_source,
      vo.customer_price_minor,
      vo.msrp_minor,
      CASE
        WHEN dso.id IS NOT NULL THEN GREATEST(COALESCE(dso.cached_quantity,1),0)
        ELSE GREATEST(0,COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0))
      END AS available_to_sell,
      v.public_id AS vendor_public_id,
      v.trading_name AS vendor_name
    FROM canonical_variants cv
    JOIN categories c ON c.id=cv.category_id
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    LEFT JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
    LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
    WHERE cv.commerce_channel='bazaar'
      AND ($2::text IS NULL OR cv.slug=$2 OR cv.public_id=$2)
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND v.status='active'
      AND l.active=true
      AND (
        (
          dso.id IS NOT NULL
          AND dso.active=true
          AND ds.active=true
          AND ds.api_authoritative_availability=true
          AND dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        )
        OR (
          dso.id IS NULL
          AND GREATEST(0,COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0))>0
        )
      )
    ORDER BY cv.id,vo.customer_price_minor ASC,vo.updated_at DESC,vo.public_id
    LIMIT $1
  `,[limit,slugOrId]);

  const query = normalizeSearchText(filters.query ?? "");
  const requestedCondition = normalizeSearchText(filters.condition ?? "");
  const requestedSource = normalizeSearchText(filters.source ?? "");
  const requestedBrand = normalizeSearchText(filters.brand ?? "");
  const requestedCategory = normalizeSearchText(filters.category ?? "");

  let cards = result.rows.flatMap((row) => {
    const priceMinor = positiveInt(row.customer_price_minor);
    if (!priceMinor) return [];
    const msrpMinor = positiveInt(row.msrp_minor);
    const card: BazaarCard = {
      id: row.canonical_public_id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? undefined,
      categoryCode: row.category_code,
      brand: row.brand_name ?? undefined,
      condition: normalizeCondition(row.condition),
      bazaarSource: normalizeBazaarSource(row.bazaar_source),
      priceMinor,
      msrpMinor,
      savingsPercent: savingsPercent(msrpMinor,priceMinor),
      availableToSell: nonNegativeInt(row.available_to_sell),
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name
    };
    return card.availableToSell > 0 ? [card] : [];
  });

  if (query) {
    cards = cards.filter((card) => normalizeSearchText([
      card.title,
      card.description ?? "",
      card.brand ?? "",
      card.categoryCode,
      card.condition,
      card.bazaarSource ?? ""
    ].join(" ")).includes(query));
  }
  if (requestedCondition) cards = cards.filter((card) => normalizeSearchText(card.condition) === requestedCondition);
  if (requestedSource) cards = cards.filter((card) => normalizeSearchText(card.bazaarSource ?? "") === requestedSource);
  if (requestedBrand) cards = cards.filter((card) => normalizeSearchText(card.brand ?? "") === requestedBrand);
  if (requestedCategory) cards = cards.filter((card) => normalizeSearchText(card.categoryCode) === requestedCategory);

  if (!cards.length) return cards;

  try {
    const images = await approvedCatalogImages(cards.map((card) => ({ canonicalVariantId: card.id, preferredVendorId: card.vendorId })));
    const byCanonical = new Map(images.map((image) => [image.canonicalVariantId,image]));
    cards = cards.map((card) => {
      const image = byCanonical.get(card.id);
      return image ? { ...card, mediaId: image.mediaId, mediaAlt: image.altText } : card;
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "bazaar.public_media_projection_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return cards;
}

export async function getBazaarProductBySlug(slug: string): Promise<BazaarCard | undefined> {
  const normalized = slug.trim();
  if (!normalized) return undefined;
  const cards = await getBazaarCatalog({ limit: 1, slugOrId: normalized });
  return cards[0];
}

export function bazaarConditionLabel(condition: BazaarCondition): string {
  switch (condition) {
    case "preloved": return "PRELOVED";
    case "preowned_defect": return "PREOWNED / DEFECT";
    case "open_box": return "OPEN BOX";
    case "new": return "NEW / RETURN";
    case "refurbished": return "REFURBISHED";
    case "used": return "PREOWNED";
  }
}

export function bazaarSourceLabel(source: BazaarSource): string {
  switch (source) {
    case "supplier_preloved": return "Supplier Preloved";
    case "supplier_preowned_defect": return "Supplier Preowned / Defect";
    case "customer_return": return "Επιστροφή πελάτη";
    case "open_box": return "Open box";
    case "display_stock": return "Εκθεσιακό τεμάχιο";
    case "damaged_packaging": return "Φθαρμένη συσκευασία";
    case "admin_curated": return "Επιλεγμένο BAZAAR";
  }
}
