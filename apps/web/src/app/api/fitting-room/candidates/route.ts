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
  target_gender: string | null;
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
  "fashion-mens-suits-formal",
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
  "grooming-care"
] as const;

const WOMEN_ONLY_BEAUTY = new Set(["lip-makeup", "eye-makeup", "face-makeup", "nail-care-colour"]);
const MEN_ONLY_BEAUTY = new Set(["grooming-care"]);

function normalizeAudienceText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWomenSignal(value: string): boolean {
  return /(?:^|\s)(?:women|womens|woman|female|lady|ladies|donna|femme|girl)(?:\s|$)|γυναικ/.test(value);
}

function hasMenSignal(value: string): boolean {
  return /(?:^|\s)(?:men|mens|man|male|uomo|homme|boy)(?:\s|$)|ανδρ/.test(value);
}

function candidateMatchesAudience(row: CandidateRow, audience: Audience): boolean {
  const category = normalizeAudienceText(row.category_code);
  if (audience === "men" && WOMEN_ONLY_BEAUTY.has(row.category_code)) return false;
  if (audience === "women" && MEN_ONLY_BEAUTY.has(row.category_code)) return false;
  if (audience === "men" && /(?:^|\s)(?:women|womens|woman|female)(?:\s|$)|γυναικ/.test(category)) return false;
  if (audience === "women" && /(?:^|\s)(?:men|mens|man|male)(?:\s|$)|ανδρ/.test(category)) return false;

  const declared = normalizeAudienceText(row.target_gender);
  if (declared && !/unisex|neutral|all|ολ/.test(declared)) {
    if (audience === "men" && hasWomenSignal(declared) && !hasMenSignal(declared)) return false;
    if (audience === "women" && hasMenSignal(declared) && !hasWomenSignal(declared)) return false;
  }

  const text = normalizeAudienceText([row.title, row.category_code, row.target_gender].filter(Boolean).join(" "));
  const women = hasWomenSignal(text);
  const men = hasMenSignal(text);
  if (audience === "men" && women && !men) return false;
  if (audience === "women" && men && !women) return false;
  return true;
}

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
        SELECT ds.id
        FROM dropship_suppliers ds
        WHERE ds.owner_vendor_id=(SELECT id FROM vendor)
          AND ds.active=true
          AND ds.api_authoritative_availability=true
      ), live_variants AS MATERIALIZED (
        SELECT
          dso.supplier_id,
          dso.external_product_id,
          cv.id AS canonical_variant_id,
          cv.public_id AS canonical_public_id,
          cv.slug,
          COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
          c.code AS category_code,
          COALESCE(b.name,pfb.name) AS brand_name,
          COALESCE(
            NULLIF(BTRIM(el.specifications->>'color'),''),
            NULLIF(BTRIM(en.specifications->>'color'),''),
            NULLIF(BTRIM(cv.variant_attributes->>'color'),'')
          ) AS color,
          COALESCE(
            NULLIF(BTRIM(el.specifications->>'fit'),''),
            NULLIF(BTRIM(en.specifications->>'fit'),'')
          ) AS fit,
          COALESCE(
            NULLIF(BTRIM(cv.variant_attributes->>'gender'),''),
            NULLIF(BTRIM(cv.variant_attributes->>'target_gender'),''),
            NULLIF(BTRIM(el.specifications->>'gender'),''),
            NULLIF(BTRIM(en.specifications->>'gender'),'')
          ) AS target_gender,
          vo.customer_price_minor AS min_price_minor,
          vo.updated_at,
          dso.availability_checked_at,
          ROW_NUMBER() OVER (
            PARTITION BY dso.supplier_id,dso.external_product_id
            ORDER BY
              vo.customer_price_minor ASC,
              dso.availability_checked_at DESC NULLS LAST,
              vo.updated_at DESC,
              cv.public_id
          ) AS family_rank
        FROM dropship_supplier_offers dso
        JOIN vendor_suppliers supplier ON supplier.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN categories c ON c.id=cv.category_id
        JOIN vendor_locations l ON l.id=vo.location_id
        LEFT JOIN product_families pf ON pf.id=cv.family_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN brands pfb ON pfb.id=pf.brand_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE dso.active=true
          AND dso.cached_available=true
          AND COALESCE(dso.cached_quantity,0)>=1
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND vo.vendor_id=(SELECT id FROM vendor)
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND l.active=true
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND c.code=ANY($2::text[])
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
      ), representatives AS MATERIALIZED (
        SELECT *
        FROM live_variants
        WHERE family_rank=1
      ), ranked AS MATERIALIZED (
        SELECT
          representatives.*,
          ROW_NUMBER() OVER (
            PARTITION BY representatives.category_code
            ORDER BY
              representatives.updated_at DESC,
              representatives.availability_checked_at DESC NULLS LAST,
              representatives.min_price_minor ASC,
              representatives.canonical_public_id
          ) AS category_rank
        FROM representatives
      ), selected AS MATERIALIZED (
        SELECT *
        FROM ranked
        WHERE category_rank<=10
      )
      SELECT
        selected.canonical_public_id,
        selected.slug,
        selected.title,
        selected.category_code,
        selected.brand_name,
        selected.color,
        selected.fit,
        selected.target_gender,
        selected.min_price_minor,
        COALESCE(size_options.sizes,'{}'::text[]) AS sizes,
        media.media_public_id,
        media.alt_text AS media_alt,
        (SELECT public_id FROM vendor) AS vendor_public_id,
        (SELECT trading_name FROM vendor) AS vendor_name
      FROM selected
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT size_value.value ORDER BY size_value.value) AS sizes
        FROM dropship_supplier_offers sibling_dso
        JOIN vendor_offers sibling_vo ON sibling_vo.id=sibling_dso.vendor_offer_id
        JOIN canonical_variants sibling_cv ON sibling_cv.id=sibling_vo.canonical_variant_id
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
        WHERE sibling_dso.supplier_id=selected.supplier_id
          AND sibling_dso.external_product_id=selected.external_product_id
          AND sibling_dso.active=true
          AND sibling_dso.cached_available=true
          AND COALESCE(sibling_dso.cached_quantity,0)>=1
          AND sibling_dso.availability_expires_at>now()
          AND sibling_vo.status='approved'
          AND sibling_vo.merchant_visible=true
          AND sibling_vo.merchant_pause_active=false
          AND sibling_vo.customer_price_minor>0
          AND NULLIF(BTRIM(size_value.value),'') IS NOT NULL
      ) size_options ON true
      LEFT JOIN LATERAL (
        SELECT pm.public_id AS media_public_id,pm.alt_text
        FROM product_media pm
        WHERE pm.canonical_variant_id=selected.canonical_variant_id
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
    `, [vendorId, [...categories]]);
    return result.rows;
  },
  ["fitting-room-candidate-pool-v6-occasion-aware"],
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
      if (!candidateMatchesAudience(row, audience)) return [];
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
