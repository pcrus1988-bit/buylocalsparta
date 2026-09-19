import { unstable_cache } from "next/cache";
import { formatMoney, money } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

type Audience = "women" | "men";

type CandidateRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  brand_name: string | null;
  color: string | null;
  fit: string | null;
  min_price_minor: number | string;
  sizes: string[] | null;
  media_public_id: string | null;
  media_alt: string | null;
  vendor_public_id: string;
  vendor_name: string;
}>;

const WOMEN_CATEGORIES = [
  "fashion-womens-tops",
  "fashion-womens-shirts",
  "fashion-womens-knitwear",
  "fashion-womens-dresses",
  "fashion-womens-jumpsuits",
  "fashion-womens-trousers-jeans",
  "fashion-womens-skirts",
  "fashion-womens-shorts",
  "fashion-womens-jackets-coats",
  "womens-sneakers",
  "womens-formal-shoes",
  "womens-boots",
  "womens-sandals",
  "handbags",
  "sunglasses",
  "belts",
  "scarves-hats-gloves",
  "necklaces",
  "earrings",
  "bracelets",
  "rings",
  "lip-makeup",
  "eye-makeup",
  "face-makeup",
  "fragrance",
  "nail-care-colour"
] as const;

const MEN_CATEGORIES = [
  "fashion-mens-tshirts-tops",
  "fashion-mens-shirts",
  "fashion-mens-knitwear",
  "fashion-mens-trousers-jeans",
  "fashion-mens-shorts",
  "fashion-mens-jackets-coats",
  "mens-sneakers",
  "mens-formal-shoes",
  "mens-boots",
  "mens-sandals",
  "mens-bags",
  "backpacks",
  "sunglasses",
  "belts",
  "scarves-hats-gloves",
  "wallets-cardholders",
  "ties-formal-accessories",
  "fragrance",
  "grooming-care",
  "nail-care-colour"
] as const;

function safeAudience(value: unknown): Audience {
  return value === "men" ? "men" : "women";
}

function safeVendorId(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(candidate)) throw new Error("INVALID_VENDOR");
  return candidate;
}

function safeBrands(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const brand = entry.trim().toLocaleLowerCase("el-GR").slice(0, 160);
    return brand ? [brand] : [];
  }))].slice(0, 5);
}

function safeBudgetMinor(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 5_000_000) : 0;
}

function safeSizes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const size = entry.trim().slice(0, 80);
    return size ? [size] : [];
  }))].slice(0, 40);
}


const loadCandidateRows = unstable_cache(
  async (vendorId: string, audience: Audience): Promise<readonly CandidateRow[]> => {
    const categories = audience === "men" ? MEN_CATEGORIES : WOMEN_CATEGORIES;
    const result = await getProductionPostgresRuntime().nativePool.query<CandidateRow>(`
      WITH vendor AS MATERIALIZED (
        SELECT id, public_id, trading_name
        FROM vendor_businesses
        WHERE public_id=$1
          AND status='active'
        LIMIT 1
      ), vendor_suppliers AS MATERIALIZED (
        SELECT ds.id::text AS supplier_id
        FROM dropship_suppliers ds
        WHERE ds.owner_vendor_id=(SELECT id FROM vendor)
          AND ds.active=true
          AND ds.api_authoritative_availability=true
      ), ranked_families AS MATERIALIZED (
        SELECT
          fm.dropship_supplier_id,
          fm.dropship_external_product_id,
          fm.min_price_minor,
          fm.category_codes[1] AS category_code,
          ROW_NUMBER() OVER (
            PARTITION BY fm.category_codes[1]
            ORDER BY
              CASE
                WHEN $4::bigint<=0 THEN 0
                WHEN fm.min_price_minor<=GREATEST(1000::bigint,$4::bigint/3) THEN 0
                WHEN fm.min_price_minor<=$4::bigint THEN 1
                ELSE 2
              END,
              CASE
                WHEN cardinality($3::text[])=0 THEN 0
                WHEN EXISTS (
                  SELECT 1
                  FROM unnest(fm.brand_names) candidate_brand
                  WHERE lower(candidate_brand)=ANY($3::text[])
                ) THEN 0
                ELSE 1
              END,
              fm.newest_at DESC,
              fm.dropship_supplier_id,
              fm.dropship_external_product_id
          ) AS category_rank
        FROM storefront_dropship_family_read_model fm
        JOIN vendor_suppliers supplier ON supplier.supplier_id=fm.dropship_supplier_id
        WHERE fm.available_until>now()
          AND fm.min_price_minor>0
          AND fm.category_codes && $2::text[]
      ), selected_families AS MATERIALIZED (
        SELECT *
        FROM ranked_families
        WHERE category_rank<=10
      )
      SELECT
        representative.canonical_public_id,
        representative.slug,
        representative.title,
        representative.category_code,
        representative.brand_name,
        COALESCE(NULLIF(representative.color,''),NULLIF(representative.variant_color,'')) AS color,
        representative.fit,
        selected.min_price_minor,
        COALESCE(size_options.sizes,'{}'::text[]) AS sizes,
        media.media_public_id,
        media.alt_text AS media_alt,
        (SELECT public_id FROM vendor) AS vendor_public_id,
        (SELECT trading_name FROM vendor) AS vendor_name
      FROM selected_families selected
      CROSS JOIN LATERAL (
        SELECT
          rm.canonical_variant_id,
          rm.canonical_public_id,
          rm.slug,
          rm.title,
          rm.category_code,
          rm.brand_name,
          rm.color,
          rm.fit,
          cv.variant_attributes->>'color' AS variant_color
        FROM storefront_catalog_read_model rm
        JOIN canonical_variants cv ON cv.id=rm.canonical_variant_id
        WHERE rm.dropship_supplier_id=selected.dropship_supplier_id
          AND rm.dropship_external_product_id=selected.dropship_external_product_id
          AND rm.dropship_sellable=true
          AND rm.dropship_available_until>now()
          AND rm.min_price_minor>0
        ORDER BY rm.min_price_minor ASC,rm.source_updated_at DESC NULLS LAST,rm.canonical_public_id
        LIMIT 1
      ) representative
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT size_value.value ORDER BY size_value.value) AS sizes
        FROM storefront_catalog_read_model sibling
        JOIN canonical_variants sibling_cv ON sibling_cv.id=sibling.canonical_variant_id
        CROSS JOIN LATERAL unnest(ARRAY[
          sibling_cv.variant_attributes->>'italian_size_men',
          sibling_cv.variant_attributes->>'italian_size_women',
          sibling_cv.variant_attributes->>'shoe_size_women',
          sibling_cv.variant_attributes->>'shoe_size_men',
          sibling_cv.variant_attributes->>'waist_size',
          sibling_cv.variant_attributes->>'belt_size',
          sibling_cv.variant_attributes->>'waist_length_size',
          sibling_cv.variant_attributes->>'hat_size',
          sibling_cv.variant_attributes->>'swimwear_sleepwear_size',
          sibling_cv.variant_attributes->>'shoe_size',
          sibling_cv.variant_attributes->>'earrings_size',
          sibling_cv.variant_attributes->>'bracelets_size',
          sibling_cv.variant_attributes->>'gloves_size_women',
          sibling_cv.variant_attributes->>'ring_size',
          sibling_cv.variant_attributes->>'gloves_size_men',
          sibling_cv.variant_attributes->>'size'
        ]) size_value(value)
        WHERE sibling.dropship_supplier_id=selected.dropship_supplier_id
          AND sibling.dropship_external_product_id=selected.dropship_external_product_id
          AND sibling.dropship_sellable=true
          AND sibling.dropship_available_until>now()
          AND NULLIF(BTRIM(size_value.value),'') IS NOT NULL
      ) size_options ON true
      LEFT JOIN LATERAL (
        SELECT pm.public_id AS media_public_id,pm.alt_text
        FROM product_media pm
        WHERE pm.canonical_variant_id=representative.canonical_variant_id
          AND pm.kind='image'
          AND pm.scan_status='clean'
          AND pm.rights_status='approved'
          AND pm.moderation_status='approved'
          AND pm.object_key IS NOT NULL
          AND pm.content_type IN ('image/jpeg','image/png','image/webp')
        ORDER BY
          CASE WHEN pm.vendor_id=(SELECT id FROM vendor) THEN 0 ELSE 1 END,
          pm.sort_order,
          pm.reviewed_at DESC NULLS LAST,
          pm.created_at DESC,
          pm.public_id
        LIMIT 1
      ) media ON true
      ORDER BY selected.category_code,selected.category_rank
    `, [vendorId, [...categories], [], 0]);
    return result.rows;
  },
  ["fitting-room-candidate-pool-v2"],
  { revalidate: 300 }
);

export async function POST(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json({ products: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const vendorId = safeVendorId(body.vendorId);
    const audience = safeAudience(body.audience);
    const brands = safeBrands(body.brands);
    const budgetMinor = safeBudgetMinor(body.budgetMinor);

    const rows = await loadCandidateRows(vendorId, audience);

    const products = rows.flatMap((row) => {
      const priceMinor = Number(row.min_price_minor);
      if (!row.canonical_public_id || !row.slug || !row.title || !row.category_code || !Number.isSafeInteger(priceMinor) || priceMinor <= 0) return [];
      return [{
        id: row.canonical_public_id,
        slug: row.slug,
        title: row.title,
        priceMinor,
        price: formatMoney(money(priceMinor)),
        categoryCode: row.category_code,
        brand: row.brand_name?.trim() || undefined,
        color: row.color?.trim() || undefined,
        sizes: safeSizes(row.sizes),
        fit: row.fit?.trim() || undefined,
        mediaId: row.media_public_id?.trim() || undefined,
        mediaAlt: row.media_alt?.trim() || undefined,
        sourceImageAvailable: !row.media_public_id,
        available: true,
        availableToSell: 1,
        vendorId: row.vendor_public_id,
        vendorName: row.vendor_name
      }];
    });

    products.sort((left, right) => {
      const leftBrand = left.brand?.trim().toLocaleLowerCase("el-GR") ?? "";
      const rightBrand = right.brand?.trim().toLocaleLowerCase("el-GR") ?? "";
      const leftBrandRank = brands.length > 0 && brands.includes(leftBrand) ? 0 : 1;
      const rightBrandRank = brands.length > 0 && brands.includes(rightBrand) ? 0 : 1;
      const leftBudgetRank = budgetMinor > 0 && left.priceMinor <= budgetMinor ? 0 : 1;
      const rightBudgetRank = budgetMinor > 0 && right.priceMinor <= budgetMinor ? 0 : 1;
      return leftBrandRank - rightBrandRank
        || leftBudgetRank - rightBudgetRank
        || left.priceMinor - right.priceMinor;
    });

    return Response.json(
      { vendorId, audience, products },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "fitting_room.candidates_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json(
      { error: "fitting_room_candidates_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "1" } }
    );
  }
}
