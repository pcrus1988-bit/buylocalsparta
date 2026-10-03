import { normalizeSearchText } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages } from "./public-media-service";
import { publicDescriptionText } from "./public-description-text";

export type BazaarCondition = "preloved" | "preowned_defect" | "open_box" | "new" | "refurbished" | "used";
export type BazaarSource =
  | "supplier_preloved"
  | "supplier_preowned_defect"
  | "supplier_tester"
  | "supplier_sample"
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
  brandLogoObjectKey?: string;
  condition: BazaarCondition;
  bazaarSource?: BazaarSource;
  priceMinor: number;
  msrpMinor?: number;
  savingsPercent?: number;
  availableToSell: number;
  vendorId: string;
  vendorName: string;
  supplierFulfilled: boolean;
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
  brand_logo_object_key: string | null;
  condition: string;
  bazaar_source: string | null;
  customer_price_minor: number | string;
  msrp_minor: number | string | null;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
  supplier_fulfilled: boolean;
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
  "supplier_tester",
  "supplier_sample",
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
  const queryText = filters.query?.trim() || null;
  const condition = filters.condition?.trim() || null;
  const requestedSource = filters.source?.trim() || null;
  const brand = filters.brand?.trim() || null;
  const category = filters.category?.trim() || null;
  const result = await getProductionPostgresRuntime().nativePool.query<BazaarRow>(`
    SELECT
      brm.canonical_public_id,
      brm.slug,
      brm.title,
      brm.description,
      brm.category_code,
      brm.brand_name,
      brm.brand_logo_object_key,
      brm.condition,
      brm.bazaar_source,
      brm.customer_price_minor,
      brm.msrp_minor,
      brm.available_to_sell,
      brm.vendor_public_id,
      brm.vendor_name,
      brm.supplier_fulfilled
    FROM public.storefront_bazaar_read_model brm
    WHERE (NOT brm.supplier_fulfilled OR brm.available_until>now())
      AND ($2::text IS NULL OR brm.slug=$2 OR brm.canonical_public_id=$2)
      AND ($3::text IS NULL OR
        brm.title ILIKE '%' || $3 || '%' OR
        COALESCE(brm.description,'') ILIKE '%' || $3 || '%' OR
        COALESCE(brm.brand_name,'') ILIKE '%' || $3 || '%' OR
        brm.category_code ILIKE '%' || $3 || '%' OR
        brm.condition ILIKE '%' || $3 || '%' OR
        COALESCE(brm.bazaar_source,'') ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR brm.condition=$4)
      AND ($5::text IS NULL OR brm.bazaar_source=$5)
      AND ($6::text IS NULL OR brm.brand_name=$6)
      AND ($7::text IS NULL OR brm.category_code=$7)
    ORDER BY brm.canonical_variant_id
    LIMIT $1
  `,[limit,slugOrId,queryText,condition,requestedSource,brand,category]);

  const query = normalizeSearchText(filters.query ?? "");

  let cards = result.rows.flatMap((row) => {
    const priceMinor = positiveInt(row.customer_price_minor);
    if (!priceMinor) return [];
    const msrpMinor = positiveInt(row.msrp_minor);
    const card: BazaarCard = {
      id: row.canonical_public_id,
      slug: row.slug,
      title: row.title,
      description: publicDescriptionText(row.description),
      categoryCode: row.category_code,
      brand: row.brand_name ?? undefined,
      brandLogoObjectKey: row.brand_logo_object_key ?? undefined,
      condition: normalizeCondition(row.condition),
      bazaarSource: normalizeBazaarSource(row.bazaar_source),
      priceMinor,
      msrpMinor,
      savingsPercent: savingsPercent(msrpMinor,priceMinor),
      availableToSell: nonNegativeInt(row.available_to_sell),
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      supplierFulfilled: row.supplier_fulfilled === true
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

// Discovery data may be a few minutes stale; cart and order actions revalidate
// current supplier/local availability before accepting the item.
const BAZAAR_CATALOG_CACHE_SECONDS = 300;

const cachedBazaarCatalog = unstable_cache(
  async (
    query: string,
    condition: string,
    source: string,
    brand: string,
    category: string,
    limit: number,
    slugOrId: string
  ): Promise<readonly BazaarCard[]> => getBazaarCatalog({
    query,
    condition,
    source,
    brand,
    category,
    limit,
    slugOrId
  }),
  ["public-bazaar-catalog-v3-read-model"],
  { revalidate: BAZAAR_CATALOG_CACHE_SECONDS }
);

export async function getCachedBazaarCatalog(filters: BazaarFilters = {}): Promise<readonly BazaarCard[]> {
  const limit = Math.max(1, Math.min(500, Number.isSafeInteger(filters.limit) ? Number(filters.limit) : 240));
  return cachedBazaarCatalog(
    filters.query?.trim().slice(0, 160) ?? "",
    filters.condition?.trim().slice(0, 80) ?? "",
    filters.source?.trim().slice(0, 80) ?? "",
    filters.brand?.trim().slice(0, 160) ?? "",
    filters.category?.trim().slice(0, 160) ?? "",
    limit,
    filters.slugOrId?.trim().slice(0, 220) ?? ""
  );
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
    case "supplier_tester": return "Tester προμηθευτή";
    case "supplier_sample": return "Sample προμηθευτή";
    case "customer_return": return "Επιστροφή πελάτη";
    case "open_box": return "Open box";
    case "display_stock": return "Εκθεσιακό τεμάχιο";
    case "damaged_packaging": return "Φθαρμένη συσκευασία";
    case "admin_curated": return "Επιλογή BAZAAR";
  }
}

export function bazaarDisplayConditionLabel(condition: BazaarCondition, source?: BazaarSource): string {
  if (source === "supplier_tester") return "TESTER";
  if (source === "supplier_sample") return "SAMPLE";
  return bazaarConditionLabel(condition);
}

export function bazaarProductDisclosure(source?: BazaarSource): string | undefined {
  if (source === "supplier_tester") {
    return "Προϊόν TESTER: έχει ανοιχτεί για δοκιμή και ενδέχεται να έχει χρησιμοποιηθεί ελαφρά. Η πραγματική ποσότητα μπορεί να είναι μικρότερη από την ονομαστική αναγραφόμενη ποσότητα.";
  }
  if (source === "supplier_sample") {
    return "Προϊόν SAMPLE: πρόκειται για μικρό δείγμα του αρχικού προϊόντος, σε μικρότερη συσκευασία ή ποσότητα από την κανονική εμπορική έκδοση.";
  }
  return undefined;
}

export function bazaarProductNoticeTitle(source?: BazaarSource): string | undefined {
  if (source === "supplier_tester") return "TESTER · Ανοιγμένο προϊόν";
  if (source === "supplier_sample") return "SAMPLE · Μικρό δείγμα προϊόντος";
  return undefined;
}

export function bazaarProductNoticeSummary(source?: BazaarSource): string | undefined {
  if (source === "supplier_tester") return "Ανοιγμένο προϊόν · πιθανή απόκλιση από την ονομαστική ποσότητα.";
  if (source === "supplier_sample") return "Μικρό δείγμα της κανονικής εμπορικής έκδοσης.";
  return undefined;
}
